import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, ShieldCheck, Gift } from 'lucide-react';
import { useLocation } from 'react-router-dom';

export default function PushSubscriptionPrompt() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    // Check if user already subscribed, permanently denied, or recently dismissed
    const isSubscribed = localStorage.getItem('bunon_push_subscribed');
    const dismissedTime = localStorage.getItem('bunon_push_dismissed_time');

    // Throttle prompt display: if dismissed, don't show again for 24 hours
    if (isSubscribed) return;
    if (dismissedTime) {
      const hoursPassed = (Date.now() - Number(dismissedTime)) / (1000 * 60 * 60);
      if (hoursPassed < 24) return;
    }

    // Trigger conditions: 12 seconds wait OR on Order Success page immediately
    const isOrderSuccessPage = location.pathname === '/order-received';
    const delay = isOrderSuccessPage ? 2000 : 12000;

    const timer = setTimeout(() => {
      setIsOpen(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [location.pathname]);

  const handleSubscribe = async () => {
    setIsOpen(false);
    
    if (!('Notification' in window)) {
      alert('আপনার ব্রাউজারটি পুশ নোটিফিকেশন সাপোর্ট করে না।');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      
      if (permission === 'granted') {
        localStorage.setItem('bunon_push_subscribed', 'true');
        
        // Generate a persistent mock device token for browser notifications
        let deviceToken = localStorage.getItem('bunon_device_token');
        if (!deviceToken) {
          deviceToken = 'web_push_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
          localStorage.setItem('bunon_device_token', deviceToken);
        }

        // Post the token to the server
        await fetch('/api/auth/device-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: deviceToken, platform: 'web' })
        });

        // Trigger a native welcome notification
        try {
          new Notification('বুনন ফেব্রিক্স', {
            body: '🎉 স্বাগতম! সফলভাবে নোটিফিকেশন সাবস্ক্রাইব করা হয়েছে। নতুন অফারগুলো সবার আগে পাবেন!',
            icon: '/placeholder.png'
          });
        } catch (e) {
          // Fallback if direct Notification constructor is blocked in mobile browsers without active SW
          console.log('Native notification alert fallback');
        }
      } else {
        // Permission denied
        localStorage.setItem('bunon_push_dismissed_time', Date.now().toString());
      }
    } catch (error) {
      console.error('Error subscribing to push notifications:', error);
    }
  };

  const handleDismiss = () => {
    setIsOpen(false);
    localStorage.setItem('bunon_push_dismissed_time', Date.now().toString());
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 80, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 320, damping: 24 }}
          className="fixed bottom-6 right-4 md:right-6 z-[150] max-w-sm w-[92%] md:w-[380px] bg-white/95 backdrop-blur-xl border border-pink-100/50 shadow-[0_20px_50px_rgba(226,19,110,0.15)] rounded-2xl overflow-hidden p-6 relative"
        >
          {/* Subtle Pink/Purple background glow */}
          <div className="absolute -top-10 -right-10 w-24 h-24 bg-brand-primary/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-24 h-24 bg-pink-400/10 rounded-full blur-2xl pointer-events-none" />

          {/* Close Button */}
          <button
            onClick={handleDismiss}
            className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100/80 rounded-full transition-all duration-200"
          >
            <X size={15} />
          </button>

          {/* Icon Header */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-primary to-pink-500 flex items-center justify-center text-white shadow-xl shadow-brand-primary/20 flex-shrink-0">
              <Bell className="w-7 h-7 animate-bounce" />
            </div>
            <div>
              <span className="text-[10px] text-brand-primary font-bold uppercase tracking-widest font-sans">Bunon Privilege</span>
              <h3 className="text-base font-bold text-gray-900 leading-tight mt-0.5 font-display">নোটিফিকেশন অন করুন ⚡</h3>
            </div>
          </div>

          {/* Description */}
          <p className="text-xs text-gray-600 mt-4 leading-relaxed font-semibold font-sans">
            বুনন ফেব্রিক্স-এর লিমিটেড স্টক আপডেট, ফ্ল্যাশ সেল অফার এবং বিশেষ ডিসকাউন্ট কোডগুলো সবার আগে পেতে নোটিফিকেশনটি চালু রাখুন!
          </p>

          {/* Bullet points */}
          <div className="mt-4 space-y-2.5">
            <div className="flex items-center gap-2.5 text-[11px] text-gray-600 font-medium font-sans">
              <div className="w-5 h-5 rounded-full bg-pink-50 flex items-center justify-center flex-shrink-0 text-brand-primary">
                <Gift className="w-3 h-3" />
              </div>
              <span>প্রতি সপ্তাহে বিশেষ মেম্বার-অনলি ডিসকাউন্ট কোড</span>
            </div>
            <div className="flex items-center gap-2.5 text-[11px] text-gray-600 font-medium font-sans">
              <div className="w-5 h-5 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0 text-green-600">
                <ShieldCheck className="w-3 h-3" />
              </div>
              <span>সহজেই ওয়ান-ক্লিক আন-সাবস্ক্রাইব করার সুবিধা</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-6">
            <button
              onClick={handleDismiss}
              className="flex-1 py-2.5 px-4 text-xs font-bold text-gray-500 hover:text-gray-800 hover:bg-gray-100/60 border border-gray-200/80 rounded-xl transition-all duration-200 font-sans"
            >
              পরে করবো
            </button>
            <button
              onClick={handleSubscribe}
              className="flex-1 py-2.5 px-4 text-xs font-bold text-white bg-gradient-to-r from-brand-primary to-pink-500 hover:from-brand-primary-dark hover:to-pink-600 shadow-lg shadow-brand-primary/20 active:scale-[0.98] rounded-xl transition-all duration-200 font-sans"
            >
              হ্যাঁ, অন করুন
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
