/**
 * server/utils/session.ts — single source of truth for stale admin sessions.
 *
 * A JWT can die for several reasons (rotated secret, revoked user, deleted
 * account, a very old token). The UI must never silently render an empty
 * page in that case — it must tell the user and get them back to login.
 */

const REDIRECT_FLAG = 'bunon_session_expired';

let redirecting = false;

/**
 * Call the admin API with auth already attached.
 * On 401/403: clear the dead session and bounce to the admin login once.
 * Returns the parsed body, or `null` when the session is gone.
 */
export async function adminFetch(
  input: string,
  init: RequestInit = {}
): Promise<any | null> {
  const token = localStorage.getItem('bunon_token') || '';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(input, { ...init, headers });

  if (res.status === 401 || res.status === 403) {
    // 403 can also be a legitimate RBAC denial ("you may not view orders").
    // Only treat it as a dead session when there is no usable token, or the
    // response says the token itself is invalid.
    const body = await res.text().catch(() => '');
    const tokenDead = !token || /Invalid or expired token|Access denied: Admin privileges required/i.test(body);
    if (tokenDead) {
      expireAdminSession();
      return null;
    }
    try { return JSON.parse(body); } catch { return { ok: false, msg: body }; }
  }

  const text = await res.text();
  try { return JSON.parse(text); } catch { return { ok: false, msg: text }; }
}

/** Clear the dead session and send the user to login — at most once. */
export function expireAdminSession(): void {
  if (redirecting) return;
  redirecting = true;
  try {
    localStorage.removeItem('bunon_token');
    localStorage.removeItem('bunon_user');
  } catch { /* private mode */ }
  const back = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.replace(`/admin/login?expired=1&next=${back}`);
}

/** True when the login page should explain why the user is back there. */
export function sessionExpiredNotice(search = window.location.search): string | null {
  return new URLSearchParams(search).get('expired') ? REDIRECT_FLAG : null;
}
