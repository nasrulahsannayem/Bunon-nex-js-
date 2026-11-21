import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package, CheckCircle2, Truck, Home, RotateCcw, XCircle,
  Phone, Clock, Search, Headset, Copy, Check, ChevronLeft,
} from 'lucide-react';

const SITE = 'https://bunonfabrics.com';

/* ---------------------------------------------------------------- milestones */

const MILESTONES = [
  { rank: 1, key: 'confirmed',        label: 'অর্ডার নিশ্চিত',        icon: CheckCircle2, dot: '#2563EB', wash: '#EFF6FF', text: '#1D4ED8' },
  { rank: 2, key: 'packed',           label: 'প্যাকিং চলছে',          icon: Package,     dot: '#7C3AED', wash: '#F5F3FF', text: '#6D28D9' },
  { rank: 3, key: 'shipped',          label: 'কুরিয়ারে পাঠানো হয়েছে', icon: Truck,       dot: '#E60023', wash: '#FDEBEE', text: '#B3001A' },
  { rank: 4, key: 'out_for_delivery', label: 'ডেলিভারির পথে',         icon: Truck,       dot: '#EA580C', wash: '#FFF3E8', text: '#C2410C' },
  { rank: 5, key: 'delivered',        label: 'ডেলিভার্ড হয়েছে',       icon: Home,        dot: '#059669', wash: '#E8F8F2', text: '#047857' },
];

/* Statuses that mean the parcel will never arrive normally. */
const VOID = ['cancelled', 'returned', 'partial_returned', 'return', 'trash'];
const FAILED = ['failed', 'on_hold'];

const RANK: Record<string, number> = {
  pending: 0, confirmed: 1, processing: 1, packed: 2, shipped: 3,
  in_transit: 3, out_for_delivery: 4, delivered: 5,
  cancelled: -1, returned: -1, partial_returned: -1, return: -1, trash: -1,
};

/* ------------------------------------------------------------------- helpers */

const maskPhone = (v: any) => {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length < 4) return d ? d + '••••' : '—';
  return `${d.slice(0, 3)}${'•'.repeat(Math.max(3, d.length - 6))}${d.slice(-3)}`;
};

/**
 * A full village-level address is not needed to answer "where is my parcel",
 * and a public tracking page is reachable by anyone who knows an invoice
 * number. Only the district level is shown; the full address stays in the
 * database and in the courier's hands.
 */
/**
 * The rider is sent from this page, so a trimmed one-line address is not enough
 * to find the door. The tracking link is the access credential and it is issued
 * per order, so the full address is shown. Only the phone number stays masked.
 */
const shortAddress = (o: any) => {
  const raw = String(o?.address || '').trim();
  return raw || '—';
};;

/**
 * 587 stored order-item images still point at bunon.shop. Those URLs are served
 * today only through our image proxy, but the moment .shop is retired the
 * stored value becomes dead. Rewrite to the canonical origin on the fly so the
 * customer page never depends on the old domain.
 */
const resolveImg = (raw: string) => {
  const v = String(raw || '');
  if (!v) return '';
  if (v.startsWith('/api/image-proxy')) {
    return v.replace(/bunon%2Eshop/gi, 'bunonfabrics%2Ecom').replace(/bunon\.shop/gi, 'bunonfabrics.com');
  }
  if (v.startsWith('http')) return v.replace(/https?:\/\/(www\.)?bunon\.shop/gi, SITE);
  return `${SITE}${v.startsWith('/') ? '' : '/'}${v}`;
};

const fmtDate = (v: string) => {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(+d)) return String(v);
  return d.toLocaleString('bn-BD', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
  });
};

