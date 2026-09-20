/** reset.js — Xóa dữ liệu và tạo lại bộ dữ liệu mẫu ban đầu. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, '..', 'data', 'db.json');

if (process.env.DATABASE_URL) {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false },
  });
  await pool.query('DELETE FROM sos_store WHERE id = 1').catch(() => {});
  await pool.end();
  console.log('Đã xóa dữ liệu trên Postgres.');
} else {
  if (fs.existsSync(file)) fs.unlinkSync(file);
  console.log('Đã xóa data/db.json.');
}

const { load } = await import('./store.js');
await load();
console.log('Đã tạo lại dữ liệu mẫu.');
