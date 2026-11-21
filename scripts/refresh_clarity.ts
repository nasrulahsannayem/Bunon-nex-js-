import { refreshClarityCache } from '../server/services/clarityService';
import { productDbPool } from '../server/db.ts';

(async () => {
  try {
    const c = await refreshClarityCache();
    console.log(`[clarity] ok=${c.ok} days=${c.numOfDays} blocks=${Object.keys(c.metrics).length} ${c.error || ''}`);
  } catch (e: any) {
    console.error('[clarity] refresh threw: ' + e.message);
  } finally {
    await productDbPool.end().catch(() => {});
    process.exit(0);
  }
})();
