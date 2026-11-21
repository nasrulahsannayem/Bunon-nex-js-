/**
 * Microsoft Clarity live-insights cache for the Bunon admin panel.
 *
 * WHY THIS EXISTS
 * Clarity's live-insights API cannot be called from the browser admin:
 *   1. The project token is a secret -- shipping it to the client would expose
 *      it to every logged-in staff member and to the browser history.
 *   2. numOfDays only accepts 1 | 2 | 3.
 *   3. There is a hard quota of 10 requests PER DAY per project.
 * So a dashboard that fetched on render would exhaust the quota in minutes and
 * then show errors for the rest of the day.
 *
 * The fix mirrors the existing Meta KPI pattern in this app: a cron script warms
 * the cache every hour, and the API only ever READS that cache. Admin pages
 * therefore cost zero Clarity quota.
 *
 * CACHE FILE: storage/clarity_cache.json
 * Cron:        see scripts/cron_clarity.sh
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { productDbPool } from '../db';

const CLARITY_API = 'https://www.clarity.ms/export-data/api/v1/project-live-insights';
const CACHE_FILE = join(process.cwd(), 'storage', 'clarity_cache.json');
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2h -- cron runs hourly, so this is just a safety net

/** numOfDays is capped at 3 by the API; we ask for 3 and slice locally. */
const MAX_DAYS = 3;

/**
 * Metric blocks we request. Adding a name that Clarity does not serve makes the
 * WHOLE request fail (same class of bug as Meta's `fields=` param), so this list
 * is deliberately short and was verified live against the project.
 */
const METRIC_BLOCKS = [
  'Traffic',
  'ScrollDepth',
  'EngagementTime',
  'DeadClickCount',
  'ExcessiveScroll',
  'RageClickCount',
  'QuickbackClick',
  'ScriptErrorCount',
  'ErrorClickCount',
];

function clarityToken(): string | null {
  // Stored in the DB (not .env) so it never lands in a build artifact or a
  // repo. Seeded by scripts/cron_clarity.sh on first run.
  return process.env.CLARITY_API_TOKEN || null;
}

async function tokenFromDb(): Promise<string | null> {
  try {
    const [rows]: any = await productDbPool.query(
      'SELECT setting_value FROM bunon_settings WHERE setting_key = ? LIMIT 1',
      ['clarity_api_token'],
    );
    const v = rows?.[0]?.setting_value;
    return v && String(v).trim() ? String(v).trim() : null;
  } catch {
    return null;
  }
}

export type ClarityCache = {
  ok: boolean;
  fetched_at: string;
  numOfDays: number;
  /** metric name -> array of breakdown rows */
  metrics: Record<string, any[]>;
  error?: string;
};

export function readCache(): ClarityCache | null {
  try {
    if (!existsSync(CACHE_FILE)) return null;
    const age = Date.now() - statSync(CACHE_FILE).mtimeMs;
    if (age > CACHE_TTL_MS) return null;
    return JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

export function writeCache(c: ClarityCache) {
  try {
    mkdirSync(dirname(CACHE_FILE), { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(c), 'utf8');
  } catch (e: any) {
    console.log('[clarity] cache write failed: ' + e.message);
  }
}

/**
 * Fetch from Clarity. Call ONLY from the cron script -- each call burns one of
 * the 10 daily requests.
 */
export async function refreshClarityCache(): Promise<ClarityCache> {
  const token = clarityToken() || (await tokenFromDb());
  if (!token) {
    const c: ClarityCache = { ok: false, fetched_at: new Date().toISOString(), numOfDays: 0, metrics: {}, error: 'no_token' };
    writeCache(c);
    return c;
  }

  const url =
    `${CLARITY_API}?projectId=${process.env.CLARITY_PROJECT_ID || '233847739770512'}` +
    `&numOfDays=${MAX_DAYS}` +
    `&metrics=${encodeURIComponent(JSON.stringify(METRIC_BLOCKS))}` +
    `&type=All` +
    `&region=All`;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30000);
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal });
    clearTimeout(t);

    if (!r.ok) {
      const body = await r.text().catch(() => '');
      const c: ClarityCache = {
        ok: false, fetched_at: new Date().toISOString(), numOfDays: 0, metrics: {},
        error: `http_${r.status} ${body.slice(0, 200)}`,
      };
      writeCache(c);
      return c;
    }

    const json: any = await r.json();
    // Shape varies; keep the whole payload so the UI can pick what it needs.
    const c: ClarityCache = {
      ok: true,
      fetched_at: new Date().toISOString(),
      numOfDays: MAX_DAYS,
      metrics: json?.metrics || json?.data || json,
    };
    writeCache(c);
    return c;
  } catch (e: any) {
    const c: ClarityCache = { ok: false, fetched_at: new Date().toISOString(), numOfDays: 0, metrics: {}, error: e.message };
    writeCache(c);
    return c;
  }
}