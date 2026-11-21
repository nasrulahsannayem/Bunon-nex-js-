import { Router } from 'express';
import { readCache, ClarityCache } from '../../services/clarityService';

const r = Router();

/**
 * GET /api/admin/clarity
 *
 * Read-only: serves the cron-warmed cache. Never calls Clarity from here, so
 * opening the admin page costs zero of the 10 daily project requests.
 * `?refresh=1` is intentionally NOT supported -- refreshing is the cron job's
 * job, and honouring it from a click would let one page refresh burn the quota.
 */
r.get('/', (_req, res) => {
  const cache = readCache();
  if (!cache) {
    return res.json({
      ok: false,
      warming: true,
      message: 'Clarity cache is empty or stale. The hourly sync job populates it; retry in a few minutes.',
    });
  }
  const ageMin = Math.round((Date.now() - new Date(cache.fetched_at).getTime()) / 60000);
  res.json({ ...cache, age_minutes: ageMin } satisfies ClarityCache & { age_minutes: number });
});

export default r;