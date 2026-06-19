import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

const dirname = path.dirname(fileURLToPath(import.meta.url));
const schema = fs.readFileSync(path.join(dirname, '..', 'schema.sql'), 'utf8');
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
});

try {
  await pool.query(schema);
  console.log('schema applied');
} finally {
  await pool.end();
}
