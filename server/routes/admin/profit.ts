import express from 'express';
import { dbPool } from '../../db';
import { requirePermission } from '../../middleware/auth';

const router = express.Router();

const MIGRATE = [
  'ALTER TABLE profit ADD COLUMN total_cost DECIMAL(12,2) NULL',
  'ALTER TABLE profit ADD COLUMN total_sell DECIMAL(12,2) NULL',
  'ALTER TABLE profit ADD COLUMN total_units INT NULL',
  'ALTER TABLE profit ADD COLUMN cpr_unit DECIMAL(12,2) NULL',
  'ALTER TABLE profit ADD COLUMN cpr_parcel DECIMAL(12,2) NULL',
  'ALTER TABLE profit ADD COLUMN ads_usd DECIMAL(12,2) NULL',
  'ALTER TABLE profit ADD COLUMN ads_bdt DECIMAL(12,2) NULL',
  'ALTER TABLE profit ADD COLUMN net_profit DECIMAL(12,2) NULL',
  'ALTER TABLE profit ADD COLUMN total_parcels INT NULL',
];
async function migrate() {
  for (const sql of MIGRATE) { try { await dbPool.execute(sql); } catch {} }
  try { await dbPool.execute('ALTER TABLE profit MODIFY type VARCHAR(20) NULL'); } catch {}
}
const num = (v: any) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isNaN(n) ? 0 : n; };

// GET /api/admin/profit?period=today|yesterday|week|month|year|all|custom&start&end
router.get('/', requirePermission('view_kpi_advanced'), async (req, res) => {
  try {
    await migrate();
    const period = String(req.query.period || 'week').toLowerCase();
    const today = new Date().toISOString().slice(0, 10);
    let start: string | null = null; let end: string = today;
    const monday = new Date(); const d = (monday.getDay() + 6) % 7; monday.setDate(monday.getDate() - d);
    const monStr = monday.toISOString().slice(0, 10);
    if (period === 'today') start = today;
    else if (period === 'yesterday') { const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10); start = y; end = y; }
    else if (period === 'week') start = monStr;
    else if (period === 'month') start = today.slice(0, 7) + '-01';
    else if (period === 'year') start = today.slice(0, 4) + '-01-01';
    else if (period === 'all') start = null;
    else if (period === 'custom') { start = (req.query.start as string) || null; end = (req.query.end as string) || today; }
    else start = monStr;
    let sql = 'SELECT * FROM profit'; const params: any[] = [];
    if (start) { sql += ' WHERE record_date BETWEEN ? AND ?'; params.push(start, end); }
    sql += ' ORDER BY record_date DESC, id DESC';
    const [rows]: any = await dbPool.execute(sql, params);
    const recs = rows as any[];
    let income = 0, expense = 0, totalParcels = 0;
    for (const r of recs) {
      const amount = num(r.amount); const ads = num(r.ads_bdt);
      const signed = r.type === 'expense' ? -amount : amount;
      let gross: number;
      if (r.total_sell != null && r.total_cost != null) gross = num(r.total_sell) - num(r.total_cost);
      else gross = signed + ads;
      if (gross >= 0) { income += gross; expense += ads; }
      else { expense += Math.abs(gross) + ads; }
      totalParcels += parseInt(r.total_parcels ?? r.total_units ?? 0, 10) || 0;
    }
    res.json({ ok: true, success: true, records: recs, income, expense, net: income - expense, total_parcels: totalParcels, period, start, end });
  } catch (e: any) { console.error('[Admin Profit] error:', e.message); res.status(500).json({ ok: false, success: false, msg: 'Server error' }); }
});

// POST /api/admin/profit — upsert by (record_date, description)
router.post('/', requirePermission('view_kpi_advanced'), async (req, res) => {
  try {
    await migrate();
    const b = req.body || {};
    const record_date = String(b.record_date || '').trim();
    if (!record_date) return res.status(400).json({ ok: false, success: false, msg: 'record_date required' });
    const amount = num(b.amount);
    const type = amount < 0 ? 'expense' : 'income';
    const description = b.description || 'Daily Net Profit';
    const created_by = b.created_by || (req as any).user?.phone || 'system';
    const pick = (v: any) => (v === '' || v == null ? null : v);
    const total_cost = pick(b.total_cost), total_sell = pick(b.total_sell), total_units = pick(b.total_units);
    const cpr_unit = pick(b.cpr_unit), cpr_parcel = pick(b.cpr_parcel);
    const ads_usd = pick(b.ads_usd), ads_bdt = pick(b.ads_bdt), net_profit = pick(b.net_profit);
    const total_parcels = b.total_parcels != null && b.total_parcels !== '' ? b.total_parcels : total_units;
    const [ex]: any = await dbPool.execute('SELECT id FROM profit WHERE record_date=? AND description=? LIMIT 1', [record_date, description]);
    if ((ex as any[]).length) {
      await dbPool.execute('UPDATE profit SET type=?, amount=?, description=?, total_cost=?, total_sell=?, total_units=?, cpr_unit=?, cpr_parcel=?, ads_usd=?, ads_bdt=?, net_profit=?, total_parcels=?, created_by=?, created_at=NOW() WHERE id=?',
        [type, amount, description, total_cost, total_sell, total_units, cpr_unit, cpr_parcel, ads_usd, ads_bdt, net_profit, total_parcels, created_by, (ex as any[])[0].id]);
      return res.json({ ok: true, success: true, msg: 'Record updated' });
    }
    await dbPool.execute('INSERT INTO profit (record_date, type, amount, total_cost, total_sell, total_units, cpr_unit, cpr_parcel, ads_usd, ads_bdt, net_profit, description, created_by, total_parcels) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [record_date, type, amount, total_cost, total_sell, total_units, cpr_unit, cpr_parcel, ads_usd, ads_bdt, net_profit, description, created_by, total_parcels]);
    res.json({ ok: true, success: true, msg: 'Record inserted' });
  } catch (e: any) { console.error('[Admin Profit] save error:', e.message); res.status(500).json({ ok: false, success: false, msg: 'Server error' }); }
});

export default router;
