/** Reads a list total from either `{ meta.total }` or `{ total }`. */
export function readListTotal(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const row = payload as Record<string, unknown>;
  const meta = row.meta;
  if (meta && typeof meta === 'object') {
    const total = (meta as { total?: unknown }).total;
    if (typeof total === 'number' && Number.isFinite(total)) return total;
  }
  if (typeof row.total === 'number' && Number.isFinite(row.total)) return row.total;
  return null;
}
