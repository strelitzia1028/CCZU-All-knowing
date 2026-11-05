import { config } from 'dotenv';
import { Pool } from 'pg';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../password.js';

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
  {
    id: 'admin-001',
    username: 'admin',
    displayName: '管理员',
    role: 'admin',
  },
  {
    id: 'user-001',
    username: 'test',
    displayName: 'TEST',
    role: 'user',
  },
];

const tags = [
  { name: '食堂', description: '食堂、餐饮和营业时间' },
  { name: '自习', description: '自习室、图书馆和学习空间' },
  { name: '二手', description: '二手交易和闲置物品' },
  { name: '校园活动', description: '校园活动和学生服务' },
];

const sourceTypes = [
  { value: 'partner', label: '找搭子', description: '寻找学习、运动或活动伙伴' },
  { value: 'second_hand', label: '二手交易', description: '校内闲置物品交易' },
  { value: 'lost_found', label: '失物招领', description: '失物与招领信息' },
  { value: 'experience', label: '校园经验', description: '校园生活经验和攻略' },
];

async function main() {
  const client = await pool.connect();
  const testPassword = process.env.TEST_USER_PASSWORD?.trim();
  const testPasswordHash = testPassword
    ? await hashPassword(testPassword)
    : null;

  try {
    await client.query('BEGIN');

    for (const profile of profiles) {
      await client.query(
        `INSERT INTO profiles
           (id, username, display_name, role, password_hash)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE
         SET username = EXCLUDED.username,
             display_name = EXCLUDED.display_name,
             role = EXCLUDED.role,
             password_hash = COALESCE(
               EXCLUDED.password_hash,
               profiles.password_hash
             )`,
        [
          profile.id,
          profile.username,
          profile.displayName,
          profile.role,
          profile.id === 'user-001' ? testPasswordHash : null,
        ]
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

    for (const sourceType of sourceTypes) {
      await client.query(
        `INSERT INTO source_types (id, value, label, description)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (value) DO UPDATE
         SET label = EXCLUDED.label,
             description = EXCLUDED.description`,
        [
          crypto.randomUUID(),
          sourceType.value,
          sourceType.label,
          sourceType.description,
        ]
      );
    }

    await client.query('COMMIT');
    console.log(
      `Seeded ${profiles.length} profiles, ${tags.length} base tags and ${sourceTypes.length} source types.`
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
