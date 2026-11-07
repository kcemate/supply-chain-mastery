import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Evidence, Lane, ProductCategory, ScenarioDefinition, TwinLocation } from '../src/flywayTypes';
import { initialLanes, initialLocations } from '../src/flywayData';
import { executeEngineWorker } from '../server/engineWorkerClient';
import { FilePlatformStore } from '../server/fileStore';
import { closeServer, createPlatformHttpServer, listenOnRandomLoopback } from '../server/httpServer';
import { PlatformService, type EngineAdapter } from '../server/platformService';
import type { PlatformStore } from '../server/storage';
import type { ArtifactReference, PlatformDatabase, RunRecord } from '../server/types';

const ownerToken = 'platform-worker-test-owner-token-32-characters';
const products: ProductCategory[] = ['Chicken', 'Produce', 'Buns & bakery', 'Packaging', 'Beverages', 'Cooking oil', 'Equipment'];
const evidence: Evidence = { classification: 'synthetic', confidence: null, sourceTitle: 'Worker isolation test', publisher: 'Flyway', verifiedAt: '2026-09-04' };

function nationalFixture() {
  const locations: TwinLocation[] = [];
  const lanes: Lane[] = [];
  for (let supplier = 0; supplier < 100; supplier += 1) locations.push({
    id: `s${supplier}`, type: 'supplier', name: `Supplier ${supplier}`, city: 'Test', state: 'GA', address: `${supplier} Supplier Way`, latitude: 30 + supplier / 100, longitude: -90,
    status: 'active', products, weeklyCapacity: 35_000, productPolicies: products.map((product) => ({ product, baseUnit: 'case', weeklyProductionCapacity: 5_000 })), evidence, operatingSchedule: 'Daily',
  });
  for (let dc = 0; dc < 25; dc += 1) {
    locations.push({
      id: `d${dc}`, type: 'dc', name: `DC ${dc}`, city: 'Test', state: 'GA', address: `${dc} Distribution Way`, latitude: 32 + dc / 100, longitude: -88,
      status: 'active', products, weeklyCapacity: 14_000, productPolicies: products.map((product) => ({ product, baseUnit: 'case', openingInventory: 1_400, storageCapacity: 7_000, safetyStock: 700, reorderPoint: 1_400, orderUpTo: 5_600, leadTimeDays: 1 })), evidence, operatingSchedule: 'Daily',
    });
    for (let index = 0; index < 4; index += 1) {
      const supplier = dc * 4 + index;
      lanes.push({ id: `s${supplier}-d${dc}`, originId: `s${supplier}`, destinationId: `d${dc}`, products, miles: 100 + index * 10, transitHours: 3, deliveriesPerWeek: 7, costPerMile: 2.5, status: 'active', weeklyCapacity: 100_000, evidence });
    }
  }
  for (let restaurant = 0; restaurant < 3_500; restaurant += 1) {
    const dc = restaurant % 25;
    locations.push({
      id: `r${restaurant}`, type: 'restaurant', name: `Restaurant ${restaurant}`, city: 'Test', state: 'GA', address: `${restaurant} Restaurant Way`, latitude: 33 + (restaurant % 100) / 1_000, longitude: -84,
      status: 'active', products, weeklyDemand: 70, productPolicies: products.map((product) => ({ product, baseUnit: 'case', weeklyDemand: 10 })), assignedDcId: `d${dc}`, evidence, operatingSchedule: 'Daily',
    });
    lanes.push({ id: `d${dc}-r${restaurant}`, originId: `d${dc}`, destinationId: `r${restaurant}`, products, miles: 20 + restaurant % 80, transitHours: 2, deliveriesPerWeek: 7, costPerMile: 2.4, status: 'active', weeklyCapacity: 100, evidence });
  }
  return { locations, lanes };
}

const scenario: ScenarioDefinition = {
  id: 'worker-isolation-scale', name: 'Worker isolation scale run', description: 'Exercises actual national-size deterministic execution.',
  type: 'price-change', targetId: 'network', magnitude: 0, grain: 'weekly', horizon: 4,
  createdAt: '2026-09-04T12:00:00.000Z', baselineRevision: 'worker-isolation-test', startDate: '2026-09-07', changes: [],
};

