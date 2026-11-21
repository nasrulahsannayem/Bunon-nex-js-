/**
 * UX primitives for the admin panel (PHASE 2).
 *
 * These exist because the admin pages each hand-rolled their own header, filters
 * and table, which is why the panel looked inconsistent and broke on phones.
 *
 * Kept separate from components/admin/ui.tsx, which already exports StatCard /
 * SectionHeader / StatusPill. That is why the stat tile here is MetricCard.
 *
 * Rules encoded here:
 *  - every page gets the same header rhythm (title + subtitle + actions)
 *  - every data table degrades to a card list below `md` instead of scrolling
 *    sideways off the screen
 *  - filters wrap and stack on small screens
 */

import { ReactNode, useState, useEffect } from 'react';
import { ChevronDown, Search, X, Inbox } from 'lucide-react';

/* ──────────────────────────────────────────────────────────────── PageHeader */

export function PageHeader({
title,
subtitle,
icon,
actions,
}: {
title: string;
subtitle?: string;
icon?: ReactNode;
actions?: ReactNode;
}) {
return (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6">
    <div className="flex items-center gap-3 min-w-0">
      {icon && (
        <span className="shrink-0 w-10 h-10 rounded-xl bg-brand-primary/10 text-brand-primary grid place-items-center">
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <h1 className="text-lg sm:text-2xl font-black text-slate-800 tracking-tight truncate">{title}</h1>
        {subtitle && <p className="text-xs sm:text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);
}

/* ──────────────────────────────────────────────────────────────────── Button */

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
children,
onClick,
variant = 'secondary',
disabled,
type = 'button',
className = '',
title,
}: {
children: ReactNode;
onClick?: () => void;
variant?: BtnVariant;
disabled?: boolean;
type?: 'button' | 'submit';
className?: string;
title?: string;
}) {
const base =
  'inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const styles: Record<BtnVariant, string> = {
  primary: 'bg-brand-primary text-white hover:opacity-90',
  secondary: 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100',
};
return (
  <button type={type} onClick={onClick} disabled={disabled} title={title} className={`${base} ${styles[variant]} ${className}`}>
    {children}
  </button>
);
}

/* ───────────────────────────────────────────────────────────────── CardShell */

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
return <div className={`bg-white border border-slate-200 rounded-2xl shadow-sm ${className}`}>{children}</div>;
}

/* ──────────────────────────────────────────────────────────────── MetricCard */

export function MetricCard({
label,
value,
hint,
tone = 'default',
}: {
label: string;
value: ReactNode;
hint?: string;
tone?: 'default' | 'good' | 'warn' | 'bad';
}) {
const tones = {
  default: 'text-slate-800',
  good: 'text-emerald-600',
  warn: 'text-amber-600',
  bad: 'text-red-600',
};
return (
  <Card className="p-3.5 sm:p-4">
    <p className="text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wide truncate">{label}</p>
    <p className={`text-lg sm:text-2xl font-black mt-1 ${tones[tone]}`}>{value}</p>
    {hint && <p className="text-[11px] text-slate-400 mt-0.5 truncate">{hint}</p>}
  </Card>
);
}

/* ───────────────────────────────────────────────────────────────── SearchBox */

export function SearchBox({
value,
onChange,
placeholder = 'Search…',
}: {
value: string;
onChange: (v: string) => void;
placeholder?: string;
}) {
return (
  <div className="relative flex-1 min-w-0">
    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15"
    />
    {value && (
      <button type="button" onClick={() => onChange('')} aria-label="Clear" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
        <X size={15} />
      </button>
    )}
  </div>
);
}

/* ────────────────────────────────────────────────────────────────── FilterBar */

export function FilterBar({ children }: { children: ReactNode }) {
return (
  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap mb-3 sm:mb-4">{children}</div>
);
}

/* ─────────────────────────────────────────────────────────────────────── Tabs */