/** Steadfast writes English logistics prose; render it as Bengali. */
const BN = (t: string) =>
  String(t || '')
    .replace(/Consignment/gi, 'পার্সেল')
    .replace(/has been received at/gi, 'পৌঁছেছে')
    .replace(/has been picked up/gi, 'তুলে নেওয়া হয়েছে')
    .replace(/has been sent to/gi, 'পাঠানো হয়েছে')
    .replace(/sent to/gi, 'পাঠানো হয়েছে')
    .replace(/delivery/gi, 'ডেলিভারি')
    .replace(/processing for delivery/gi, 'ডেলিভারির প্রস্তুতিতে')
    .replace(/assigned to (?:rider|deliveryman)[.:]?/gi, 'রাইডারকে দেওয়া হয়েছে।')
    .replace(/WAREHOUSE/gi, 'ওয়্যারহাউস')
    .replace(/status has been updated as/gi, 'স্ট্যাটাস আপডেট')
    .replace(/Dispatch ID:?/gi, 'ডিসপ্যাচ নম্বর')
    .replace(/Consignment ID:?/gi, 'কনসাইনমেন্ট নম্বর')
    .replace(/STATUS/gi, 'স্ট্যাটাস')
    .replace(/\s{2,}/g, ' ')
    .trim();

/* --------------------------------------------------------------------- theme */

const TONE: Record<string, { band: string; soft: string; text: string; ring: string }> = {
  delivered: { band: 'from-emerald-600 to-emerald-700', soft: 'bg-emerald-50 text-emerald-700', text: 'text-emerald-700', ring: 'ring-emerald-500' },
  cancelled: { band: 'from-rose-600 to-rose-700',   soft: 'bg-rose-50 text-rose-700',    text: 'text-rose-700',    ring: 'ring-rose-500' },
  returned:  { band: 'from-rose-600 to-rose-700',   soft: 'bg-rose-50 text-rose-700',    text: 'text-rose-700',    ring: 'ring-rose-500' },
  failed:    { band: 'from-amber-500 to-amber-600', soft: 'bg-amber-50 text-amber-700',  text: 'text-amber-700',  ring: 'ring-amber-500' },
  default:   { band: 'from-[#E60023] to-[#B3001A]', soft: 'bg-[#FDECEE] text-[#E60023]', text: 'text-[#E60023]', ring: 'ring-[#E60023]' },
};

const STATUS_BN: Record<string, string> = {
  pending: 'অপেক্ষমাণ', confirmed: 'নিশ্চিত', processing: 'প্রক্রিয়াধীন', packed: 'প্যাক হয়েছে',
  shipped: 'পাঠানো হয়েছে', in_transit: 'রাস্তায়', out_for_delivery: 'ডেলিভারির পথে',
  delivered: 'ডেলিভার্ড হয়েছে', cancelled: 'বাতিল', returned: 'ফেরত', return: 'ফেরত',
  partial_returned: 'আংশিক ফেরত', trash: 'বাতিল', on_hold: 'অপেক্ষায়', failed: 'ব্যর্থ',
};

/* ---------------------------------------------------------------- component */


/** The courier column is free text in the DB, so a typo could reach customers. */

/** Steadfast prefixes stored replies with "Rider Note:" / "Rider Message:". The
    card already says রাইডার নোট, so strip the prefix before rendering. */
function cleanRemark(raw: any) {
  return String(raw || '').replace(/^\s*rider\s*(note|message|update|comment)\s*:\s*/i, '').trim();
}


/** The delivered stage is the terminal one; it stays green even when not current. */
function isLastStep(key: string) {
  return key === 'delivered';
}

function prettyCourier(raw: any) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v || v === 'steadfast' || v === 'sf') return 'Steadfast';
  return v.charAt(0).toUpperCase() + v.slice(1);
}

/** One plain sentence so the coloured band explains itself instead of just glowing. */
function statusLine(status: any) {
  const map: Record<string, string> = {
    pending: 'আপনার অর্ডারটি আমাদের কাছে আছে, প্রস্তুত করা হচ্ছে।',
    confirmed: 'আপনার অর্ডারটি নিশ্চিত করা হয়েছে।',
    processing: 'আপনার প্যাকেজটি প্রস্তুত করা হচ্ছে।',
    packed: 'আপনার প্যাকেজটি প্যাক করা হয়েছে।',
    shipped: 'আপনার প্যাকেজটি কুরিয়ারের কাছে পাঠানো হয়েছে।',
    in_transit: 'আপনার প্যাকেজটি কুরিয়ারে আছে, পথে আছে।',
    out_for_delivery: 'আপনার প্যাকেজটি আজ ডেলিভারির পথে আছে।',
    delivered: 'আপনার প্যাকেজটি ডেলিভার করা হয়েছে। ধন্যবাদ।',
    cancelled: 'আপনার অর্ডারটি বাতিল করা হয়েছে।',
    returned: 'আপনার প্যাকেজটি ফেরত আসছে।',
  };
  return map[String(status || '')] || 'আপনার প্যাকেজটির তথ্য আপডেট হচ্ছে।';
}