async function request<T>(origin:string, path:string, options:RequestInit={}) {
  const headers = new Headers(options.headers);
  headers.set('authorization', `Bearer ${ownerToken}`);
  if (options.body) headers.set('content-type','application/json');
  const response = await fetch(`${origin}${path}`,{...options,headers});
  return {response,body:await response.json() as T};
}

async function waitForStatus(origin:string,id:string,status:RunRecord['status'],timeoutMs=15_000) {
  const started=performance.now();
  while(performance.now()-started<timeoutMs){
    const current=await request<{run:RunRecord}>(origin,`/api/v1/runs/${id}`);
    if(current.body.run.status===status)return current.body.run;
    await new Promise(resolve=>setTimeout(resolve,25));
  }
  throw new Error(`Run ${id} did not reach ${status}.`);
}

class DelegatingStore implements PlatformStore {
  constructor(readonly base:FilePlatformStore) {}
  initialize(){return this.base.initialize();}
  read(){return this.base.read();}
  transaction<T>(mutator:(database:PlatformDatabase)=>T|Promise<T>){return this.base.transaction(mutator);}
  writeArtifact(kind:'inputs'|'outputs'|'evidence',value:unknown){return this.base.writeArtifact(kind,value);}
  readArtifact<T>(relativePath:string){return this.base.readArtifact<T>(relativePath);}
  deleteOutputArtifactIfUnreferenced(relativePath:string){return this.base.deleteOutputArtifactIfUnreferenced(relativePath);}
}

async function waitForStoredStatus(store:FilePlatformStore,id:string,status:RunRecord['status'],timeoutMs=5_000){
  const started=performance.now();
  while(performance.now()-started<timeoutMs){const run=(await store.read()).runs[id];if(run?.status===status)return run;await new Promise(resolve=>setTimeout(resolve,10));}
  throw new Error(`Stored run ${id} did not reach ${status}.`);
}

// Abort acknowledgement waits for the worker's physical termination promise.
let releaseTermination!:(code:number)=>void;
let terminationCalled=false;
class DeferredTerminationWorker extends EventEmitter {
  terminate(){terminationCalled=true;return new Promise<number>(resolve=>{releaseTermination=resolve;});}
}
const deferredWorker=new DeferredTerminationWorker();
const terminationController=new AbortController();
let terminationSettled=false;
const termination=executeEngineWorker({},terminationController.signal,{createWorker:()=>deferredWorker}).finally(()=>{terminationSettled=true;});
terminationController.abort();
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(terminationCalled,true);
assert.equal(terminationSettled,false,'Execution must remain unsettled until worker.terminate() confirms exit.');
releaseTermination(1);
await assert.rejects(termination,/cancelled/i);
assert.equal(terminationSettled,true);

const smallScenario:ScenarioDefinition={id:'lifecycle-small',name:'Lifecycle test',description:'Deterministic lifecycle fixture',type:'dc-outage',targetId:'dc-cartersville',magnitude:100,grain:'weekly',horizon:1,createdAt:'2026-09-04T12:00:00.000Z',baselineRevision:'lifecycle',startDate:'2026-09-07'};

// Platform shutdown itself must remain pending until termination is confirmed,
// then durably return the interrupted run to the queue.
let releaseServiceTermination!:(code:number)=>void;
let markServiceExecutionStarted!:()=>void;
const serviceExecutionStarted=new Promise<void>(resolve=>{markServiceExecutionStarted=resolve;});
const shutdownWorker=new class extends EventEmitter {terminate(){return new Promise<number>(resolve=>{releaseServiceTermination=resolve;});}}();
const shutdownAdapter:EngineAdapter={
  async freeze(input){return structuredClone(input);},
  async execute(input,signal){markServiceExecutionStarted();return executeEngineWorker(input,signal,{createWorker:()=>shutdownWorker});},
};
const shutdownDirectory=await mkdtemp(join(tmpdir(),'flyway-worker-delayed-shutdown-'));
const shutdownBase=new FilePlatformStore({dataDirectory:shutdownDirectory,initialLocations,initialLanes});
const shutdownService=new PlatformService(shutdownBase,shutdownAdapter);
await shutdownService.initialize();
const shutdownRun=(await shutdownService.createRun({scenario:smallScenario,expectedWorkspaceRevision:1,idempotencyKey:'delayed-shutdown-create-0001',correlationId:'delayed-shutdown-correlation'})).run;
await serviceExecutionStarted;
let shutdownSettled=false;
const delayedShutdown=shutdownService.shutdown().finally(()=>{shutdownSettled=true;});
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(shutdownSettled,false,'Platform shutdown must wait for worker termination acknowledgement.');
releaseServiceTermination(1);
await delayedShutdown;
assert.equal(shutdownSettled,true);
assert.equal((await shutdownBase.read()).runs[shutdownRun.id].status,'queued');

