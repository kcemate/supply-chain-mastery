import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { execFileSync } from 'child_process';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const XAI_API_KEY = process.env.XAI_API_KEY || readXaiApiKeyFromOpenClawConfig();
const TTS_PROVIDER = process.env.TTS_PROVIDER || (XAI_API_KEY ? 'xai' : 'none');

const SCRIPTS_DIR = path.join(__dirname, '..', 'scripts');
const OUT_DIR = path.join(__dirname, '..', 'audio');
fs.mkdirSync(OUT_DIR, { recursive: true });

const VOICES = { REX: 'rex', ARA: 'ara' };
const APPLE_VOICES = {
  REX: process.env.REX_VOICE || 'Daniel',
  ARA: process.env.ARA_VOICE || 'Samantha',
};
const APPLE_RATE = process.env.APPLE_RATE || '170';
const FORCE = process.env.FORCE_REGEN === '1';
const ONLY_DAY = process.env.ONLY_DAY;
const CONCURRENCY = Math.max(1, Number.parseInt(process.env.TTS_CONCURRENCY || '1', 10) || 1);
const MIN_AUDIO_BYTES = 500 * 1024;
const MIN_SECONDS = 240;
const MAX_SECONDS = 420;
const XAI_AUDIO_MARKER = 'SCFC Masters xAI TTS';

function readXaiApiKeyFromOpenClawConfig() {
  const configPath = process.env.OPENCLAW_CONFIG || '/Users/giovanni/.openclaw/openclaw.json';
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config?.messages?.tts?.providers?.xai?.apiKey || config?.models?.providers?.xai?.apiKey || '';
  } catch {
    return '';
  }
}

async function ttsCall(text, voice) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch('https://api.x.ai/v1/tts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${XAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        voice_id: voice,
        language: 'en',
        output_format: { codec: 'mp3', sample_rate: 24000, bit_rate: 128000 },
      }),
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if ([429, 500, 503].includes(res.status)) {
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
      continue;
    }
    throw new Error(`TTS error ${res.status}: ${await res.text()}`);
  }
  throw new Error('Max retries exceeded');
}

export function parseScript(content) {
  const lines = content.split('\n');
  const blocks = [];
  let currentSpeaker = null;
  let currentText = [];
  for (const line of lines) {
    const m = line.trim().match(/^\[(REX|ARA)\]$/);
    if (m) {
      if (currentSpeaker && currentText.length) {
        blocks.push({ speaker: currentSpeaker, voice: VOICES[currentSpeaker], text: currentText.join(' ').trim() });
      }
      currentSpeaker = m[1];
      currentText = [];
    } else if (currentSpeaker) {
      currentText.push(line);
    }
  }
  if (currentSpeaker && currentText.length) {
    blocks.push({ speaker: currentSpeaker, voice: VOICES[currentSpeaker], text: currentText.join(' ').trim() });
  }
  return blocks.filter(b => b.text);
}

async function generateDay(scriptPath, outputPath) {
  if (!FORCE && isProductionAudio(outputPath, { requireXaiMarker: TTS_PROVIDER === 'xai' })) {
    console.log(`-> skipping ${path.basename(outputPath)} (production audio exists)`);
    return;
  }
  console.log(`-> generating ${path.basename(outputPath)}`);
  const content = fs.readFileSync(scriptPath, 'utf-8');
  const blocks = parseScript(content);
  if (TTS_PROVIDER === 'apple') {
    generateDayWithApple(blocks, outputPath);
  } else {
    await generateDayWithXai(blocks, outputPath);
  }
  if (!isProductionAudio(outputPath, { requireXaiMarker: TTS_PROVIDER === 'xai' })) {
    throw new Error(`${path.basename(outputPath)} generated but failed production audio validation`);
  }
}

