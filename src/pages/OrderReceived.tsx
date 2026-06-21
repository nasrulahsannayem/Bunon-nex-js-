import { useEffect, useState } from 'react';
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
            <Link to="/shop" className="h-12 px-8 inline-flex items-center justify-center bg-brand-primary text-white font-semibold rounded-xl hover:brightness-105 transition-all shadow-sm">
              Continue Shopping
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}