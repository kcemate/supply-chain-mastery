import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');
const OUT_DIR = process.env.OUT_DIR || path.join(ROOT, 'tmp', 'advisor-voice-2026-05-09');
const VOICES = ['eve', 'ara', 'rex', 'sal', 'leo'];
const XAI_API_KEY = process.env.XAI_API_KEY || readXaiApiKeyFromOpenClawConfig();

const SAMPLE_TEXT = {
  plain: [
    'SCFC advisor sample.',
    'Today we are using total cost of ownership to separate purchase price from the full landed cost.',
    'If EOQ looks cheaper on paper, test the SKU-level carrying cost, supplier risk, and QBR cadence before you commit.',
    'Your move is to explain the tradeoff in one sentence, then decide what evidence would change your mind.'
  ].join(' '),
  paced: [
    '<slow>SCFC advisor sample with pacing.</slow>',
    'Start with the business outcome: service level, cash, and margin. [pause]',
    '<emphasis>TCO is not a slogan.</emphasis> It is the bill after freight, storage, defects, expediting, and supplier failure show up.',
    '[long-pause] Now compare EOQ, SKU rationalization, and the next QBR as one operating system.'
  ].join(' ')
};

function readXaiApiKeyFromOpenClawConfig() {
  const configPath = process.env.OPENCLAW_CONFIG || '/Users/giovanni/.openclaw/openclaw.json';
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config?.messages?.tts?.providers?.xai?.apiKey || config?.models?.providers?.xai?.apiKey || '';
  } catch {
    return '';
  }
}

async function xaiFetch(url, options = {}) {
  if (!XAI_API_KEY) throw new Error('Missing XAI_API_KEY or xAI key in OpenClaw config');
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${XAI_API_KEY}`,
      ...(options.headers || {})
    }
  });
  return response;
}

async function fetchJson(url, options = {}) {
  const response = await xaiFetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${url} failed with ${response.status}: ${body.error?.message || body.error || 'request failed'}`);
  return body;
}

async function generateTts(text, voice, outputPath) {
  const response = await xaiFetch('https://api.x.ai/v1/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      voice_id: voice,
      language: 'en',
      text_normalization: true,
      output_format: { codec: 'mp3', sample_rate: 24000, bit_rate: 128000 }
    })
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok) {
    const detail = bytes.toString('utf8').slice(0, 500);
    throw new Error(`TTS ${voice} failed with ${response.status}: ${detail}`);
  }
  fs.writeFileSync(outputPath, bytes);
  return bytes.length;
}

async function transcribe(filePath) {
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(filePath)], { type: 'audio/mpeg' }), path.basename(filePath));
  const response = await xaiFetch('https://api.x.ai/v1/stt', {
    method: 'POST',
    body: form
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return { error: body.error?.message || body.error || `STT failed with ${response.status}` };
  return { text: body.text || '' };
}

async function checkRealtime() {
  const body = await fetchJson('https://api.x.ai/v1/realtime/client_secrets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expires_after: { seconds: 300 } })
  });
  const token = body.value || '';
  const result = {
    clientSecretCreated: Boolean(token),
    expiresAt: body.expires_at || null,
    websocketOpened: false,
    firstEvents: [],
    error: null
  };
  if (!token) return result;

  await new Promise(resolve => {
    const ws = new WebSocket('wss://api.x.ai/v1/realtime?model=grok-voice-think-fast-1.0', [`xai-client-secret.${token}`]);
    const timeout = setTimeout(() => {
      result.error = result.error || 'timeout waiting for realtime events';
      try { ws.close(); } catch {}
      resolve();
    }, 8000);
    ws.addEventListener('open', () => {
      result.websocketOpened = true;
      ws.send(JSON.stringify({
        type: 'session.update',
        session: {
          voice: 'rex',
          instructions: 'You are testing the SCFC advisor voice connection. Reply only if asked.',
          turn_detection: { type: null },
          audio: {
            input: { format: { type: 'audio/pcm', rate: 24000 } },
            output: { format: { type: 'audio/pcm', rate: 24000 } }
          }
        }
      }));
    });
    ws.addEventListener('message', event => {
      try {
        const msg = JSON.parse(event.data);
        result.firstEvents.push(msg.type || 'unknown');
        if (result.firstEvents.length >= 3) {
          clearTimeout(timeout);
          ws.close();
          resolve();
        }
      } catch {}
    });
    ws.addEventListener('error', () => {
      result.error = 'websocket error';
    });
    ws.addEventListener('close', () => {
      clearTimeout(timeout);
      resolve();
    });
  });

  return result;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const voices = await fetchJson('https://api.x.ai/v1/tts/voices');
  const files = [];
  for (const voice of VOICES) {
    for (const [kind, text] of Object.entries(SAMPLE_TEXT)) {
      const filePath = path.join(OUT_DIR, `scfc-advisor-${voice}-${kind}.mp3`);
      const bytes = await generateTts(text, voice, filePath);
      const transcript = await transcribe(filePath);
      files.push({
        voice,
        kind,
        path: filePath,
        bytes,
        transcript: transcript.text || '',
        transcriptError: transcript.error || null
      });
      console.log(JSON.stringify({ voice, kind, bytes, path: filePath }));
    }
  }

  const realtime = await checkRealtime();
  const summary = {
    generatedAt: new Date().toISOString(),
    outDir: OUT_DIR,
    voices: voices.voices || [],
    files,
    realtime
  };
  const summaryPath = path.join(OUT_DIR, 'api-check-summary.json');
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ summaryPath, realtime }));
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
