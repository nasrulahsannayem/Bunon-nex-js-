import { useEffect, useState } from 'react';
import { SeoHead } from '../components/SeoHead';
import { useLocation, useSearchParams, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { CheckCircle2, ChevronRight, Home as HomeIcon, Clipboard, Check } from 'lucide-react';
import { trackPixel } from '../lib/woocommerce';

export default function OrderReceived() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const [copied, setCopied] = useState(false);
  
  const orderId = searchParams.get('order_id') || location.state?.orderId || 'N/A';
  const paymentMethod = searchParams.get('method') || searchParams.get('gateway') || location.state?.method || 'cod';
  const total = searchParams.get('total') || location.state?.total || '0';
  const isPaid = ['bkash', 'paystation'].includes(paymentMethod.toLowerCase());

  useEffect(() => {
    window.scrollTo(0, 0);

    // 📥 ব্রাউজার মেমরি (localStorage) থেকে চেকআউটের সময় জমিয়ে রাখা হাই-কোয়ালিটি ডাটা রিড করুন
    const pendingPurchaseData = localStorage.getItem('bf_pending_purchase');

    if (pendingPurchaseData && orderId && orderId !== 'N/A') {
      try {
        const payload = JSON.parse(pendingPurchaseData);
        
        // 🛠️ নিশ্চিত করা যে URL এর রিয়েল অর্ডার আইডি এবং ট্র্যাকিং আইডি নিখুঁতভাবে মিলছে (EMQ Boost)
        payload.transaction_id = String(orderId);
        if (payload.user_data) {
          payload.user_data.external_id = String(orderId);
        }

        // 🔥 মেটা পিক্সেল অফিসিয়াল 'Purchase' ইভেন্ট ফায়ার (সব ডেটা গ্রিডসহ)
        console.log('[PIXEL] Firing official Purchase Event with 100/100 EMQ Data Grid...');
        trackPixel('Purchase', payload);

        // 🧻 সেফটি প্রটেকশন: ফায়ার হওয়া মাত্রই মেমরি ডিলিট (যাতে পেজ রিফ্রেশ দিলে ডুপ্লিকেট হিট না হয়)
        localStorage.removeItem('bf_pending_purchase');

      } catch (error) {
        console.error('[PIXEL ERROR] Failed to parse pending tracking data:', error);
      }
    }
  }, [orderId]);

  // ইনভয়েস আইডি কপি করার কাস্টম ফাংশন কাস্টমার এক্সপেরিয়েন্স বাড়ানোর জন্য
  const copyOrderId = () => {
    if (orderId && orderId !== 'N/A') {
      navigator.clipboard.writeText(orderId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  <SeoHead noindex={true} />
    return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="relative overflow-hidden border-b border-black/5 bg-white py-8 text-center shadow-sm">
        <div className="relative max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="text-sm text-gray-500 flex items-center justify-center gap-1.5 mb-1.5">
            <Link className="inline-flex items-center gap-1 hover:text-gray-900" to="/">
              <HomeIcon className="w-4 h-4" />
              <span>Home</span>
            </Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-gray-900">Success</span>
          </nav>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Order Received</h1>
        </div>
      </header>

      <div className="max-w-[800px] mx-auto px-4 sm:px-6 mt-10">
        <motion.div
           initial={{ opacity: 0, scale: 0.95 }}
           animate={{ opacity: 1, scale: 1 }}
           className="bg-white rounded-3xl border border-black/5 shadow-sm p-8 sm:p-12 text-center"
        >
          <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-500" />
          </div>
          
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Thank you!</h2>
          <p className="text-gray-500 mb-8 max-w-sm mx-auto">Your order has been received and is now being processed. We will send you an update shortly.</p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 bg-gray-50 rounded-2xl p-6 mb-8 text-left border border-gray-100">
            <div>
              <p className="text-xs text-gray-500 uppercase font-semibold tracking-wider mb-1">Order Number</p>
              <div className="flex items-center gap-1.5 font-bold text-gray-900 cursor-pointer select-none" onClick={copyOrderId}>
                <span>#{orderId || 'NEW'}</span>
                {orderId !== 'N/A' && (
                  copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Clipboard className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600 transition-colors" />
                )}
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase font-semibold tracking-wider mb-1">Date</p>
              <p className="font-bold text-gray-900">{new Date().toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase font-semibold tracking-wider mb-1">Total</p>
              <p className="font-bold text-brand-primary tabular-nums">৳{window.location.search.includes('total=') ? Number(total).toLocaleString() : parseFloat(total).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase font-semibold tracking-wider mb-1">Payment Method</p>
              <p className="font-bold text-gray-900 truncate">
                {isPaid ? paymentMethod.toUpperCase() : 'Cash on Delivery'}
              </p>
            </div>
          </div>

          {!isPaid && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8 text-amber-800 text-sm font-medium">
              Please keep exact change ready for the delivery partner.
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-10">
            <a 
              href={`https://api.whatsapp.com/send?phone=8801618775368&text=${encodeURIComponent(`আসসালামু আলাইকুম Bunon Shop,\nআমি একটি অর্ডার করেছি।\n\nঅর্ডার আইডি: #${orderId}\nমোট বিল: ৳${window.location.search.includes('total=') ? Number(total).toLocaleString() : parseFloat(total).toLocaleString()}\n\nদয়া করে অর্ডারটি কনফার্ম করে দিবেন। ধন্যবাদ।`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="h-12 sm:h-14 px-8 inline-flex items-center justify-center gap-2.5 bg-[#25D366] text-white font-bold rounded-full hover:bg-[#128C7E] transition-all shadow-[0_3px_10px_rgba(37,211,102,0.2)] hover:shadow-[0_6px_16px_rgba(37,211,102,0.3)] hover:-translate-y-0.5 animate-[pulse_2s_infinite]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-5 h-5 sm:w-6 sm:h-6" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.489-1.761-1.663-2.06-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
              </svg>
              WhatsApp-এ কনফার্ম করুন
            </a>

            <Link to="/shop" className="h-12 sm:h-14 px-8 inline-flex items-center justify-center bg-gray-900 text-white font-semibold rounded-full hover:bg-gray-800 transition-all shadow-sm">
              Continue Shopping
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