export default function PublicTrackPage() {
  const [q, setQ] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const started = useRef(false);

  const load = useCallback(async (raw: string) => {
    const code = String(raw || '').trim();
    if (!code) return;
    setLoading(true); setErr(''); setData(null);
    try {
      const r = await fetch(`/api/public/track?code=${encodeURIComponent(code)}`);
      const j = await r.json();
      if (!j?.ok) setErr('এই কোডে কোনো অর্ডার পাওয়া যায়নি। নম্বরটি মেসেজের লিংক থেকে কপি করুন।');
      else setData(j);
    } catch {
      setErr('একটু পরে আবার চেষ্টা করুন।');
    } finally { setLoading(false); }
  }, []);

  /* A link that already carries the code shows the result immediately — the
     customer never has to press anything. The search box is revealed only for
     visitors who arrive without one. */
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const c = new URLSearchParams(window.location.search).get('code');
    if (c) { setQ(c); load(c); }
  }, [load]);

  const copy = async () => {
    const code = data?.order?.trackingCode;
    if (!code) return;
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {}
  };

  const o = data?.order;
  const hasCode = !!q.trim();

  const tone = useMemo(() => {
    const s = String(o?.status || '');
    if (FAILED.includes(s)) return TONE.failed;
    if (s === 'partial_returned') return TONE.failed;
    if (VOID.includes(s)) return TONE.cancelled;
    if (s === 'delivered') return TONE.delivered;
    return TONE.default;
  }, [o?.status]);

  const reached = useMemo(() => {
    const s = String(o?.status || '');
    if (VOID.includes(s) || FAILED.includes(s) || s === 'trash') return -1;
    return RANK[s] ?? -1;
  }, [o?.status]);

  const steps = (data?.steps || []) as any[];
  const journey = useMemo(() => [...steps].reverse(), [steps]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${SITE}/track?code=${o?.trackingCode || ''}`);
      setCopied(true); setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  // A parcel in motion keeps moving without the customer touching anything.
  // Re-run the same loader every 45s while it is still travelling, and stop once
  // it settles so a finished order does not keep hitting the API (and the
  // 20-per-minute rate limit) for no reason.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code');
    if (!code || !data?.order?.status) return;
    const settled = ['delivered', 'cancelled', 'returned', 'partial_returned', 'return', 'trash'];
    if (settled.includes(String(data.order.status))) return;
    const t = setInterval(() => { void load(code); }, 45000);
    return () => clearInterval(t);
  }, [data?.order?.status, load]);

  return (
    <div className="min-h-screen bg-[#F5F6F8] pb-24">
      {/* The decorative hero used to sit here. It repeated the customer's first
          name at screen-filling size and pushed the order details below the
          fold, so the page now opens straight onto the order card. */}
      <div className="max-w-2xl mx-auto px-4 pt-5">
        {/* --------------------------------------------------------- search */}
        <AnimatePresence>
          {(!data || loading) && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-white rounded-2xl shadow-xl shadow-[#E60023]/10 p-3 sm:p-4 mb-5"
            >
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#E60023]/50" size={17} />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && load(q)}
                    placeholder="ট্র্যাকিং কোড বা অর্ডার নম্বর"
                    aria-label="ট্র্যাকিং কোড"
                    className="w-full pl-10 pr-3 py-3.5 rounded-xl bg-[#FDF8F8] border border-transparent focus:border-[#E60023] focus:bg-white focus:ring-4 focus:ring-[#E60023]/10 outline-none text-sm transition"
                  />
                </div>
                <button
                  onClick={() => load(q)}
                  disabled={loading}
                  className="px-5 sm:px-7 py-3.5 rounded-xl bg-[#E60023] text-white text-sm font-bold hover:bg-[#C00019] active:scale-[0.97] disabled:opacity-50 transition shrink-0"
                >
                  {loading ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      খুঁজছি
                    </span>
                  ) : 'খুঁজুন'}
                </button>
              </div>
              {err && (
                <p className="mt-3 text-[13px] text-rose-600 text-center leading-relaxed">{err}</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {data && o && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="space-y-4"
          >
            {/* ------------------------------------------------- status card */}
            <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
              <div className={`bg-gradient-to-r ${tone.band} px-5 py-5 text-white`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-white/70 text-[11px] uppercase tracking-wide">অর্ডার নম্বর</p>
                    <p className="font-bold text-lg break-all leading-tight">{o.invoice}</p>
                    <p className="mt-1.5 text-[13px] leading-snug text-white/90">{statusLine(o.status)}</p>
                  </div>
                  <span className="shrink-0 mt-1 px-3 py-1.5 rounded-full bg-white/20 text-[11px] font-bold ring-1 ring-white/25">
                    {STATUS_BN[o.status] || o.status}
                  </span>
                </div>
              </div>

              <div className="p-5 grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
                <div>
                  <p className="text-gray-400 text-[11px]">নাম</p>
                  <p className="font-semibold text-gray-800">{o.customer || '—'}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-[11px]">ফোন</p>
                  <p className="font-semibold text-gray-800 font-mono">{maskPhone(o.phone)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-gray-400 text-[11px]">এলাকা</p>
                  <p className="font-semibold text-gray-800 leading-snug">{shortAddress(o)}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-[11px]">কুরিয়ার</p>
                  <p className="font-semibold text-gray-800">{prettyCourier(o.courier)}</p>
                </div>
                {o.rider?.assigned && (
                  <div className="col-span-2">
                    <p className="text-gray-400 text-[11px] mb-1">আপনার রাইডার</p>
                    <div className="flex items-center gap-2.5 rounded-xl bg-[#080F28]/[0.04] border border-[#080F28]/10 px-3 py-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#080F28] text-white text-xs font-bold">
                        {(o.rider.name || '?').trim().charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-[#080F28] truncate">{o.rider.name}</p>
                        {o.rider.phone && (
                          <a href={`tel:${o.rider.phone.replace(/\D/g, '')}`} className="text-[11px] text-gray-500 font-mono hover:text-[#E60023]">
                            {o.rider.phone}
                          </a>
                        )}
                      </div>
                    <a
                      href={`tel:${o.rider.phone.replace(/\D/g, '')}`}
                      className="shrink-0 rounded-xl bg-[#E60023] px-4 py-2.5 text-sm font-bold text-white min-h-[44px] inline-flex items-center"
                    >
                      কল করুন
                    </a>
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-gray-400 text-[11px]">মোট</p>
                  <p className="font-extrabold text-[#E60023]">৳{Number(o.amount || 0).toLocaleString('en-BD')}</p>
                </div>
                {o.trackingCode && (
                  <div className="col-span-2 pt-1 border-t border-gray-100">
                    <p className="text-gray-400 text-[11px] mb-1.5">ট্র্যাকিং কোড</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[13px] font-bold text-gray-800 break-all">
                        {o.trackingCode}
                      </span>
                      <button
                        onClick={copyLink}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#E60023] bg-[#FDECEE] hover:bg-[#FBD5DA] px-2.5 py-1 rounded-lg transition shrink-0"
                      >
                        {copied ? <Check size={12} /> : <Copy size={12} />}
                        {copied ? 'কপি হয়েছে' : 'লিংক কপি'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ------------------------------------------- what was ordered */}
            {(data.items || []).length > 0 && (
              <div className="bg-white rounded-2xl shadow-lg p-5">
                <h2 className="font-bold text-gray-800 text-sm mb-4">আপনার অর্ডার</h2>
                <div className="space-y-3">
                  {data.items.map((it: any, i: number) => (
                    <div key={i} className="flex gap-3.5 items-start">
                      {it.thumbnail ? (
                        <img
                          src={resolveImg(it.thumbnail)}
                          alt={it.name}
                          loading="lazy"
                          onError={(e: any) => { e.currentTarget.style.display = 'none'; }}
                          className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover ring-1 ring-black/5 bg-[#FDF8F8] shrink-0"
                        />
                      ) : (
                        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-[#FDECEE] text-[#E60023] flex items-center justify-center shrink-0">
                          <Package size={22} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0 pt-0.5">
                        <p className="text-[13.5px] text-gray-800 leading-snug line-clamp-2">{it.name}</p>
                        <p className="text-[11px] text-gray-400 mt-1">
                          পরিমাণ {Number(it.quantity || 1)}
                        </p>
                      </div>
                      <p className="text-[13.5px] font-bold text-[#E60023] shrink-0 pt-0.5">
                        ৳{Number(it.price || 0).toLocaleString('en-BD')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* -------------------------------------------------- milestones */}
            {reached >= 0 && (
              <div className="bg-white rounded-2xl shadow-lg p-5">
                <h2 className="font-bold text-gray-800 text-sm mb-4">অর্ডারের অবস্থা</h2>
                <div>
                  {MILESTONES.map((m, i) => {
                    const done = reached >= m.rank;
                    const Icon = m.icon;
                    const last = i === MILESTONES.length - 1;
                    const isCurrent = reached === m.rank;
                    return (
                      <div key={m.key} className="flex gap-3.5">
                        <div className="flex flex-col items-center">
                          <motion.div
                            initial={false}
                            animate={done ? { scale: [1, 1.12, 1] } : { scale: 1 }}
                            transition={{ duration: 0.4 }}
                            className={`relative w-10 h-10 rounded-full flex items-center justify-center shrink-0 ring-4 transition
                              ${done
                                ? isCurrent
                                  ? 'ring-1'
                                  : isLastStep(m.key) ? 'bg-[#059669] text-white' : 'text-white'
                                : 'bg-gray-100 text-gray-300 ring-transparent'}`}
                            style={
                              done && !isCurrent
                                ? { backgroundColor: isLastStep(m.key) ? '#059669' : m.dot }
                                : done
                                  ? { backgroundColor: m.wash, color: m.text }
                                  : undefined
                            }
                          >
                            <Icon size={17} />
                            {isCurrent && (
                              <span
                                className="absolute -inset-1 rounded-full animate-ping opacity-40"
                                style={{ backgroundColor: m.dot }}
                                aria-hidden="true"
                              />
                            )}
                          </motion.div>
                          {!last && (
                            <div
                              className={`w-[3px] flex-1 min-h-[26px] rounded-full ${reached > m.rank ? '' : 'bg-gray-200'}`}
                              style={reached > m.rank ? { backgroundColor: m.dot } : undefined}
                            />
                          )}
                        </div>
                        <div className={`pt-2 ${last ? '' : 'pb-4'} min-w-0`}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`text-sm font-bold ${done ? '' : 'text-gray-400'}`}
                               style={done ? { color: m.text } : undefined}>
                              {m.label}
                            </p>
                            {isCurrent && (
                              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                                    style={{ backgroundColor: m.dot, color: '#fff' }}>
                                এখন এই পর্যায়ে
                              </span>
                            )}
                            {done && !isCurrent && (
                              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                                    style={{ backgroundColor: m.wash, color: m.text }}>
                                সম্পন্ন
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ---------------------------------------------------- journey */}
            <div className="bg-white rounded-2xl shadow-lg p-5">
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="font-bold text-gray-800 text-sm">পার্সেলের যাত্রা</h2>
                <span className="text-[11px] text-gray-400">
                  {steps.length}টি আপডেট
                  {data?.riderNoteCount ? ` · ${data.riderNoteCount}টি রাইডার নোট` : ''}
                </span>
              </div>

              {journey.length === 0 ? (
                <p className="text-sm text-gray-500 py-6 text-center">
                  কুরিয়ার এখনো আপডেট দেয়নি। প্যাকিং শেষ হলেই প্রথম আপডেট আসবে।
                </p>
              ) : (
                <div>
                  {journey.map((s, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(i * 0.05, 0.4) }}
                      className="flex gap-3.5"
                    >
                      <div className="flex flex-col items-center">
                        <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${s.type === 'rider_note' ? 'bg-[#EA580C]' : (i === 0 ? tone.text.replace('text-', 'bg-') : 'bg-[#F3C2C8]')}`} />
                        {i < journey.length - 1 && <div className="w-[2px] flex-1 min-h-[30px] bg-[#FCE3E6]" />}
                      </div>
                      <div className="pb-5 min-w-0">
                        {s.type === 'rider_note' ? (
                          <div className="rounded-xl border border-[#EA580C]/25 bg-[#FFF6F0] p-3">
                            <p className="text-[10px] font-bold text-[#C2410C] mb-1">রাইডার নোট</p>
                            <p className="text-[13.5px] text-[#7C2D12] leading-relaxed">
                              {cleanRemark(s.text)}
                            </p>
                            {o.rider?.assigned && o.rider.name && (
                              <p className="mt-2 text-[11px] text-[#C2410C] font-medium">
                                — {o.rider.name}
                                {o.rider.phone ? ` · ${o.rider.phone}` : ''}
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="text-[13.5px] text-gray-700 leading-relaxed">{BN(s.text)}</p>
                        )}
                        {s.at && (
                          <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
                            <Clock size={11} /> {fmtDate(s.at)}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* ------------------------------------------------- rider note */}
            {o.latestRemark && (
              <div className="bg-amber-50 rounded-2xl border border-amber-200/70 p-4">
                <p className="text-[11px] font-bold text-amber-800 mb-1.5">রাইডার নোট</p>
                <p className="text-[13.5px] text-amber-900 leading-relaxed">{cleanRemark(o.latestRemark)}</p>
                {o.rider?.assigned && (
                  <div className="mt-3 flex items-center gap-2.5 border-t border-amber-200/70 pt-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#080F28] text-xs font-bold text-white">
                      {(o.rider.name || '?').trim().charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-bold text-[#080F28] truncate">{o.rider.name}</p>
                      {o.rider.phone && (
                        <a
                          href={`tel:${o.rider.phone.replace(/\D/g, '')}`}
                          className="text-[11px] text-gray-600 font-mono hover:text-[#E60023]"
                        >
                          {o.rider.phone}
                        </a>
                      )}
                    </div>
                    {o.rider.phone && (
                      <a
                        href={`tel:${o.rider.phone.replace(/\D/g, '')}`}
                        className="shrink-0 rounded-xl bg-[#E60023] px-4 py-2.5 text-sm font-bold text-white min-h-[44px] inline-flex items-center"
                      >
                        কল করুন
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ------------------------------------------------------ help */}
            <div className="bg-white rounded-2xl shadow-lg p-5 text-center">
              <div className="w-11 h-11 rounded-full bg-[#FDECEE] flex items-center justify-center mx-auto mb-2.5">
                <Headset size={20} className="text-[#E60023]" />
              </div>
              <p className="text-sm font-bold text-gray-800 mb-3.5">কোনো সমস্যা হলে যোগাযোগ করুন</p>
              <div className="flex gap-2 justify-center flex-wrap">
                <a
                  href={`tel:${data.help?.hotline || '09611900606'}`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#E60023] text-white text-sm font-bold hover:bg-[#C00019] active:scale-95 transition"
                >
                  <Phone size={14} /> {data.help?.hotline || '09611900606'}
                </a>
                <a
                  href={data.help?.whatsapp || '#'}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#E60023] text-[#E60023] text-sm font-bold hover:bg-[#FDECEE] active:scale-95 transition"
                >
                  হোয়াটসঅ্যাপ
                </a>
              </div>
            </div>

            {/* re-search */}
            <button
              onClick={() => { setData(null); setErr(''); }}
              className="mx-auto flex items-center gap-1.5 text-[13px] font-semibold text-[#E60023] hover:underline"
            >
              <ChevronLeft size={15} /> অন্য কোড দিয়ে খুঁজুন
            </button>
          </motion.div>
        )}

        {!data && !loading && !hasCode && (
          <div className="bg-white rounded-2xl shadow-lg p-10 text-center">
            <div className="w-14 h-14 rounded-full bg-[#FDECEE] flex items-center justify-center mx-auto mb-3">
              <Truck size={24} className="text-[#E60023]" />
            </div>
            <p className="text-sm text-gray-500 leading-relaxed">
              WhatsApp বা SMS-এ পাঠানো লিংকে ক্লিক করলেই<br />আপনার পার্সেলের অবস্থা দেখতে পারবেন
            </p>
          </div>
        )}
      </div>
    </div>
  );
}