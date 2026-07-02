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
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 30, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 350, damping: 26 }}
          className="fixed bottom-6 right-4 md:right-6 z-[150] max-w-sm w-[92%] md:w-[360px] bg-white border border-gray-100 shadow-2xl rounded-2xl overflow-hidden p-5"
        >
          {/* Close Button */}
          <button
            onClick={handleDismiss}
            className="absolute top-3.5 right-3.5 p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-full transition-all"
          >
            <X size={16} />
          </button>

          {/* Icon Header */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-primary to-pink-500 flex items-center justify-center text-white shadow-lg shadow-brand-primary/20">
              <Bell className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <span className="text-[10px] text-brand-primary font-bold uppercase tracking-wider">Bunon VIP Club</span>
              <h3 className="text-sm font-bold text-gray-900 leading-tight">নোটিফিকেশন অন করুন ⚡</h3>
            </div>
          </div>

          {/* Description */}
          <p className="text-xs text-gray-600 mt-4 leading-relaxed font-medium">
            বুনন ফেব্রিক্স-এর লিমিটেড স্টক আপডেট, ফ্ল্যাশ সেল অফার এবং বিশেষ ডিসকাউন্ট কোডগুলো সবার আগে পেতে নোটিফিকেশনটি চালু রাখুন!
          </p>

          {/* Bullet points */}
          <div className="mt-3.5 space-y-2">
            <div className="flex items-center gap-2 text-[11px] text-gray-500">
              <Gift className="w-3.5 h-3.5 text-brand-primary flex-shrink-0" />
              <span>প্রতি সপ্তাহে বিশেষ মেম্বার-অনলি ডিসকাউন্ট কোড</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-gray-500">
              <ShieldCheck className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
              <span>সহজেই ওয়ান-ক্লিক আন-সাবস্ক্রাইব করার সুবিধা</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2.5 mt-5">
            <button
              onClick={handleDismiss}
              className="flex-1 py-2 px-3 text-xs font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-50 border border-gray-200 rounded-xl transition-all"
            >
              পরে করবো
            </button>
            <button
              onClick={handleSubscribe}
              className="flex-1 py-2 px-3 text-xs font-semibold text-white bg-brand-primary hover:bg-brand-primary-dark shadow-md shadow-brand-primary/10 rounded-xl transition-all"
            >
              হ্যাঁ, অন করুন
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
