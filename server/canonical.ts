import { createHash } from 'node:crypto';
import type { JsonValue } from './types';

function normalize(value: unknown, path: string): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Non-finite number at ${path}`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map((item, index) => normalize(item, `${path}[${index}]`));
  if (typeof value === 'object') {
    const output: Record<string, JsonValue> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child === undefined) continue;
      output[key] = normalize(child, `${path}.${key}`);
    }
    return output;
  }
  throw new Error(`Unsupported canonical value at ${path}`);
}

export function canonicalize(value: unknown): string {
  return JSON.stringify(normalize(value, '$'));
}

export function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export function requestHash(value: unknown): string {
  return sha256(canonicalize(value));
}