async function generateDayWithXai(blocks, outputPath) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scfc-xai-audio-'));
  try {
    const mp3Files = [];
    for (const [idx, block] of blocks.entries()) {
      const blockPath = path.join(tmpDir, `block-${String(idx).padStart(2, '0')}-${block.speaker}.mp3`);
      const audio = await ttsCall(sanitizeForTts(block.text), block.voice);
      fs.writeFileSync(blockPath, audio);
      mp3Files.push(blockPath);
    }

    const listFile = path.join(tmpDir, 'concat.txt');
    fs.writeFileSync(listFile, mp3Files.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'), 'utf8');
    execFileSync('ffmpeg', [
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', listFile,
      '-ar', '24000',
      '-ac', '1',
      '-b:a', '128k',
      '-metadata', `encoded_by=${XAI_AUDIO_MARKER}`,
      '-metadata', 'artist=Rex and Ara',
      '-metadata', 'comment=Generated with xAI TTS voices rex and ara',
      outputPath,
    ], { stdio: 'inherit' });
    console.log(`   ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB written with xAI voices rex/ara.`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function sanitizeForTts(text) {
  return text
    .replace(/\[pause\]/g, ' ')
    .replace(/\[long-pause\]/g, ' ')
    .replace(/\[(laugh|chuckle|sigh|breath)\]/g, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function sanitizeForAppleSpeech(text) {
  return text
    .replace(/\[pause\]/g, '[[slnc 350]]')
    .replace(/\[long-pause\]/g, '[[slnc 700]]')
    .replace(/\[(laugh|chuckle|sigh|breath)\]/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/SCFC/g, 'S C F C')
    .replace(/TCO/g, 'T C O')
    .replace(/EOQ/g, 'E O Q')
    .replace(/SKU/g, 'S K U')
    .replace(/QBR/g, 'Q B R')
    .replace(/CBAM/g, 'C B A M')
    .replace(/DSCSA/g, 'D S C S A')
    .trim();
}

function generateDayWithApple(blocks, outputPath) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scfc-audio-'));
  try {
    const aiffFiles = [];
    blocks.forEach((block, idx) => {
      const textFile = path.join(tmpDir, `block-${String(idx).padStart(2, '0')}.txt`);
      const aiffFile = path.join(tmpDir, `block-${String(idx).padStart(2, '0')}.aiff`);
      fs.writeFileSync(textFile, sanitizeForAppleSpeech(block.text), 'utf8');
      execFileSync('say', [
        '-v', APPLE_VOICES[block.speaker] || APPLE_VOICES.REX,
        '-r', APPLE_RATE,
        '-f', textFile,
        '-o', aiffFile,
      ], { stdio: 'ignore' });
      aiffFiles.push(aiffFile);
    });
    const listFile = path.join(tmpDir, 'concat.txt');
    fs.writeFileSync(listFile, aiffFiles.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'), 'utf8');
    execFileSync('ffmpeg', [
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', listFile,
      '-ar', '24000',
      '-b:a', '128k',
      outputPath,
    ], { stdio: 'inherit' });
    console.log(`   ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB written with Apple voices ${APPLE_VOICES.REX}/${APPLE_VOICES.ARA}.`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function audioDurationSeconds(filePath) {
  const raw = execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=nk=1:nw=1',
    filePath,
  ], { encoding: 'utf8' });
  return Number.parseFloat(raw.trim());
}

function audioMetadata(filePath) {
  const raw = execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format_tags=encoded_by:format_tags=comment',
    '-of', 'json',
    filePath,
  ], { encoding: 'utf8' });
  return JSON.parse(raw);
}

function hasXaiMarker(filePath) {
  try {
    const tags = audioMetadata(filePath).format?.tags || {};
    return [tags.encoded_by, tags.comment].some(value => String(value || '').toLowerCase().includes('xai'));
  } catch {
    return false;
  }
}

function isProductionAudio(filePath, options = {}) {
  if (!fs.existsSync(filePath)) return false;
  const stat = fs.statSync(filePath);
  if (stat.size < MIN_AUDIO_BYTES) return false;
  try {
    const seconds = audioDurationSeconds(filePath);
    if (!Number.isFinite(seconds) || seconds < MIN_SECONDS || seconds > MAX_SECONDS) return false;
    if (options.requireXaiMarker && !hasXaiMarker(filePath)) return false;
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (TTS_PROVIDER === 'none') {
    console.error('Set TTS_PROVIDER=xai with XAI_API_KEY, set TTS_PROVIDER=apple explicitly for local macOS synthesis, or use the built-in browser SpeechSynthesis fallback in the app.');
    process.exit(1);
  }
  if (TTS_PROVIDER === 'xai' && !XAI_API_KEY) {
    console.error('Set XAI_API_KEY env var.');
    process.exit(1);
  }
  const scripts = fs.readdirSync(SCRIPTS_DIR)
    .filter(f => /^day-\d{2}\.txt$/.test(f))
    .filter(f => !ONLY_DAY || f === `day-${String(ONLY_DAY).padStart(2, '0')}.txt`)
    .sort();
  if (!scripts.length) {
    console.error(`No scripts matched ONLY_DAY=${ONLY_DAY}`);
    process.exit(1);
  }
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < scripts.length) {
      const scriptFile = scripts[nextIndex++];
      const dayNum = scriptFile.match(/day-(\d{2})/)[1];
      await generateDay(path.join(SCRIPTS_DIR, scriptFile), path.join(OUT_DIR, `day-${dayNum}.mp3`));
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, scripts.length) }, () => worker()));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
