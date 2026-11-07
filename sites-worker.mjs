import { assets } from './assets.mjs';

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
};

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
    const asset = assets[requestedPath] ?? assets['/index.html'];

    if (!asset) return new Response('ContinuityOS assets are unavailable.', { status: 503 });

    const extension = requestedPath.includes('.')
      ? requestedPath.slice(requestedPath.lastIndexOf('.'))
      : '.html';

    return new Response(request.method === 'HEAD' ? null : decodeBase64(asset), {
      headers: {
        'content-type': mimeTypes[extension] ?? 'application/octet-stream',
        'cache-control': extension === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
      },
    });
  },
};
