import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';

const distDirectory = new URL('../dist/', import.meta.url);
const serverDirectory = new URL('../dist/server/', import.meta.url);

async function collectAssets(directory, relativePath = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const assets = {};

  for (const entry of entries) {
    if (entry.name === 'server' || entry.name === '.openai') continue;
    const entryRelativePath = `${relativePath}/${entry.name}`;
    const entryUrl = new URL(entry.name, directory);

    if (entry.isDirectory()) {
      Object.assign(assets, await collectAssets(new URL(`${entry.name}/`, directory), entryRelativePath));
    } else if (entry.isFile() && entry.name !== '.assetsignore' && entry.name !== 'wrangler.json') {
      assets[entryRelativePath] = (await readFile(entryUrl)).toString('base64');
    }
  }

  return assets;
}

await mkdir(serverDirectory, { recursive: true });
await copyFile(
  new URL('../sites-worker.mjs', import.meta.url),
  new URL('index.js', serverDirectory),
);

await writeFile(
  new URL('assets.mjs', serverDirectory),
  `export const assets = ${JSON.stringify(await collectAssets(distDirectory))};\n`,
);

await writeFile(
  new URL('../dist/wrangler.json', import.meta.url),
  JSON.stringify(
    {
      compatibility_date: '2026-07-28',
      main: 'server/index.js',
      assets: {
        directory: '.',
        binding: 'ASSETS',
        run_worker_first: true,
        not_found_handling: 'single-page-application',
      },
    },
    null,
    2,
  ),
);

await writeFile(
  new URL('../dist/.assetsignore', import.meta.url),
  '.assetsignore\n.openai/\nserver/\nwrangler.json\n',
);
