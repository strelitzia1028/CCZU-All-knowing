import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { appConfig } from './config.js';

interface GlobalDatabase {
  pool?: Pool;
}

const globalDatabase = globalThis as typeof globalThis & GlobalDatabase;

export function isDbConfigured(): boolean {
  return Boolean(appConfig.databaseUrl);
}

export function getPool(): Pool {
  if (!isDbConfigured()) {
    throw new Error('DATABASE_URL is not set');
  }

  if (!globalDatabase.pool) {
    globalDatabase.pool = new Pool({
      connectionString: appConfig.databaseUrl,
      connectionTimeoutMillis: 10_000,
      max: 10,
      ssl: appConfig.databaseSsl
        ? { rejectUnauthorized: false }
        : undefined,
    });
    globalDatabase.pool.on('error', (error) => {
      console.error('Unexpected PostgreSQL pool error:', error);
    });
  }

  return globalDatabase.pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = []
): Promise<T[]> {
  const result = await getPool().query<T>(text, values);
  return result.rows;
}

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
