import { config } from 'dotenv';
import { Pool } from 'pg';
import { fileURLToPath } from 'node:url';

config({
  path: fileURLToPath(new URL('../../../.env.local', import.meta.url)),
});
config();

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl:
    process.env.DATABASE_SSL === 'true'
      ? { rejectUnauthorized: false }
      : undefined,
});

const profiles = [
  { id: 'admin-001', displayName: '管理员', role: 'admin' },
  { id: 'user-001', displayName: '测试用户', role: 'user' },
];

const tags = [
  { name: '食堂', description: '食堂、餐饮和营业时间' },
  { name: '自习', description: '自习室、图书馆和学习空间' },
  { name: '二手', description: '二手交易和闲置物品' },
  { name: '校园活动', description: '校园活动和学生服务' },
];

async function main() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const profile of profiles) {
      await client.query(
        `INSERT INTO profiles (id, display_name, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE
         SET display_name = EXCLUDED.display_name,
             role = EXCLUDED.role`,
        [profile.id, profile.displayName, profile.role]
      );
    }

    for (const tag of tags) {
      await client.query(
        `INSERT INTO tags (id, name, description)
         VALUES ($1, $2, $3)
         ON CONFLICT (name) DO NOTHING`,
        [crypto.randomUUID(), tag.name, tag.description]
      );
    }

    await client.query('COMMIT');
    console.log(
      `Seeded ${profiles.length} profiles and ${tags.length} base tags.`
    );
  } catch (error) {
    await client.query('ROLLBACK');

    if (
      error instanceof Error &&
      'code' in error &&
      error.code === '42P01'
    ) {
      throw new Error('Database tables are missing. Run pnpm db:push first.');
    }

    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
