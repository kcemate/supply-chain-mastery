import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const port=await availablePort(),origin=`http://127.0.0.1:${port}`,log:string[]=[];
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:process.cwd(),stdio:'pipe'});capture(server,log);
const browser=await chromium.launch({headless:true});
try{
  await wait(origin,log);const context=await browser.newContext();const page=await context.newPage();page.setDefaultTimeout(5000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto(`${origin}/tests/workspace-context-harness.html`,{waitUntil:'domcontentloaded'});
  const value=(id:string)=>page.getByTestId(id);
  await expectText(value('connected'),'false');await expectText(value('client-url'),'none');

  // A provider failure during connect cannot create a phantom client or connected document.
  await page.getByRole('button',{name:'Fail next workspace read'}).click();await page.getByRole('button',{name:'Connect A'}).click();
  await expectMatch(value('action'),/connect error: Provider workspace read failed/);await expectText(value('connected'),'false');await expectText(value('client-url'),'none');await expectText(value('activity'),'idle');

  await page.getByRole('button',{name:'Connect A'}).click();await expectText(value('connected'),'true');await expectText(value('client-url'),'http://127.0.0.1:4101');await expectText(value('first-location'),'A facility r1');
  await expectText(value('runs'),'A run');

  // A failed reload retains the last valid connection and clears read activity.
  await page.getByRole('button',{name:'Fail next workspace read'}).click();await page.getByRole('button',{name:'Reload'}).click();
  await expectMatch(value('action'),/reload error: Provider workspace read failed/);await expectText(value('connected'),'true');await expectText(value('client-url'),'http://127.0.0.1:4101');await expectText(value('activity'),'idle');

  // Mutations are rejected while a reload read is active, then work again afterward.
  await page.getByRole('button',{name:'Hold next workspace read'}).click();await page.getByRole('button',{name:'Reload'}).click();await expectText(value('activity'),'reloading');
  await page.getByRole('button',{name:'Mutate'}).click();await expectText(value('mutation'),'blocked');await expectMatch(value('workspace-error'),/reload to finish/);
  await page.getByRole('button',{name:'Release A r2'}).click();await expectText(value('activity'),'idle');await expectText(value('first-location'),'A facility r2');

  // Disconnect aborts an in-flight reload. A provider that resolves late cannot reconnect it.
  await page.getByRole('button',{name:'Hold next workspace read'}).click();await page.getByRole('button',{name:'Reload'}).click();await expectText(value('activity'),'reloading');
  await page.getByRole('button',{name:'Disconnect'}).click();await expectText(value('connected'),'false');await expectText(value('client-url'),'none');await expectText(value('activity'),'idle');
  await page.getByRole('button',{name:'Release A r99'}).click();await page.waitForTimeout(50);await expectText(value('connected'),'false');await expectText(value('client-url'),'none');
  await page.getByRole('button',{name:'Mutate'}).click();await expectText(value('mutation'),'saved');await expectText(value('revision'),'1');

  // A stale reload from A cannot overwrite a newly connected B workspace.
  await page.getByRole('button',{name:'Connect A'}).click();await expectText(value('first-location'),'A facility r1');
  await page.getByRole('button',{name:'Hold next workspace read'}).click();await page.getByRole('button',{name:'Reload'}).click();await page.getByRole('button',{name:'Disconnect'}).click();
  await page.getByRole('button',{name:'Connect B'}).click();await expectText(value('client-url'),'http://127.0.0.1:4102');await expectText(value('first-location'),'B facility r1');
  await page.getByRole('button',{name:'Release A r99'}).click();await page.waitForTimeout(50);await expectText(value('client-url'),'http://127.0.0.1:4102');await expectText(value('first-location'),'B facility r1');

  // Late run history from B is ignored after the hook swaps to client A.
  await expectText(value('runs'),'B run');await page.getByRole('button',{name:'Hold next runs read'}).click();await page.getByRole('button',{name:'Refresh runs'}).click();await expectText(value('runs-loading'),'true');
  await page.getByRole('button',{name:'Disconnect'}).click();await page.getByRole('button',{name:'Connect A'}).click();await expectText(value('runs'),'A run');
  await page.getByRole('button',{name:'Release B runs'}).click();await page.waitForTimeout(50);await expectText(value('runs'),'A run');await expectText(value('runs-error'),'none');

  // A retry response from the disconnected A client cannot enter wait/active state on B.
  await page.getByRole('button',{name:'Hold next retry'}).click();await page.getByRole('button',{name:'Retry current'}).click();await expectText(value('active-run'),'none');
  await page.getByRole('button',{name:'Disconnect'}).click();await page.getByRole('button',{name:'Connect B'}).click();await expectText(value('runs'),'B run');
  await page.getByRole('button',{name:'Release A retry'}).click();await expectMatch(value('retry-outcome'),/Workspace changed during retry/);await expectText(value('active-run'),'none');await expectText(value('runs'),'B run');

  // A held poll is aborted during a client swap and cannot replace the new client's watch.
  await page.getByRole('button',{name:'Hold next run detail'}).click();await page.getByRole('button',{name:'Watch old'}).click();await expectText(value('active-run'),'B old-watch');
  await page.getByRole('button',{name:'Disconnect'}).click();await page.getByRole('button',{name:'Connect A'}).click();await expectText(value('runs'),'A run');
  await page.getByRole('button',{name:'Hold next run detail'}).click();await page.getByRole('button',{name:'Watch new'}).click();await expectText(value('active-run'),'A new-watch');
  await page.getByRole('button',{name:'Release B old watch'}).click();await expectText(value('active-run'),'A new-watch');await expectMatch(value('runs'),/A new-watch/);
  await page.getByRole('button',{name:'Release A new watch'}).click();await expectText(value('active-run'),'none');await expectText(value('watch-outcome'),'Result A new-watch');

  // Starting a newer watch on the same client aborts the older poll; its finally block cannot clear the newer active run.
  await page.getByRole('button',{name:'Hold next run detail'}).click();await page.getByRole('button',{name:'Watch old'}).click();await expectText(value('active-run'),'A old-watch');
  await page.getByRole('button',{name:'Hold next run detail'}).click();await page.getByRole('button',{name:'Watch new'}).click();await expectText(value('active-run'),'A new-watch');
  await page.getByRole('button',{name:'Release A old watch'}).click();await expectText(value('active-run'),'A new-watch');
  await page.getByRole('button',{name:'Release A new watch'}).click();await expectText(value('active-run'),'none');await expectText(value('watch-outcome'),'Result A new-watch');
  assert.deepEqual(errors,[],`Harness browser errors:\n${errors.join('\n')}`);
  console.log('Workspace context browser regression passed: connection failures, mutation exclusion, disconnect abort, stale workspace/history/retry responses, client-swapped polling, and same-client watch replacement were exercised through the real hooks.');
  await context.close();
}finally{await browser.close();await stop(server);}

async function expectText(locator:ReturnType<import('playwright').Page['getByTestId']>,expected:string){
  await locator.waitFor();
  for(let attempt=0;attempt<100;attempt++){
    if(await locator.textContent()===expected)return;
    await delay(25);
  }
  assert.equal(await locator.textContent(),expected);
}
async function expectMatch(locator:ReturnType<import('playwright').Page['getByTestId']>,expected:RegExp){
  await locator.waitFor();
  for(let attempt=0;attempt<100;attempt++){
    const actual=await locator.textContent()||'';
    if(expected.test(actual))return;
    await delay(25);
  }
  assert.match(await locator.textContent()||'',expected);
}
function capture(process:ChildProcess,output:string[]){process.stdout?.on('data',(chunk:Buffer)=>output.push(chunk.toString()));process.stderr?.on('data',(chunk:Buffer)=>output.push(chunk.toString()));}
async function stop(process:ChildProcess){if(process.exitCode!=null)return;process.kill('SIGTERM');await Promise.race([new Promise<void>(resolve=>process.once('exit',()=>resolve())),delay(1000)]);if(process.exitCode==null)process.kill('SIGKILL');}
async function availablePort(){return new Promise<number>((resolve,reject)=>{const probe=createServer();probe.once('error',reject);probe.listen(0,'127.0.0.1',()=>{const address=probe.address();if(!address||typeof address==='string')return reject(new Error('No test port.'));probe.close(()=>resolve(address.port));});});}
async function wait(url:string,output:string[]){for(let i=0;i<100;i++){try{if((await fetch(url)).ok)return;}catch{}await delay(50);}throw new Error(`Harness server failed.\n${output.join('')}`);}
