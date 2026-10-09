import {Miniflare} from 'miniflare';
import {readFile} from 'node:fs/promises';

export async function testDatabase() {
  const mf = new Miniflare({modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: '2026-08-06', d1Databases: {DB: crypto.randomUUID()}});
  const db = await mf.getD1Database('DB');
  const schema = await readFile(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8');
  if (schema) await db.exec(schema.replace(/\n/g, ' '));
  return {db: db as unknown as D1Database, dispose: () => mf.dispose()};
}