export function Tabs({
tabs,
active,
onChange,
}: {
tabs: { key: string; label: string; count?: number }[];
active: string;
onChange: (k: string) => void;
}) {
return (
  <div className="flex gap-1 overflow-x-auto pb-1 mb-4 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
    {tabs.map((t) => {
      const on = t.key === active;
      return (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          aria-current={on ? 'true' : undefined}
          className={`shrink-0 px-3 sm:px-4 py-2 rounded-xl text-[13px] font-semibold whitespace-nowrap transition-colors ${
            on ? 'bg-brand-primary text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          {t.label}
          {typeof t.count === 'number' && (
            <span className={`ml-1.5 text-[11px] ${on ? 'text-white/80' : 'text-slate-400'}`}>{t.count}</span>
          )}
        </button>
      );
    })}
  </div>
);
}

/* ───────────────────────────────────────────────────────────────── Collapse */

export function Collapse({
title,
children,
defaultOpen = false,
}: {
title: ReactNode;
children: ReactNode;
defaultOpen?: boolean;
}) {
const [open, setOpen] = useState(defaultOpen);
return (
  <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      className="w-full flex items-center justify-between gap-2 px-3.5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
    >
      <span className="truncate">{title}</span>
      <ChevronDown size={16} className={`shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} />
    </button>
    {open && <div className="px-3.5 pb-3.5 pt-0.5 border-t border-slate-100">{children}</div>}
  </div>
);
}

/* ───────────────────────────────────────────────────────────────── EmptyState */

export function EmptyState({ message = 'Nothing here yet', icon }: { message?: string; icon?: ReactNode }) {
return (
  <div className="py-12 text-center text-slate-400">
    <div className="mb-2 flex justify-center">{icon || <Inbox size={32} />}</div>
    <p className="text-sm font-medium">{message}</p>
  </div>
);
}

/* ──────────────────────────────────────────────────────────────── ModalSheet */

export function ModalSheet({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  // FIX-13 (mobile-first modal): this sheet is used by 8 admin pages, so the
  // fixes belong here rather than in each page.
  //  - lock body scroll while open, otherwise the page behind scrolls under the
  //    sheet on iOS and the user loses their place after closing
  //  - close on Escape
  //  - dvh + safe-area padding so the sheet is not clipped by the iPhone home
  //    indicator or by the browser's collapsing address bar
  //  - 44px close target and a visible drag handle on phones
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] sm:max-h-[92vh] overscroll-contain`}
      >
        {/* drag affordance, phones only */}
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-slate-300" />
        </div>
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 sm:py-3.5 border-b border-slate-100 shrink-0">
          <h3 className="font-bold text-slate-800 truncate text-[15px] sm:text-base">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1.5 shrink-0 grid place-items-center h-11 w-11 rounded-lg hover:bg-slate-100 active:bg-slate-200 text-slate-500"
          >
            <X size={20} />
          </button>
        </div>
        {/* pb keeps the last field above the iOS home indicator */}
        <div className="overflow-y-auto overscroll-contain p-4 sm:p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────── Badge */

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue' }) {
const tones = {
  slate: 'bg-slate-100 text-slate-700',
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
  blue: 'bg-blue-50 text-blue-700',
};
return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}

/**
 * Responsive data table.
 *
 * On phones a wide table is unusable: it scrolls off-screen and rows lose their
 * meaning. Below `md` this renders one card per row via the `mobile` render prop.
 */
export function DataTable<T>({
rows,
columns,
mobile,
rowKey,
empty = 'No records found',
loading,
}: {
rows: T[];
columns: { key: string; header: string; render: (row: T) => ReactNode; className?: string }[];
mobile?: (row: T) => ReactNode;
rowKey: (row: T, index: number) => string | number;
empty?: string;
loading?: boolean;
}) {
if (loading) {
  return (
    <div className="py-12 text-center text-sm text-slate-400">
      <div className="inline-block w-5 h-5 border-2 border-slate-300 border-t-brand-primary rounded-full animate-spin" />
      <p className="mt-2">Loading…</p>
    </div>
  );
}
if (!rows.length) return <EmptyState message={empty} />;

return (
  <>
    {/* Desktop: real table */}
    <div className="hidden md:block overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            {columns.map((c) => (
              <th key={c.key} className={`text-left font-semibold text-slate-600 py-2.5 px-3 ${c.className || ''}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={rowKey(r, i)} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
              {columns.map((c) => (
                <td key={c.key} className={`py-2.5 px-3 align-middle ${c.className || ''}`}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    {/* Mobile: card list */}
    {mobile && (
      <div className="md:hidden space-y-2.5">
        {rows.map((r, i) => (
          <div key={rowKey(r, i)} className="border border-slate-200 rounded-xl bg-white p-3.5 shadow-sm">
            {mobile(r)}
          </div>
        ))}
      </div>
    )}
  </>
);
}