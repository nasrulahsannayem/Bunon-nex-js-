import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Copy, Eye, EyeOff, Link2 } from 'lucide-react';
import ImagePicker from '../../components/ImagePicker';
import { SectionHeader, StatusPill } from '../../components/admin/ui';


type FieldType = 'text' | 'textarea' | 'image' | 'color' | 'select' | 'number' | 'password' | 'boolean';
interface SchemaField {
  key: string; label: string; type: FieldType;
  password?: boolean; options?: string[] | { value: string; label: string }[];
}
interface SchemaGroup { group: string; label?: string; fields: SchemaField[]; }

const LEGACY: SchemaGroup[] = [
  { group: 'general', label: 'General', fields: [
    { key: 'site_name', label: 'Site Name', type: 'text' },
    { key: 'marquee_text', label: 'Scrolling Notice', type: 'textarea' },
  ]},
  { group: 'courier', label: 'Courier / Delivery', fields: [
    { key: 'delivery_charge_dhaka', label: 'Delivery Charge (Inside Dhaka)', type: 'number' },
    { key: 'delivery_charge_outside', label: 'Delivery Charge (Outside Dhaka)', type: 'number' },
  ]},
];

const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('bunon_token')}` });
const MASKED = '***';
const SECRET_HINT = 'Unchanged if left as-is (stored value hidden)';

// A field is secret if explicitly marked OR its key looks like a credential.
// Secrets are never displayed, copied, or logged unless explicitly revealed
// by an authorized user via the audit-logged reveal endpoint.
const isSecretField = (f: SchemaField) =>
  f.type === 'password' || !!f.password || /token|secret|key|password|username/i.test(f.key);

// Backend contract (implemented server-side, audit-logged, manage_settings-gated):
//   GET /api/admin/settings/:key?reveal=1  ->  { ok: true, key, value }
// Until that endpoint exists the eye toggle reports "Reveal unavailable".
const revealSecret = async (key: string): Promise<string | null> => {
  try {
    const r = await fetch(`/api/admin/settings/${encodeURIComponent(key)}?reveal=1`, { headers: auth() });
    const d = await r.json();
    if (d && d.ok && typeof d.value === 'string' && d.value !== MASKED) return d.value;
    return null;
  } catch {
    return null;
  }
};

const copyText = async (text: string): Promise<boolean> => {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
};



function CopyButton({ value, label, disabled, title }: { value: string; label: string; disabled?: boolean; title?: string }) {
  const [done, setDone] = useState(false);
  const onCopy = async () => {
    if (disabled || !value || value === MASKED) return;
    const ok = await copyText(value);
    if (ok) {
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      disabled={disabled || !value || value === MASKED}
      title={title || `Copy ${label}`}
      aria-label={`Copy ${label}`}
      className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-brand-primary hover:border-brand-primary/40 hover:bg-brand-primary/5 text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
    >
      {done ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

export default function SettingsManager() {
  const [schema, setSchema] = useState<SchemaGroup[]>([]);
  const [schemaMode, setSchemaMode] = useState(true);
  const [values, setValues] = useState<Record<string, string>>({});
  const [initial, setInitial] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<Record<string, boolean>>({});
  const [revealError, setRevealError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const canEditSettings = useMemo(() => {
    try {
      const u = JSON.parse(localStorage.getItem('bunon_user') || '{}');
      if (u.role === 'super_admin' || u.role === 'admin') return true;
      const perms: string[] = Array.isArray(u.permissions) ? u.permissions : [];
      if (perms.length === 0) return true;
      return perms.includes('manage_settings');
    } catch { return true; }
  }, []);
  const readOnly = !canEditSettings;

  useEffect(() => {
    (async () => {
      let groups: SchemaGroup[] | null = null;
      try {
        const r = await fetch('/api/admin/settings/schema', { headers: auth() });
        const d = await r.json();
        if (d.ok && Array.isArray(d.schema) && d.schema.length) groups = d.schema;
      } catch { /* fallback below */ }
      if (!groups) { groups = LEGACY; setSchemaMode(false); }
      setSchema(groups);
      try {
        const r = await fetch('/api/admin/settings', { headers: auth() });
        const d = await r.json();
        if (d.ok && d.settings) {
          const flat: Record<string, string> = {};
          for (const g of groups) for (const f of g.fields) {
            const v = d.settings[f.key];
            flat[f.key] = v == null ? '' : String(v);
          }
          setValues(flat); setInitial(flat);
        }
      } catch { /* leave empty */ }
      setLoading(false);
    })();
  }, []);

  const set = (k: string, v: string) => {
    setValues(p => ({ ...p, [k]: v }));
    // Typing a new value discards any revealed value for that key
    setRevealed(p => {
      if (!(k in p)) return p;
      const n = { ...p };
      delete n[k];
      return n;
    });
  };

  const changed = useMemo(() => {
    const out: Record<string, string> = {};
    for (const k of Object.keys(values)) {
      const v = values[k] ?? '';
      if (v !== (initial[k] ?? '') && !(v === '' && (initial[k] ?? '') === MASKED)) out[k] = v;
    }
    return out;
  }, [values, initial]);
  const dirtyCount = Object.keys(changed).length;
  const resetAll = () => { setValues({ ...initial }); setRevealed({}); };
  const GROUP_ICON: Record<string, string> = { site: '🏠', social: '📣', courier: '🚚', meta: '📊', checkout: '🛒', eman: '🔑' };
  const q = query.trim().toLowerCase();
  const filtered = q ? schema.map(g => ({ ...g, fields: g.fields.filter(f => (f.label + ' ' + f.key).toLowerCase().includes(q)) })).filter(g => g.fields.length) : schema;
  const groupDone = (g: SchemaGroup) => g.fields.filter(isConfigured).length;

  const handleSave = async () => {
    if (!dirtyCount || saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { ...auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify(changed),
      });
      const data = await res.json();
      if (data.ok) {
        alert('Settings updated successfully!');
        setInitial({ ...values });
        setRevealed({});
        try {
          const r = await fetch('/api/admin/settings', { headers: auth() });
          const d = await r.json();
          if (d.ok && d.settings) {
            const flat: Record<string, string> = { ...values };
            for (const k of Object.keys(values)) {
              if (d.settings[k] != null && String(d.settings[k]) !== MASKED) flat[k] = String(d.settings[k]);
            }
            setValues(flat); setInitial(flat);
          }
        } catch { /* verified optimistically */ }
      } else alert(data.msg || 'Failed to update settings!');
    } catch { alert('Server error!'); }
    setSaving(false);
  };

  const toggleReveal = async (f: SchemaField) => {
    const k = f.key;
    if (revealed[k]) {
      setRevealed(p => {
        const n = { ...p };
        delete n[k];
        return n;
      });
      return;
    }
    if (readOnly || revealing[k]) return;
    setRevealing(p => ({ ...p, [k]: true }));
    setRevealError('');
    const val = await revealSecret(k);
    setRevealing(p => ({ ...p, [k]: false }));
    if (val == null) {
      setRevealError(`Could not reveal "${f.label}" — reveal service unavailable or not permitted. Type a new value to rotate it.`);
    } else {
      setRevealed(p => ({ ...p, [k]: val }));
    }
  };

  // A key counts as configured when the server reports a masked secret,
  // a revealed secret, or a non-empty plain value.
  const isConfigured = (f: SchemaField) => {
    const v = initial[f.key] ?? '';
    if (isSecretField(f)) return v === MASKED || !!revealed[f.key];
    return v !== '' && v !== MASKED;
  };

  if (loading) return <div className="text-center py-20 animate-pulse">Loading...</div>;

  const inputCls = 'w-full h-12 border border-gray-300 px-3 rounded-xl outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition disabled:bg-gray-50 disabled:text-gray-400 text-sm';
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://bunon.shop';
  const webhooks = [
    {
      name: 'Steadfast Status Update',
      url: `${origin}/api/steadfast/status-update`,
      hint: 'POST, পাবলিক। HMAC X-Signature (steadfast_webhook_secret) + idempotency সহ। Steadfast প্যানেলে এই URL বসান।',
      linkKeys: ['steadfast_api_key', 'steadfast_webhook_secret'],
    },
    {
      name: 'Meta Webhook (Verify + Events)',
      url: `${origin}/api/meta/webhook`,
      hint: 'GET verify + POST events। Meta App dashboard-এ বসান।',
      linkKeys: ['meta_capi_token'],
    },
    {
      name: 'bKash Callback',
      url: `${origin}/api/payment/bkash-callback?order_id={order_id}&wid={id}&token={token}`,
      hint: 'GET। পেমেন্ট তৈরির সময় অটো-বসে — হাতে বসাতে হয় না।',
      linkKeys: ['bkash_username'],
    },
    {
      name: 'PayStation Callback',
      url: `${origin}/api/payment/paystation-callback?order_id={order_id}`,
      hint: 'GET। পেমেন্ট তৈরির সময় অটো-বসে — হাতে বসাতে হয় না।',
      linkKeys: [],
    },
  ];

  const renderField = (f: SchemaField) => {
    const v = values[f.key] ?? '';
    const secret = isSecretField(f);
    if (f.type === 'image') {
      return (
        <div className="min-h-12 flex items-center">
          {readOnly
            ? (v ? <img src={v} alt={f.label} className="h-12 w-12 object-cover rounded-lg border" /> : <p className="text-sm text-gray-400">—</p>)
            : <ImagePicker value={v} onChange={url => set(f.key, url)} />}
        </div>
      );
    }
    if (f.type === 'textarea') {
      return <textarea name={f.key} value={v} disabled={readOnly} onChange={e => set(f.key, e.target.value)} rows={3} className={`${inputCls} h-auto py-3 resize-y`} placeholder={f.label} />;
    }
    if (f.type === 'color') {
      return (
        <div className="flex items-center gap-2 min-h-12">
          <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(v) ? v : '#000000'} disabled={readOnly} onChange={e => set(f.key, e.target.value)} className="h-12 w-14 shrink-0 rounded-xl border border-gray-300 bg-white p-1 cursor-pointer disabled:cursor-not-allowed" />
          <input type="text" value={v} disabled={readOnly} onChange={e => set(f.key, e.target.value)} className={`${inputCls} flex-1 min-w-0`} placeholder="#000000" />
          {v ? <span className="h-8 w-8 rounded-lg border shrink-0" style={{ background: v }} /> : null}
        </div>
      );
    }
    if (f.type === 'select' || f.type === 'boolean') {
      const opts = f.type === 'boolean'
        ? [{ value: 'true', label: 'On' }, { value: 'false', label: 'Off' }]
        : (f.options || []).map(o => typeof o === 'string' ? { value: o, label: o } : o);
      return (
        <select value={v} disabled={readOnly} onChange={e => set(f.key, e.target.value)} className={`${inputCls} bg-white`}>
          <option value="">— Select —</option>
          {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }
    if (secret) {
      const shown = revealed[f.key];
      return (
        <div className="flex items-center gap-2 min-w-0">
          <input
            type={shown ? 'text' : 'password'}
            value={shown ?? (v === MASKED ? '' : v)}
            disabled={readOnly}
            readOnly={!!shown && v === MASKED}
            onChange={e => set(f.key, e.target.value)}
            className={`${inputCls} flex-1 min-w-0 font-mono`}
            placeholder={SECRET_HINT}
            autoComplete="new-password"
            data-lpignore="true"
            data-1p-ignore="true"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => toggleReveal(f)}
            disabled={readOnly || !!revealing[f.key]}
            title={shown ? `Hide ${f.label}` : `Show ${f.label} (reveals are audit-logged)`}
            aria-label={shown ? `Hide ${f.label}` : `Show ${f.label}`}
            className="p-2.5 rounded-lg border border-gray-200 text-gray-500 hover:text-brand-primary hover:border-brand-primary/40 transition disabled:opacity-40 shrink-0"
          >
            {shown ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <CopyButton value={shown ?? ''} label={f.label} disabled={readOnly || !shown} title={shown ? `Copy ${f.label}` : 'Reveal the value first to copy it'} />
        </div>
      );
    }
    // Non-secret value: visible input + safe copy button.
    return (
      <div className="flex items-center gap-2 min-w-0">
        <input type={f.type === 'number' ? 'number' : 'text'} name={f.key} value={v} disabled={readOnly} onChange={e => set(f.key, e.target.value)} className={`${inputCls} flex-1 min-w-0`} placeholder={f.label} autoComplete="off" spellCheck={false} />
        <CopyButton value={v} label={f.label} disabled={readOnly} />
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-10 max-w-7xl mx-auto overflow-x-clip">
      <SectionHeader title="Site Settings" sub="API কী, ইন্টিগ্রেশন ও স্টোর সেটিংস। সিক্রেট reveal না-করা পর্যন্ত masked থাকে।" right={
        dirtyCount > 0 ? <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full">{dirtyCount} unsaved change{dirtyCount > 1 ? 's' : ''}</span> : undefined
      } />
      <div className="relative">
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="🔍 সেটিং খুঁজুন... (যেমন: bkash, pixel, charge)" className="w-full border border-gray-200 rounded-xl pl-4 pr-10 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary bg-white" />
        {query && <button onClick={() => setQuery('')} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 text-sm">✕</button>}
      </div>
      {q && <p className="text-xs text-gray-500 -mt-3">"{query}" — {filtered.length} গ্রুপে মিলেছে</p>}

      {readOnly && (
        <p className="text-sm bg-blue-50 border border-blue-100 text-blue-800 p-3 rounded-xl">
          You are viewing as staff — changes require an admin account (updates are admin-only).
        </p>
      )}
      {!schemaMode && (
        <p className="text-xs text-gray-400">Server schema unavailable — showing basic settings.</p>
      )}
      {revealError && (
        <p className="text-sm bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-xl">{revealError}</p>
      )}

      {/* Settings card grid: 1 column on mobile, 2 columns side-by-side on md+ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 items-start">
        {filtered.map(g => {
          const done = groupDone(g);
          const pct = g.fields.length ? Math.round(done * 100 / g.fields.length) : 0;
          return (
          <section
            key={g.group}
            className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-gray-100 min-w-0"
          >
            <div className="flex items-center gap-2 pb-2 mb-1 border-b border-gray-100">
              <span className="text-lg shrink-0">{GROUP_ICON[g.group] || '⚙️'}</span>
              <h2 className="font-bold text-brand-navy leading-6 truncate">{g.label || g.group}</h2>
              <span className="ml-auto text-[11px] text-gray-400 shrink-0">{done}/{g.fields.length}</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full mb-1 overflow-hidden">
              <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-rose-400'}`} style={{ width: pct + '%' }} />
            </div>
            <div className="space-y-4 pt-3">
              {g.fields.map(f => {
                const dirty = (values[f.key] ?? '') !== (initial[f.key] ?? '');
                return (
                <div key={f.key} className={`min-w-0 rounded-xl p-2 -m-2 transition ${dirty ? 'bg-amber-50 ring-1 ring-amber-300' : ''}`}>
                  <div className="flex items-center justify-between gap-2 mb-1.5 min-h-5">
                    <label htmlFor={`set-${f.key}`} className="block text-sm font-semibold text-gray-700 leading-5 truncate">{f.label}{dirty && <span className="ml-1 text-[10px] text-amber-600 font-bold">• edited</span>}</label>
                    <StatusPill status={isConfigured(f) ? 'completed' : 'incomplete'} />
                  </div>
                  {renderField(f)}
                </div>);
              })}
            </div>
          </section>);
        })}
        {filtered.length === 0 && <div className="col-span-full text-center text-gray-400 py-10 text-sm">কিছু পাওয়া যায়নি — অন্য নামে খুঁজুন</div>}

        {/* Webhook URLs card */}
        <section className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-gray-100 min-w-0">
          <div className="flex items-center gap-2 pb-3 mb-1 border-b border-gray-100">
            <Link2 size={16} className="text-brand-primary shrink-0" />
            <h2 className="font-bold text-brand-navy leading-6 truncate">Webhook URLs</h2>
            <span className="ml-auto text-[11px] text-gray-400 shrink-0">{webhooks.length} endpoints</span>
          </div>
          <div className="space-y-4 pt-3">
            {webhooks.map(w => {
              const keys: string[] = (w as any).linkKeys || [];
              const ok = keys.length === 0 || keys.some(k => { const v = initial[k] ?? ''; return v !== '' && v !== '***' && v !== MASKED; });
              return (
              <div key={w.name} className="min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <p className="text-sm font-semibold text-gray-700 truncate">{w.name}</p>
                  <StatusPill status={ok ? 'completed' : 'incomplete'} />
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <code className="flex-1 min-w-0 block text-xs font-mono text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 truncate" title={w.url}>{w.url}</code>
                  <CopyButton value={w.url} label={w.name} disabled={readOnly} />
                </div>
                <p className="text-[11px] text-gray-400 mt-1 leading-4">{w.hint}</p>
              </div>);
            })}
          </div>
        </section>
      </div>

      {!readOnly && (
        <div className="sticky bottom-0 z-20 -mx-1 px-1 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-white via-white/95 to-transparent sm:static sm:bg-none sm:p-0 sm:z-auto">
          <motion.button
            whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
            onClick={handleSave} disabled={saving || !dirtyCount}
            className="w-full bg-brand-primary text-white py-3 rounded-xl font-bold shadow-lg shadow-brand-primary/30 disabled:opacity-50"
          >
            {saving ? 'Saving...' : dirtyCount ? `Update Settings (${dirtyCount})` : 'Update Settings'}
          </motion.button>
          {dirtyCount > 0 && <button onClick={resetAll} className="w-full mt-2 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-bold hover:bg-gray-50">↩ বাতিল করুন (reset)</button>}
        </div>
      )}
    </div>
  );
}
