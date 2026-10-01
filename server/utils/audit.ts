import { productDbPool } from '../db';
export async function logAudit(opts: { actor_id?: number | null; actor_role?: string | null; action: string; module: string; target?: string | number | null; detail?: string | null; }): Promise<void> {
  try {
    await productDbPool.execute(
      'INSERT INTO bunon_audit_logs (actor_id, actor_role, action, module, target, detail) VALUES (?, ?, ?, ?, ?, ?)',
      [opts.actor_id ?? null, opts.actor_role ?? null, opts.action, opts.module, opts.target != null ? String(opts.target) : null, opts.detail ?? null]
    );
  } catch { /* best-effort */ }
}
export function auditCtx(req: any) {
  return { actor_id: req?.user?.id ?? null, actor_role: req?.user?.role ?? null };
}
