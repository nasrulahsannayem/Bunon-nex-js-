import { AlertTriangle, X } from 'lucide-react';

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

// Shared delete-confirm modal (Bengali). Reused by order/user/product deletes.
export default function ConfirmModal({ open, title, message, confirmLabel = 'ডিলিট করুন', cancelLabel = 'বাতিল', busy = false, onConfirm, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 text-rose-600">
            <AlertTriangle size={20} />
            <h3 className="font-bold text-slate-800">{title}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <p className="text-sm text-slate-600 mt-3">{message}</p>
        <div className="grid grid-cols-2 gap-2 mt-5">
          <button onClick={onClose} className="py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">{cancelLabel}</button>
          <button onClick={onConfirm} disabled={busy} className="py-2.5 rounded-xl bg-rose-600 text-white text-sm font-bold hover:bg-rose-700 disabled:opacity-50">{busy ? '...' : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