// A failure before a queued run is claimed becomes a durable retryable failure
// and a controlled degraded health state, not an unhandled rejection.
const sensitiveQueueFailure='Injected queue read failure: postgresql://runtime-secret@internal.example/flyway';
class FailQueuedReadStore extends DelegatingStore {
  armed=false;
  async read(){const value=await this.base.read();if(this.armed&&Object.values(value.runs).some(run=>run.status==='queued')){this.armed=false;throw new Error(sensitiveQueueFailure);}return value;}
}
const failedDirectory=await mkdtemp(join(tmpdir(),'flyway-worker-queue-failure-'));
const failedBase=new FilePlatformStore({dataDirectory:failedDirectory,initialLocations,initialLanes});
const failedStore=new FailQueuedReadStore(failedBase);
const failedService=new PlatformService(failedStore);
await failedService.initialize();
failedStore.armed=true;
const failedRun=(await failedService.createRun({scenario:smallScenario,expectedWorkspaceRevision:1,idempotencyKey:'queue-failure-create-0001',correlationId:'queue-failure-correlation'})).run;
const durableFailure=await waitForStoredStatus(failedBase,failedRun.id,'failed');
assert.equal(durableFailure.error?.code,'queue_processing_failed');
assert.equal(durableFailure.error?.retryable,true);
assert.equal(failedService.healthStatus().status,'degraded');
const failedServer=createPlatformHttpServer({service:failedService,ownerToken});
const failedOrigin=(await listenOnRandomLoopback(failedServer)).origin;
const degradedResponse=await fetch(`${failedOrigin}/api/v1/health`);
assert.equal(degradedResponse.status,503);
const degradedHealth=await degradedResponse.json() as {status:string;code:string;timestamp:string;queue:{status:string;code:string}};
assert.equal(degradedHealth.queue.status,'degraded');
assert.equal(degradedHealth.code,'queue_processing_failed');
assert.equal(degradedHealth.queue.code,'queue_processing_failed');
assert.ok(Number.isFinite(Date.parse(degradedHealth.timestamp)));
assert.equal(JSON.stringify(degradedHealth).includes('runtime-secret'),false,'Unauthenticated health must not disclose internal store errors or credentials.');
await closeServer(failedServer);
await failedService.shutdown();

// Cancellation after an output file is written but before its run reference is
// committed removes the unreferenced content-addressed artifact.
class DelayedOutputStore extends DelegatingStore {
  outputWritten:Promise<void>;
  private markOutputWritten!:()=>void;
  private releaseOutput!:()=>void;
  private outputRelease:Promise<void>;
  constructor(base:FilePlatformStore){super(base);this.outputWritten=new Promise(resolve=>{this.markOutputWritten=resolve;});this.outputRelease=new Promise(resolve=>{this.releaseOutput=resolve;});}
  async writeArtifact(kind:'inputs'|'outputs'|'evidence',value:unknown):Promise<ArtifactReference>{const reference=await this.base.writeArtifact(kind,value);if(kind==='outputs'){this.markOutputWritten();await this.outputRelease;}return reference;}
  release(){this.releaseOutput();}
}
const commitRaceDirectory=await mkdtemp(join(tmpdir(),'flyway-worker-commit-race-'));
const commitRaceBase=new FilePlatformStore({dataDirectory:commitRaceDirectory,initialLocations,initialLanes});
const commitRaceStore=new DelayedOutputStore(commitRaceBase);
const commitRaceService=new PlatformService(commitRaceStore);
await commitRaceService.initialize();
const commitRaceRun=(await commitRaceService.createRun({scenario:{...smallScenario,id:'commit-race'},expectedWorkspaceRevision:1,idempotencyKey:'commit-race-create-0001',correlationId:'commit-race-correlation'})).run;
await commitRaceStore.outputWritten;
await commitRaceService.cancelRun(commitRaceRun.id,'commit-race-cancel-0001','commit-race-cancel-correlation');
commitRaceStore.release();
const cancelledDuringCommit=await waitForStoredStatus(commitRaceBase,commitRaceRun.id,'cancelled');
assert.equal(cancelledDuringCommit.outputArtifact,undefined);
assert.deepEqual(await readdir(join(commitRaceDirectory,'artifacts','outputs')),[]);
await commitRaceService.shutdown();

