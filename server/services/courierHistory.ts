/**
 * Local courier history from Bunon's own orders.
 *
 * The Courier Summary panel in the order drawer reads from an external plugin
 * (Hoorin). When that plugin is not configured, not connected, or not yet
 * approved for the merchant's courier, the panel showed a row of zeroes — which
 * reads as "this customer is clean" when it actually means "we looked
 * nowhere".
 *
 * Bunon has 7,300+ orders of its own history for these customers. That is the
 * authoritative record for this shop, it is free, and it cannot be stale. This
 * module computes the same shape the panel already renders so the two sources
 * are interchangeable.
 */
import { dbPool } from '../db';

const DELIVERED = ['delivered', 'complete', 'completed', 'courier_complete'];
const CANCELLED = ['cancelled', 'cancell', 'canceled'];
const RETURNED = ['return', 'returned', 'partial_return', 'partial_returned'];

export type LocalHistory = {
  total: number;
  delivered: number;
  cancelled: number;
  returned: number;
  success_pct: number;
  bad_pct: number;
  first_order: string | null;
  last_order: string | null;
  per_courier: Record<string, { delivered: number; total: number }>;
};

/**
 * Match on the last 8 digits. Phone numbers reach us as 017…, 88017…, +88017…,
 * and with spaces or dashes, so an exact-equality match on the full string
 * silently misses most orders. The last 8 digits are stable across all of
 * those forms and are the same key the courier uses.
 */
function last8(phone: string): string {
  return String(phone || '').replace(/\D/g, '').slice(-8);
}

export async function localCourierHistory(phone: string): Promise<LocalHistory | null> {
  const key = last8(phone);
  if (key.length !== 8) return null;

  const [rows]: any = await dbPool.query(
    `SELECT status, courier_code, created_at, updated_at
       FROM bf_orders
      WHERE RIGHT(REPLACE(REPLACE(REPLACE(phone, '+', ''), '-', ''), ' ', ''), 8) = ?`,
    [key]
  );
  if (!rows?.length) return null;

  let delivered = 0, cancelled = 0, returned = 0, total = 0;
  const perCourier: Record<string, { delivered: number; total: number }> = {};
  let first: string | null = null, last: string | null = null;

  for (const r of rows as any[]) {
    const s = String(r.status || '').toLowerCase();
    // A soft-deleted order is not evidence about the customer.
    if (s === 'trash') continue;
    total++;

    const courier = String(r.courier_code || '').toLowerCase().trim();
    if (courier) {
      if (!perCourier[courier]) perCourier[courier] = { delivered: 0, total: 0 };
      perCourier[courier].total++;
    }
    if (DELIVERED.includes(s)) {
      delivered++;
      if (courier) perCourier[courier].delivered++;
    } else if (CANCELLED.includes(s)) cancelled++;
    else if (RETURNED.includes(s)) returned++;

    const at = String(r.created_at || '');
    if (at && (!first || at < first)) first = at;
    if (at && (!last || at > last)) last = at;
  }

  if (!total) return null;

  return {
    total,
    delivered,
    cancelled,
    returned,
    success_pct: +((delivered * 100) / total).toFixed(1),
    bad_pct: +(((cancelled + returned) * 100) / total).toFixed(1),
    first_order: first,
    last_order: last,
    per_courier: perCourier,
  };
}

/** Same risk bands the panel already uses, computed from local data. */
export function localRisk(h: LocalHistory): 'low' | 'medium' | 'high' | 'unknown' {
  if (!h || !h.total) return 'unknown';
  if (h.bad_pct >= 40) return 'high';
  if (h.bad_pct >= 20) return 'medium';
  return 'low';
}