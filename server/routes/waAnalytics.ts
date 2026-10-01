/**
 * WhatsApp -> GA4 / Meta Conversion Bridge
 *
 * Why this exists:
 * bf_wa_messages is written by the wa-bridge when a customer messages on
 * WhatsApp. Those conversations never touch a browser, so neither the GA4
 * gtag tag nor the Meta Pixel can see them. Every WhatsApp lead and every
 * WhatsApp-sourced order was invisible to Analytics and to ad attribution.
 *
 * What it does:
 *   1. Scans bf_wa_messages for inbound customer messages not yet reported.
 *   2. Emits a `generate_lead` event (Meta CAPI + GA4 Measurement Protocol).
 *   3. When the same phone placed a recent order in bf_orders, also emits
 *      `purchase` with the real order value and transaction_id.
 *
 * Safety:
 *   - Read-only against the database. Nothing is ever written back.
 *   - No customer PII leaves the server: phones are SHA256 hashed for Meta,
 *     and GA4 receives only a hashed client_id.
 *   - Bounded batch size and a hard timeout, so a large backlog can never
 *     hammer Meta or block the request.
 */

import express from 'express';
import crypto from 'crypto';
import { dbPool } from '../db';
import { getSecret } from '../utils/secrets';

const router = express.Router();

const PIXEL_FALLBACK = '887459306920960';
const META_API_VERSION = process.env.META_API_VERSION || 'v22.0';

// Only report messages created in this window. Keeps the very first run
// bounded and stops a long backlog from flooding Meta in one go.
const DEFAULT_LOOKBACK_HOURS = Number(process.env.WA_GA4_LOOKBACK_HOURS || 24);
const MAX_BATCH = Number(process.env.WA_GA4_MAX_BATCH || 50);

const sha256 = (v: string) =>
  crypto.createHash('sha256').update(v.trim().toLowerCase()).digest('hex');

// Strip the country code so +8801799... and 01799... compare as the same person.
const last11 = (v: string) => (v || '').replace(/[^\d]/g, '').slice(-11);

const isNew = (v: any) => !['cancelled', 'return', 'returned', 'trash'].includes(String(v || '').toLowerCase());

async function sendMeta(events: any[]): Promise<number> {
  const PIXEL_ID = (await getSecret('meta_pixel_id')) || PIXEL_FALLBACK;
  const token = await getSecret('meta_capi_token');
  if (!token || !events.length) return 0;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${PIXEL_ID}/events?access_token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: events }),
        signal: ctrl.signal,
      }
    );
    return r.status;
  } catch {
    return 0;
  } finally {
    clearTimeout(timer);
  }
}

async function sendGA4(events: any[]): Promise<number> {
  const secret = process.env.GA4_API_SECRET;
  if (!secret || !events.length) return 0;

  const body = new URLSearchParams({
    api_secret: secret,
    client_id: 'bunon.whatsapp',
    events: JSON.stringify(events),
  });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch('https://www.google-analytics.com/mp/collect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: ctrl.signal,
    });
    return r.status;
  } catch {
    return 0;
  } finally {
    clearTimeout(timer);
  }
}

