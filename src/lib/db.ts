import { neon } from '@neondatabase/serverless'
import type { QueryResultRow } from '@neondatabase/serverless'


export const sql = neon(process.env.DATABASE_URL!)

export async function executeRaw(query: string): Promise<QueryResultRow[]> {
  const result = await sql.query(query)
  if (!result) return []
  if (Array.isArray(result)) return result as QueryResultRow[]
  try {
    return Array.from(result as Iterable<QueryResultRow>)
  } catch {
    return []
  }
}

export default function getDb() {
  return sql;
}