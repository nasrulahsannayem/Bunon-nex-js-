import { CheckCircle2, Headphones, PackageCheck, Phone, ShoppingBag, ArrowRight } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

export default function LandingOrderReceived() {
  const [params] = useSearchParams();
  const orderId = params.get('order_id') || '';
  const total = params.get('total') || '';

  return (
    <main className="min-h-screen bg-[#fbfaf8] px-4 py-8 text-[#171821] [font-family:'Hind Siliguri','Noto Sans Bengali',sans-serif] sm:px-6 sm:py-12">
      <div className="mx-auto max-w-xl">
        <div className="rounded-[28px] border border-black/5 bg-white p-6 text-center shadow-[0_20px_70px_rgba(25,28,38,.08)] sm:p-10">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 size={42} />
          </div>

          <div className="mt-6 text-xs font-black uppercase tracking-[.18em] text-emerald-600">Order confirmed</div>
          <h1 className="mt-2 text-3xl font-black leading-tight">আপনার অর্ডারটি সফলভাবে নেওয়া হয়েছে 🎉</h1>
          <p className="mt-3 text-sm leading-7 text-[#6d707b]">
            ধন্যবাদ। আমাদের টিম আপনার অর্ডারটি প্রসেস করবে এবং প্রয়োজনে ফোন করে কনফার্ম করবে।
          </p>

          <div className="mt-7 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-[#f6f5f1] p-4 text-left">
              <div className="text-[10px] font-bold text-[#8a8d97]">ORDER ID</div>
              <div className="mt-1 text-sm font-black">#{orderId || '—'}</div>
            </div>
            <div className="rounded-2xl bg-[#f6f5f1] p-4 text-left">
              <div className="text-[10px] font-bold text-[#8a8d97]">TOTAL</div>
              <div className="mt-1 text-sm font-black">৳{total || '—'}</div>
            </div>
          </div>

          <div className="mt-7 space-y-2 text-left">
            {[
              [PackageCheck, 'অর্ডার প্রসেসিং', 'আপনার অর্ডারটি প্রস্তুত করা হবে।'],
              [Headphones, 'কাস্টমার সাপোর্ট', 'প্রয়োজনে আমাদের টিম যোগাযোগ করবে।'],
              [ShoppingBag, 'ডেলিভারি', 'ডেলিভারি পার্টনারের মাধ্যমে পণ্য পাঠানো হবে।'],
            ].map(([Icon, title, text]) => (
              <div key={title as string} className="flex gap-3 rounded-2xl border border-black/5 p-3.5">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#a30e18]/10 text-[#a30e18]">
                  <Icon size={17} />
                </div>
                <div>
                  <div className="text-sm font-black">{title as string}</div>
                  <div className="mt-0.5 text-xs leading-5 text-[#777a84]">{text as string}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-7 flex flex-col gap-2 sm:flex-row">
            <a href="/" className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#171821] text-sm font-black text-white">
              <ShoppingBag size={17} /> শপে ফিরে যান
            </a>
            <a href="tel:09611900606" className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-black/10 text-sm font-black">
              <Phone size={17} /> সাপোর্ট
            </a>
          </div>
        </div>

        <p className="mt-5 text-center text-xs font-semibold text-[#999ca5]">
          পছন্দ আপনার, পৌঁছে দেওয়ার দায়িত্ব আমাদের।
        </p>
      </div>
    </main>
  );
}