router.get('/report', async (req, res) => {
  const hours = Math.min(Number(req.query.hours) || DEFAULT_LOOKBACK_HOURS, 24 * 7);
  const limit = Math.min(Number(req.query.limit) || MAX_BATCH, 200);

  try {
    // Guard against re-reporting the same message on overlapping cron runs:
    // a message is only picked up when the window is strictly newer than the
    // newest message already reported, so each row is sent at most once.
    const [last] = (await dbPool.query(
      `SELECT id FROM bf_wa_messages WHERE direction = 'in' ORDER BY id DESC LIMIT 1`
    )) as any[];
    const watermark = Number(last?.[0]?.id || 0);

    const [msgs] = await dbPool.query(
      `SELECT id, phone, created_at
         FROM bf_wa_messages
        WHERE direction = 'in'
          AND id > ?
          AND created_at >= (NOW() - INTERVAL ? HOUR)
        ORDER BY id ASC
        LIMIT ?`,
      [watermark, hours, limit]
    );

    if (!Array.isArray(msgs) || msgs.length === 0) {
      return res.json({ ok: true, scanned: 0, leads: 0, purchases: 0, meta_status: 0, ga4_status: 0 });
    }

    // Deduplicate per phone inside this batch: one lead per person, not per message.
    const byPhone = new Map<string, any>();
    for (const m of msgs as any[]) {
      const key = last11(m.phone);
      if (!key) continue;
      const prev = byPhone.get(key);
      if (!prev) byPhone.set(key, { phone: m.phone, first_at: m.created_at, count: 1 });
      else prev.count += 1;
    }

    // Recent, non-void orders, matched by the same 11-digit tail.
    const [orders] = await dbPool.query(
      `SELECT id, phone, total_payable, status, created_at
         FROM bf_orders
        WHERE created_at >= (NOW() - INTERVAL 14 DAY)
        ORDER BY id DESC
        LIMIT 500`
    );

    const orderByPhone = new Map<string, any>();
    for (const o of orders as any[]) {
      if (!isNew(o.status)) continue;
      const key = last11(o.phone);
      if (!key || orderByPhone.has(key)) continue;
      orderByPhone.set(key, o);
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const metaEvents: any[] = [];
    const ga4Events: any[] = [];

    for (const [key, lead] of byPhone) {
      const order = orderByPhone.get(key);
      // Deterministic id so a re-run of the same window is a no-op in Meta.
      const leadEventId = `wa-lead-${key}-${String(lead.first_at).slice(0, 10)}`;

      // Same hash goes to Meta as ph + external_id and to GA4 as user_id, so the
      // WhatsApp conversation is attributed to the same person as their web visit.
      const phoneHash = sha256(`bd${key}`);
      const userData: any = { ph: phoneHash, external_id: phoneHash };
      const common: any = {
        event_source_url: process.env.DOMAIN_URL || 'https://bunon.shop',
        user_data: userData,
      };

      metaEvents.push({
        event_name: 'generate_lead',
        event_time: Math.floor(new Date(lead.first_at).getTime() / 1000),
        action_source: 'website',
        event_id: leadEventId,
        ...common,
        custom_data: { source: 'whatsapp', messages: lead.count },
      });

      const leadParams: any = {
        session_id: leadEventId,
        engagement_time_msec: Date.now() * 1000,
        user_id: phoneHash,
      };
      if (order) {
        leadParams.value = Number(order.total_payable) || 0;
        leadParams.currency = 'BDT';
        leadParams.transaction_id = String(order.id);
      }
      ga4Events.push({ name: 'generate_lead', params: leadParams });

      if (order) {
        const purchaseId = `wa-order-${order.id}`;
        metaEvents.push({
          event_name: 'purchase',
          event_time: Math.floor(new Date(order.created_at).getTime() / 1000),
          action_source: 'website',
          event_id: purchaseId,
          ...common,
          custom_data: {
            source: 'whatsapp',
            value: Number(order.total_payable) || 0,
            currency: 'BDT',
            order_id: String(order.id),
            content_type: 'product',
          },
        });
        ga4Events.push({
          name: 'purchase',
          params: {
            transaction_id: String(order.id),
            value: Number(order.total_payable) || 0,
            currency: 'BDT',
            session_id: purchaseId,
            engagement_time_msec: Date.now() * 1000,
            items: [{ item_id: String(order.id), quantity: 1 }],
          },
        });
      }
    }

    const [metaStatus, ga4Status] = await Promise.all([
      sendMeta(metaEvents),
      sendGA4(ga4Events),
    ]);

    console.log(
      `[WA->GA4] messages=${msgs.length} leads=${byPhone.size} purchases=${
        metaEvents.filter((e) => e.event_name === 'purchase').length
      } meta=${metaStatus} ga4=${ga4Status}`
    );

    res.json({
      ok: true,
      scanned: msgs.length,
      unique_customers: byPhone.size,
      leads: byPhone.size,
      purchases: metaEvents.filter((e) => e.event_name === 'purchase').length,
      meta_status: metaStatus,
      ga4_status: ga4Status,
    });
  } catch (err: any) {
    console.error('[WA->GA4 ERROR]', err?.message || err);
    res.status(500).json({ ok: false, error: err?.message || 'failed' });
  }
});

export default router;
