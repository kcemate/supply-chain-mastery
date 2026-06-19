import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('app.js', 'utf8');
const backend = fs.readFileSync('backend/server.js', 'utf8');
const sampleScript = fs.readFileSync('build/generate-advisor-voice-samples.js', 'utf8');

function assertIncludes(source, needle, label) {
  assert.ok(source.includes(needle), label || `Expected source to include ${needle}`);
}

function extractXaiSessionUpdateSource() {
  const start = app.indexOf("type:'session.update',session:{voice:session.voice||'rex'");
  assert.notEqual(start, -1, 'xAI session.update event is present');
  const end = app.indexOf("}});wireMic();", start);
  assert.notEqual(end, -1, 'xAI session.update event terminates before mic wiring');
  return app.slice(start, end);
}

function tokenValue(payload) {
  return payload.value || payload.client_secret?.value || payload.secret?.value || payload.client_secret || payload.secret;
}

function websocketUrl(model = 'grok-voice-think-fast-1.0') {
  return `wss://api.x.ai/v1/realtime?model=${encodeURIComponent(model)}`;
}

const update = extractXaiSessionUpdateSource();
assertIncludes(update, "turn_detection:{type:'server_vad'}", 'xAI session uses server VAD');
assertIncludes(update, "audio:{input:{format:{type:'audio/pcm',rate:sampleRate}},output:{format:{type:'audio/pcm',rate:sampleRate}}}", 'xAI session sends 24 kHz PCM audio format');
assertIncludes(update, "tools:advisorTools()", 'read-only SCFC tools are inside the xAI session.update payload');
assertIncludes(update, "tool_choice:'auto'", 'xAI session lets the model invoke tools automatically');

assertIncludes(app, "new WebSocket(session.websocketUrl||`wss://api.x.ai/v1/realtime?model=", 'frontend constructs xAI realtime WebSocket URL');
assertIncludes(app, "[`xai-client-secret.${session.value}`]", 'browser authenticates xAI WebSocket with ephemeral subprotocol');
assertIncludes(app, "navigator.mediaDevices.getUserMedia(advisorMicConstraints())", 'frontend requests hardened microphone constraints only when advisor starts');
assertIncludes(app, "echoCancellation:true", 'frontend asks browsers for echo cancellation');
assertIncludes(app, "noiseSuppression:true", 'frontend asks browsers for noise suppression');
assertIncludes(app, "autoGainControl:true", 'frontend asks browsers for automatic gain control');
assertIncludes(app, "advisorIdleMs=90000", 'frontend closes idle advisor sessions');
assertIncludes(app, "advisorContext()", 'frontend includes current lesson context');
assertIncludes(app, "function advisorTool(name,args={})", 'frontend implements local read-only tool outputs');

assertIncludes(backend, "fetch('https://api.x.ai/v1/realtime/client_secrets'", 'backend mints xAI ephemeral tokens');
assertIncludes(backend, "body: JSON.stringify({ expires_after: { seconds: 300 } })", 'xAI token request follows docs and avoids unsupported session body');
assertIncludes(backend, "websocketUrl: `wss://api.x.ai/v1/realtime?model=${encodeURIComponent(XAI_REALTIME_MODEL)}`", 'backend returns encoded xAI realtime URL');
assertIncludes(backend, "const XAI_API_KEY = process.env.XAI_API_KEY || process.env.GROK_API_KEY;", 'backend accepts XAI_API_KEY or GROK_API_KEY');
assertIncludes(backend, "REALTIME_ACCESS_CODES", 'backend supports configured beta access codes for realtime sessions');
assertIncludes(backend, "requireRealtimeAccess", 'backend requires realtime auth or configured beta access');
assertIncludes(backend, "realtimeRateLimit", 'backend applies a specific realtime session rate limit');

assert.equal(tokenValue({ value: 'direct' }), 'direct');
assert.equal(tokenValue({ client_secret: { value: 'nested' } }), 'nested');
assert.equal(tokenValue({ secret: { value: 'secret-nested' } }), 'secret-nested');
assert.equal(tokenValue({ client_secret: 'flat-client' }), 'flat-client');
assert.equal(websocketUrl('grok voice/custom'), 'wss://api.x.ai/v1/realtime?model=grok%20voice%2Fcustom');

assertIncludes(sampleScript, "const VOICES = ['eve', 'ara', 'rex', 'sal', 'leo'];", 'sample generator covers all documented built-in xAI voices');
assertIncludes(sampleScript, "voice: 'rex'", 'realtime smoke test exercises rex');
assertIncludes(sampleScript, "https://api.x.ai/v1/tts/voices", 'sample generator records available voices endpoint');

console.log('Advisor voice shape tests passed');