const fixture=nationalFixture();
const directory=await mkdtemp(join(tmpdir(),'flyway-worker-isolation-'));
const store=new FilePlatformStore({dataDirectory:directory,initialLocations:fixture.locations,initialLanes:fixture.lanes});
const service=new PlatformService(store);
await service.initialize();
const server=createPlatformHttpServer({service,ownerToken});
const {origin}=await listenOnRandomLoopback(server);

try {
  const created=await request<RunRecord>(origin,'/api/v1/runs',{method:'POST',headers:{'idempotency-key':'worker-scale-create-0001'},body:JSON.stringify({scenario,expectedWorkspaceRevision:1})});
  assert.equal(created.response.status,202);
  await waitForStatus(origin,created.body.id,'running');
  await new Promise(resolve=>setTimeout(resolve,1_000));
  assert.equal((await request<{run:RunRecord}>(origin,`/api/v1/runs/${created.body.id}`)).body.run.status,'running');

  const healthStarted=performance.now();
  const healthResponse=await fetch(`${origin}/api/v1/health`);
  const healthLatencyMs=performance.now()-healthStarted;
  assert.equal(healthResponse.status,200);
  assert.ok(healthLatencyMs<1_500,`Health response took ${Math.round(healthLatencyMs)}ms while the engine worker was busy.`);

  const statusStarted=performance.now();
  const statusResponse=await request<{run:RunRecord}>(origin,`/api/v1/runs/${created.body.id}`);
  const statusLatencyMs=performance.now()-statusStarted;
  assert.equal(statusResponse.body.run.status,'running');
  assert.ok(statusLatencyMs<3_000,`Run status response took ${Math.round(statusLatencyMs)}ms while the engine worker was busy.`);

  const cancelled=await request<RunRecord>(origin,`/api/v1/runs/${created.body.id}/cancel`,{method:'POST',headers:{'idempotency-key':'worker-scale-cancel-0001'}});
  assert.equal(cancelled.response.status,202);
  assert.equal(cancelled.body.cancelRequested,true);
  const final=await waitForStatus(origin,created.body.id,'cancelled',5_000);
  assert.equal(final.outputChecksum,undefined);
  assert.equal((await store.read()).runs[created.body.id].outputArtifact,undefined);
  const outputFiles=await readdir(join(directory,'artifacts','outputs')).catch((error:NodeJS.ErrnoException)=>error.code==='ENOENT'?[]:Promise.reject(error));
  assert.deepEqual(outputFiles,[]);

  const shutdownCreated=await request<RunRecord>(origin,'/api/v1/runs',{method:'POST',headers:{'idempotency-key':'worker-shutdown-create-0001'},body:JSON.stringify({scenario:{...scenario,id:'worker-shutdown-scale'},expectedWorkspaceRevision:1})});
  await waitForStatus(origin,shutdownCreated.body.id,'running');
  await new Promise(resolve=>setTimeout(resolve,500));
  await service.shutdown();
  const interrupted=(await store.read()).runs[shutdownCreated.body.id];
  assert.equal(interrupted.status,'queued');
  assert.equal(interrupted.outputArtifact,undefined);
  assert.match(interrupted.events.at(-1)?.message||'',/queued for recovery/i);
  console.log(JSON.stringify({fixture:{locations:fixture.locations.length,lanes:fixture.lanes.length,products:products.length,horizonWeeks:scenario.horizon},healthLatencyMs:Math.round(healthLatencyMs),statusLatencyMs:Math.round(statusLatencyMs),cancelled:true,outputArtifacts:outputFiles.length,shutdownCleanup:'requeued'}));
} finally {
  await closeServer(server);
  await service.shutdown();
}
