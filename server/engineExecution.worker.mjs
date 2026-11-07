import { parentPort, workerData } from 'node:worker_threads';
import { register } from 'tsx/esm/api';

register();

if (!parentPort) throw new Error('The engine worker must run inside a worker thread.');

try {
  parentPort.postMessage({ type: 'started' });
  const { runInput } = await import('../src/flywayEngine.ts');
  if (workerData?.mode === 'artifacts') {
    const { persistRunResult } = await import('../src/runArtifactRepository.ts');
    let nextRequestId = 1;
    const acknowledgements = new Map();
    const onMessage = (message) => {
      if (message?.type !== 'artifact-ack' && message?.type !== 'artifact-error') return;
      const pending = acknowledgements.get(message.requestId);
      if (!pending) return;
      acknowledgements.delete(message.requestId);
      if (message.type === 'artifact-ack') pending.resolve(message.reference);
      else {
        const error = new Error(message.error?.message || 'Artifact persistence failed.');
        error.name = message.error?.name || 'Error';
        pending.reject(error);
      }
    };
    parentPort.on('message', onMessage);
    const writeArtifact = (value) => new Promise((resolve, reject) => {
      const requestId = nextRequestId++;
      acknowledgements.set(requestId, { resolve, reject });
      parentPort.postMessage({ type: 'artifact', requestId, value });
    });
    const output = runInput(workerData.input);
    const publication = await persistRunResult(output, workerData.inputArtifact, writeArtifact, workerData.build);
    parentPort.off('message', onMessage);
    parentPort.postMessage({ type: 'artifacts-result', publication });
    parentPort.close();
  } else {
    const output = runInput(workerData);
    parentPort.postMessage({ type: 'result', output });
    parentPort.close();
  }
} catch (error) {
  parentPort.postMessage({
    type: 'error',
    error: {
      name: error instanceof Error ? error.name : 'Error',
      message: error instanceof Error ? error.message : 'Engine execution failed.',
      stack: error instanceof Error ? error.stack : undefined,
    },
  });
  parentPort.close();
}
