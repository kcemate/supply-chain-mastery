import { resolve } from 'node:path';
import { Pool } from 'pg';
import { initialLanes, initialLocations } from '../src/flywayData';
import { FilePlatformStore } from './fileStore';
import { createPlatformHttpServer } from './httpServer';
import { PlatformService } from './platformService';
import { OpenAiCopilotProvider, UnconfiguredCopilotProvider } from './openAiCopilot';
import { PostgresPlatformStore, runPostgresMigrations } from './postgresStore';

function requiredOwnerToken() {
  const token = process.env.FLYWAY_OWNER_TOKEN || '';
  if (token.length < 32) throw new Error('FLYWAY_OWNER_TOKEN must be set to at least 32 characters.');
  return token;
}

async function main() {
  const command = process.argv[2] || 'serve';
  if (command === 'restore') {
    const backupPath = process.argv[3];
    const targetDirectory = process.argv[4];
    if (!backupPath || !targetDirectory) throw new Error('Usage: platform:restore -- <backup.json> <empty-target-directory>');
    const receipt = await FilePlatformStore.restoreBackup(backupPath, targetDirectory);
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    return;
  }

  const dataDirectory = resolve(process.env.FLYWAY_DATA_DIR || '.flyway-platform');
  const fileStore = new FilePlatformStore({ dataDirectory, initialLocations, initialLanes });
  if (command === 'backup') {
    if (process.env.FLYWAY_DATABASE_URL) throw new Error('platform:backup is the file-store backup command and cannot back up PostgreSQL. Use the PostgreSQL/PITR procedure in server/README.md.');
    await fileStore.initialize();
    const destination = process.argv[3];
    if (!destination) throw new Error('Usage: platform:backup -- <backup.json>');
    const receipt = await fileStore.createBackup(destination);
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    return;
  }
  if (command !== 'serve') throw new Error(`Unknown platform command: ${command}`);

  let pool: Pool | undefined;
  if (process.env.FLYWAY_RUN_MIGRATIONS === 'true') {
    const migrationUrl = process.env.FLYWAY_MIGRATION_DATABASE_URL;
    if (!migrationUrl) throw new Error('FLYWAY_MIGRATION_DATABASE_URL is required when FLYWAY_RUN_MIGRATIONS=true; runtime credentials must not own tables.');
    const migrationPool = new Pool({ connectionString: migrationUrl, max: 1 });
    try { await runPostgresMigrations(migrationPool, { requirePostgis: process.env.FLYWAY_REQUIRE_POSTGIS === 'true' }); }
    finally { await migrationPool.end(); }
  }
  const store = process.env.FLYWAY_DATABASE_URL
    ? new PostgresPlatformStore({
        pool: (pool = new Pool({ connectionString: process.env.FLYWAY_DATABASE_URL, max: 8 })),
        initialLocations,
        initialLanes,
      })
    : fileStore;
  const copilot = process.env.OPENAI_API_KEY
    ? new OpenAiCopilotProvider({ apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || process.env.FLYWAY_OPENAI_MODEL, baseUrl: process.env.OPENAI_BASE_URL || process.env.FLYWAY_OPENAI_BASE_URL })
    : new UnconfiguredCopilotProvider();
  const service = new PlatformService(store, undefined, copilot);
  await service.initialize();
  const allowedOrigin = process.env.FLYWAY_ALLOWED_ORIGIN;
  if (allowedOrigin) {
    const parsed = new URL(allowedOrigin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== allowedOrigin) throw new Error('FLYWAY_ALLOWED_ORIGIN must be one exact HTTP(S) origin without a path.');
  }
  const server = createPlatformHttpServer({ service, ownerToken: requiredOwnerToken(), allowedOrigin });
  const port = Number(process.env.PORT || 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
  const host = process.env.HOST || '127.0.0.1';
  if (host !== '127.0.0.1' && host !== '0.0.0.0') throw new Error('HOST must be 127.0.0.1 or 0.0.0.0.');
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolveListen);
  });
  process.stdout.write(`Flyway platform listening on ${host}:${port}\n`);

  const shutdown = async () => {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    await service.shutdown();
    await pool?.end();
    process.exitCode = 0;
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

main().catch((error) => {
  process.stderr.write(`Flyway platform failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
