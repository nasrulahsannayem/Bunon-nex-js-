/**
 * Resolve real Facebook / Instagram profile names and photos.
 *
 * The screenshots showed Facebook senders as bare numeric IDs and no avatars.
 * Root cause, confirmed against the live database:
 *
 *   - `omnichannel_customer_identities.external_username` was NULL on every
 *     Facebook row, and many `display_name` values were NULL too;
 *   - the table had no avatar column at all until migration 0003 added one;
 *   - nothing ever called the Graph API to fill them in.
 *
 * Meta's messaging payloads carry only `sender.id`, so the profile has to be
 * looked up. This module does that lazily and caches the result on the
 * identity row, with a `profile_fetched_at` guard so a conversation is only
 * ever looked up once.
 *
 * Deliberately resilient: a Graph failure must never break the inbox, so every
 * path returns quietly and the UI falls back to the numeric ID.
 */

import { dbPool } from '../db';
import { getSecret } from '../utils/secrets';

const API_VER = 'v21.0';
const GRAPH = 'https://graph.facebook.com';

export type Profile = {
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
};

/** Field sets differ per platform; asking for one on the other 400s. */
const FIELDS: Record<string, string> = {
  facebook: 'name,picture{url},username',
  instagram: 'username,picture{url},full_name',
};

/**
 * Fetch one profile. Returns nulls rather than throwing so callers can treat
 * "unknown" and "lookup failed" the same way.
 */
export async function fetchProfile(platform: string, externalId: string): Promise<Profile> {
  const empty: Profile = { displayName: null, username: null, avatarUrl: null };
  if (!externalId) return empty;

  const fields = FIELDS[platform];
  if (!fields) return empty;

  const token = await getSecret('meta_access_token');
  if (!token) return empty;

  const url = `${GRAPH}/${API_VER}/${encodeURIComponent(externalId)}` +
    `?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`;

  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 8000);
    const res = await fetch(url, { signal: ac.signal });
    clearTimeout(to);
    if (!res.ok) return empty;

    const j: any = await res.json();
    if (j?.error) return empty;

    // picture comes back as {data:{url}} on v21, or a bare string on older
    const pic = j?.picture;
    const avatarUrl =
      typeof pic === 'string' ? pic :
      pic?.data?.url || pic?.url || null;

    return {
      displayName: j?.name || j?.full_name || null,
      username: j?.username || null,
      avatarUrl,
    };
  } catch {
    return empty;   // timeout, DNS, offline — never surface to the UI
  }
}

/**
 * Fill in missing profile data for identities that have never been looked up.
 *
 * Runs in small batches with a delay: a 750-row backlog in one burst would
 * trip Meta's rate limiter and get the token throttled.
 */
export async function backfillProfiles(opts: {
  batch?: number;
  delayMs?: number;
  platforms?: string[];
} = {}): Promise<{ checked: number; filled: number; stillEmpty: number }> {
  const batch = Math.min(opts.batch ?? 25, 100);
  const delay = opts.delayMs ?? 350;
  const platforms = opts.platforms ?? ['facebook', 'instagram'];

  let checked = 0;
  let filled = 0;
  let cursor = 0;

  while (true) {
    // only rows that are actually missing something
    const [rows]: any = await dbPool.query(
      `SELECT id, platform, external_id, display_name, external_username, avatar_url
         FROM omnichannel_customer_identities
        WHERE platform IN (?)
          AND profile_fetched_at IS NULL
          AND external_id IS NOT NULL AND external_id <> ''
        ORDER BY id
        LIMIT ? OFFSET ?`,
      [platforms, batch, cursor]);

    if (!rows.length) break;

    for (const r of rows) {
      checked++;
      const p = await fetchProfile(r.platform, r.external_id);

      const name = p.displayName || null;
      const user = p.username || null;
      const avatar = p.avatarUrl || null;

      // only write when we learned something, but always stamp the timestamp so
      // a genuinely unresolvable id is not retried on every page load
      const gained = (name && name !== r.display_name) ||
                     (user && user !== r.external_username) ||
                     (avatar && avatar !== r.avatar_url);

      if (gained) filled++;

      await dbPool.query(
        `UPDATE omnichannel_customer_identities
            SET display_name       = COALESCE(?, display_name),
                external_username = COALESCE(?, external_username),
                avatar_url         = COALESCE(?, avatar_url),
                profile_fetched_at = NOW()
          WHERE id = ?`,
        [name, user, avatar, r.id]);

      // mirror the resolved name onto the customer so the list shows it too
      const resolved = name || user || r.display_name;
      if (resolved && resolved !== r.display_name) {
        await dbPool.query(
          `UPDATE omnichannel_customers
              SET display_name = ?
            WHERE id = (SELECT customer_id FROM omnichannel_customer_identities WHERE id = ?)
              AND (display_name IS NULL OR display_name = '' OR display_name LIKE 'FB:%' OR display_name = ?)`,
          [resolved, r.id, r.external_id]);
      }
    }

    cursor += batch;
    if (cursor >= 5000) break;      // hard ceiling for a single run
    await new Promise((r) => setTimeout(r, delay));
  }

  return { checked, filled, stillEmpty: checked - filled };
}

/**
 * Resolve a profile on demand for one identity — used when an agent opens a
 * conversation whose profile was never backfilled.
 */
export async function ensureProfile(identityId: number): Promise<Profile> {
  const [rows]: any = await dbPool.query(
    `SELECT id, platform, external_id, display_name, external_username, avatar_url, profile_fetched_at
       FROM omnichannel_customer_identities WHERE id = ? LIMIT 1`,
    [identityId]);
  const r = rows?.[0];
  if (!r) return { displayName: null, username: null, avatarUrl: null };

  // already resolved, or already tried and failed — nothing to do
  if (r.profile_fetched_at && r.avatar_url) {
    return { displayName: r.display_name, username: r.external_username, avatarUrl: r.avatar_url };
  }

  const p = await fetchProfile(r.platform, r.external_id);
  await dbPool.query(
    `UPDATE omnichannel_customer_identities
        SET display_name       = COALESCE(?, display_name),
            external_username = COALESCE(?, external_username),
            avatar_url         = COALESCE(?, avatar_url),
            profile_fetched_at = NOW()
      WHERE id = ?`,
    [p.displayName, p.username, p.avatarUrl, identityId]);
  return p;
}