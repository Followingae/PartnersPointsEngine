/** Shared list-query helpers for admin tables (search / filter / sort / paginate). */

export interface ListQuery {
  q?: string;
  status?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface ListResult<T> {
  rows: T[];
  total: number;
}

/** Whitelist a sort column to avoid arbitrary orderBy injection from query params. */
export function sortClause(q: ListQuery, allowed: string[], fallback: string, fallbackOrder: 'asc' | 'desc' = 'desc') {
  const sort = q.sort && allowed.includes(q.sort) ? q.sort : fallback;
  const order: 'asc' | 'desc' = q.order === 'asc' || q.order === 'desc' ? q.order : fallbackOrder;
  return { sort, order };
}
