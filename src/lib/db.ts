import { neon } from '@neondatabase/serverless'

export const sql = neon(process.env.DATABASE_URL!)

export async function executeRaw(query: string): Promise<Record<string, unknown>[]> {
  const result = await sql.query(query)
  if (!result) return []
  if (Array.isArray(result)) return result as Record<string, unknown>[]
  try {
    return Array.from(result as Iterable<Record<string, unknown>>)
  } catch {
    return []
  }
}

export default function getDb() {
  return sql;
}