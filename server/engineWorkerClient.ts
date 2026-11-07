import { Worker } from 'node:worker_threads';
import type { RunInputV2, ScenarioResult } from '../src/flywayTypes';
import type { PublishedRunArtifacts, RunArtifactBuildOptions, RunArtifactReference, RunArtifactWriter } from '../src/runArtifacts';

type WorkerMessage =
  | { type: 'started' }
  | { type: 'result'; output: ScenarioResult }
  | { type: 'artifact'; requestId: number; value: unknown }
  | { type: 'artifacts-result'; publication: PublishedRunArtifacts }
  | { type: 'error'; error: { name: string; message: string; stack?: string } };

interface WorkerHandle {
  on(event:'message',listener:(message:WorkerMessage)=>void):this;
  on(event:'error',listener:(error:Error)=>void):this;
  on(event:'exit',listener:(code:number)=>void):this;
  removeAllListeners():this;
  terminate():Promise<number>;
  postMessage?(message: unknown):void;
}

export interface EngineWorkerExecutionOptions {
  createWorker?: (input:unknown)=>WorkerHandle;
}

export interface EngineWorkerArtifactExecutionOptions extends EngineWorkerExecutionOptions {
  build?: RunArtifactBuildOptions;
}

export class EngineExecutionAbortedError extends Error {
  constructor() {
    super('Engine execution was cancelled.');
    this.name = 'AbortError';
  }
}

export function executeEngineWorker(input: unknown, signal?: AbortSignal, options:EngineWorkerExecutionOptions={}): Promise<ScenarioResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new EngineExecutionAbortedError());
      return;
    }

    const worker:WorkerHandle = options.createWorker?.(input) || new Worker(new URL('./engineExecution.worker.mjs', import.meta.url), { workerData: input });
    let settled = false;
    let terminating = false;

    const cleanup = () => {
      signal?.removeEventListener('abort', abort);
      worker.removeAllListeners();
    };
    const finish = (operation: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      operation();
    };
    const abort = () => {
      if (settled || terminating) return;
      terminating = true;
      cleanup();
      void worker.terminate().then(
        () => { settled = true; reject(new EngineExecutionAbortedError()); },
        (error) => { settled = true; reject(error); },
      );
    };

    signal?.addEventListener('abort', abort, { once: true });
    worker.on('message', (message: WorkerMessage) => {
      if (terminating) return;
      if (message.type === 'started') return;
      if (message.type === 'result') {
        finish(() => resolve(message.output));
        return;
      }
      if (message.type !== 'error') {
        finish(() => reject(new Error('Engine worker returned an unsupported artifact message.')));
        void worker.terminate();
        return;
      }
      const error = new Error(message.error.message);
      error.name = message.error.name;
      if (message.error.stack) error.stack = message.error.stack;
      finish(() => reject(error));
    });
    worker.on('error', (error) => { if (!terminating) finish(() => reject(error)); });
    worker.on('exit', (code) => {
      if (!settled && !terminating) finish(() => reject(new Error(code === 0 ? 'Engine worker exited without returning a result.' : `Engine worker exited with code ${code}.`)));
    });
  });
}

/**
 * Runs the engine in isolation while publishing one bounded artifact at a time.
 * The worker waits for each durable writer acknowledgement before emitting the
 * next payload, and writes the manifest last. A rejected/aborted execution never
 * returns a publishable manifest reference; already-written chunks are orphans
 * for the store's delayed reachability collector.
 */
export function executeEngineWorkerToArtifacts(
  input: RunInputV2,
  inputArtifact: RunArtifactReference,
  writeArtifact: RunArtifactWriter,
  signal?: AbortSignal,
  options: EngineWorkerArtifactExecutionOptions = {},
): Promise<PublishedRunArtifacts> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new EngineExecutionAbortedError());
      return;
    }
    const { signal: _buildSignal, ...build } = options.build || {};
    const workerData = { mode: 'artifacts', input, inputArtifact, build };
    const worker: WorkerHandle = options.createWorker?.(workerData) || new Worker(new URL('./engineExecution.worker.mjs', import.meta.url), { workerData });
    if (!worker.postMessage) {
      void worker.terminate();
      reject(new Error('Artifact engine worker does not support acknowledgement messages.'));
      return;
    }
    let settled = false;
    let terminating = false;
    let writeActive = false;
    let activeWrite: Promise<void> | undefined;
    const cleanup = () => { signal?.removeEventListener('abort', abort); worker.removeAllListeners(); };
    const finish = (operation: () => void) => { if (settled) return; settled = true; cleanup(); operation(); };
    const abort = () => {
      if (settled || terminating) return;
      terminating = true;
      cleanup();
      const termination = worker.terminate();
      const pendingWrite = activeWrite || Promise.resolve();
      void Promise.all([termination, pendingWrite]).then(
        () => { settled = true; reject(new EngineExecutionAbortedError()); },
        (error) => { settled = true; reject(error); },
      );
    };
    signal?.addEventListener('abort', abort, { once: true });
    worker.on('message', (message: WorkerMessage) => {
      if (terminating) return;
      if (message.type === 'started') return;
      if (message.type === 'artifact') {
        if (writeActive) {
          finish(() => reject(new Error('Engine worker emitted an artifact before the previous write was acknowledged.')));
          void worker.terminate();
          return;
        }
        writeActive = true;
        const write = writeArtifact(message.value).then(
          (reference) => {
            writeActive = false;
            if (!settled && !terminating) worker.postMessage!({ type: 'artifact-ack', requestId: message.requestId, reference });
          },
          (error) => {
            writeActive = false;
            if (!settled && !terminating) worker.postMessage!({ type: 'artifact-error', requestId: message.requestId, error: { name: error instanceof Error ? error.name : 'Error', message: error instanceof Error ? error.message : 'Artifact persistence failed.' } });
          },
        );
        const trackedWrite = write.finally(() => { if (activeWrite === trackedWrite) activeWrite = undefined; });
        activeWrite = trackedWrite;
        return;
      }
      if (message.type === 'artifacts-result') {
        if (writeActive) {
          finish(() => reject(new Error('Engine worker completed before its artifact write was acknowledged.')));
          void worker.terminate();
          return;
        }
        finish(() => resolve(message.publication));
        return;
      }
      if (message.type === 'result') {
        finish(() => reject(new Error('Artifact engine worker returned an unsupported monolithic result.')));
        void worker.terminate();
        return;
      }
      const error = new Error(message.error.message);
      error.name = message.error.name;
      if (message.error.stack) error.stack = message.error.stack;
      finish(() => reject(error));
    });
    worker.on('error', (error) => { if (!terminating) finish(() => reject(error)); });
    worker.on('exit', (code) => {
      if (!settled && !terminating) finish(() => reject(new Error(code === 0 ? 'Engine worker exited without publishing a manifest.' : `Engine worker exited with code ${code}.`)));
    });
  });
}
