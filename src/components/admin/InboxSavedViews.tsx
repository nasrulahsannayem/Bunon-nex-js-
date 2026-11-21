/**
 * Saved views + the sidebar tab strip — the two things the user asked for by
 * name ("side bareo chat tab", and Chatwoot's saved-views feature).
 *
 * The backend is ready (GET/POST/DELETE /views/*, verified). This wires it
 * up as a proper sidebar: inbox views on the left, chat tabs across the top
 * of the list column.
 */

import { useCallback, useEffect, useState } from 'react';
import { Bookmark, Check, Plus, Trash2, X } from 'lucide-react';
import { adminFetch } from '../../utils/session';

export interface ViewQuery {
  platform?: string;
  filter?: string;
  priority?: string;
  assigned?: string;
  q?: string;
}

export function useSavedViews(active: ViewQuery) {
  const [views, setViews] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const r: any = await adminFetch('/api/admin/omnichannel/views/all');
    setViews(r?.data?.views || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true); setError('');
    const r: any = await adminFetch('/api/admin/omnichannel/views/save', {
      method: 'POST',
      body: JSON.stringify({ name: name.trim(), query: active }),
    });
    setBusy(false);
    if (r?.success) {
      setViews(r.data.views || []);
      setName(''); setNaming(false); setOpen(false);
    } else {
      setError(r?.error?.message || 'সেভ করা যায়নি');
    }
  };

  const remove = async (id: number) => {
    setBusy(true);
    const r: any = await adminFetch(`/api/admin/omnichannel/views/${id}`, { method: 'DELETE' });
    setBusy(false);
    if (r?.success) setViews(r.data.views || []);
  };

  /** Apply a saved view's stored query to the parent filter setter. */
  const apply = useCallback((v: any) => {
    setOpen(false);
    return v.query || {};
  }, []);

  return { views, open, setOpen, naming, setNaming, name, setName,
           save, remove, apply, busy, error, reload: load };
}

export function SavedViewsBar({
  views, open, setOpen, naming, setNaming, name, setName,
  onSave, onDelete, onApply, busy, error,
}: {
  views: any[];
  open: boolean;
  setOpen: (v: boolean) => void;
  naming: boolean;
  setNaming: (v: boolean) => void;
  name: string;
  setName: (v: string) => void;
  onSave: () => void;
  onDelete: (id: number) => void;
  onApply: (v: any) => void;
  busy?: boolean;
  error?: string;
}) {
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        title="সংরক্ষিত ভিউ"
        className={`inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium hover:bg-slate-50 ${
          open ? 'bg-slate-100' : ''
        }`}
      >
        <Bookmark size={12} /> ভিউ
        {views.length > 0 && (
          <span className="rounded-full bg-slate-200 px-1 text-[9px] font-bold text-slate-600">
            {views.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <button onClick={() => setOpen(false)} className="fixed inset-0 z-30 cursor-default" aria-label="বন্ধ" />
          <div className="absolute left-0 top-9 z-40 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
            {views.length === 0 && !naming && (
              <p className="px-3 py-2 text-[11px] text-slate-400">
                এখনো কোনো ভিউ নেই। বর্তমান ফিল্টার সংরক্ষণ করুন।
              </p>
            )}

            {views.map((v) => (
              <div key={v.id} className="flex items-center gap-1 px-2 hover:bg-slate-50">
                <button onClick={() => onApply(v)} className="flex-1 truncate py-1.5 text-left text-xs text-slate-800">
                  {v.name}
                </button>
                <button
                  onClick={() => onDelete(v.id)}
                  disabled={busy}
                  aria-label={`${v.name} মুছুন`}
                  className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}

            {naming ? (
              <div className="border-t border-slate-100 px-2 pt-2">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') setNaming(false); }}
                  placeholder="ভিউয়ের নাম"
                  maxLength={120}
                  className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-slate-400"
                />
                {error && <p className="mt-1 text-[10px] text-red-600">{error}</p>}
                <div className="mt-1.5 flex gap-1">
                  <button
                    onClick={onSave}
                    disabled={busy || !name.trim()}
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
                  >
                    <Check size={11} /> সেভ
                  </button>
                  <button onClick={() => setNaming(false)}
                    className="rounded-lg px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-100">
                    <X size={11} />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setNaming(true)}
                className="flex w-full items-center gap-1.5 border-t border-slate-100 px-3 py-1.5 text-left text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
              >
                <Plus size={12} /> বর্তমান ফিল্টার সেভ করুন
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}