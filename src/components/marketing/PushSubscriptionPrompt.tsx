import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, ShieldCheck, Gift } from 'lucide-react';
import { useLocation } from 'react-router-dom';

const loadScript = (src: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject();
    document.head.appendChild(script);
  });
};

const registerDevicePushToken = async () => {
  try {
    localStorage.setItem('bunon_push_subscribed', 'true');
    let deviceToken = localStorage.getItem('bunon_device_token');
    
    try {
      // Load Firebase Compat CDN scripts dynamically
      await loadScript('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
      await loadScript('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');
      
      const firebase = (window as any).firebase;
      if (firebase) {
        let fcmApp;
        if (firebase.apps.length > 0) {
          fcmApp = firebase.apps[0];
        } else {
          fcmApp = firebase.initializeApp({
            apiKey: "AIzaSyCBoR-xYiuPSIw8PQu_kN52D7rLL5PCG5A",
            authDomain: "nupur-ai-engine-480322.firebaseapp.com",
            projectId: "nupur-ai-engine-480322",
            storageBucket: "nupur-ai-engine-480322.firebasestorage.app",
            messagingSenderId: "1046784973762",
            appId: "1:1046784973762:web:084c3979b8216a171ed45b"
          });
        }
        
        const messaging = fcmApp.messaging();
        
        // Register FCM Service Worker explicitly to match path
        const reg = await navigator.serviceWorker.register('/sw.js');
        
        // Get FCM Token using Web Push VAPID key
        const fcmToken = await messaging.getToken({
          serviceWorkerRegistration: reg,
          vapidKey: 'BOmUE2O3sEUlEclkS33cKCPt4feUG1O-A6jvB16gckshZn_cis1eove_-MwDlbpe6po9sBf_Nba1vWsdz4v_zFg'
        });
        
        if (fcmToken) {
          deviceToken = fcmToken;
          localStorage.setItem('bunon_device_token', fcmToken);
        }
      }
    } catch (fcmErr) {
      // Silently fall back to local ID
    }

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

    return deviceToken;
  } catch (error) {
    return null;
  }
};

export default function PushSubscriptionPrompt() {
  const [isOpen, setIsOpen] = useState(false);
  const [isIOSDevice, setIsIOSDevice] = useState(false);
  const location = useLocation();

  useEffect(() => {
    // Detect if device is iOS (iPhone/iPad/iPod)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOSDevice(isIOS);

    // If native notification permission is already granted, register in the background
    if ('Notification' in window && Notification.permission === 'granted') {
      registerDevicePushToken();
      return;
    }

    // Check if user already subscribed, permanently denied, or recently dismissed
    const isSubscribed = localStorage.getItem('bunon_push_subscribed');
    const dismissedTime = localStorage.getItem('bunon_push_dismissed_time');

    // Throttle prompt display: if dismissed, don't show again for 24 hours
    if (isSubscribed) return;
    if (dismissedTime) {
      const hoursPassed = (Date.now() - Number(dismissedTime)) / (1000 * 60 * 60);
      if (hoursPassed < 24) return;
    }

    // Trigger conditions: 6 seconds wait OR on Order Success page immediately
    const isOrderSuccessPage = location.pathname === '/order-received';
    const delay = isOrderSuccessPage ? 1000 : 6000;

    const timer = setTimeout(() => {
      setIsOpen(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [location.pathname]);

  const handleSubscribe = async () => {
    setIsOpen(false);
    
    if (!('Notification' in window)) {
      // If iOS, they must add to Home Screen first
      if (isIOSDevice) {
        alert('iOS ডিভাইসে পুশ নোটিফিকেশন পেতে বুনন ফেব্রিক্স-কে হোম স্ক্রিনে যুক্ত করুন। (নিচের Share আইকনে ক্লিক করে Add to Home Screen সিলেক্ট করুন)');
      } else {
        alert('আপনার ব্রাউজারটি পুশ নোটিফিকেশন সাপোর্ট করে না। গুগল ক্রোম বা সাফারি আপডেট করুন।');
      }
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      
      if (permission === 'granted') {
        const token = await registerDevicePushToken();
        if (token) {
          // Trigger a native welcome notification
          try {
            new Notification('বুনন ফেব্রিক্স', {
              body: '🎉 স্বাগতম! সফলভাবে নোটিফিকেশন সাবস্ক্রাইব করা হয়েছে। নতুন অফারগুলো সবার আগে পাবেন!',
              icon: '/placeholder.png'
            });
          } catch (e) {
            // Silently swallow native notification errors
          }
        }
      } else {
        localStorage.setItem('bunon_push_dismissed_time', Date.now().toString());
      }
    } catch (error) {
      // Silently swallow permission error logs
    }
  };

  const handleDismiss = () => {
    setIsOpen(false);
    localStorage.setItem('bunon_push_dismissed_time', Date.now().toString());
  };

  const showIOSGuide = isIOSDevice && !('Notification' in window);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed bottom-[88px] md:bottom-6 right-4 md:right-6 z-[150] max-w-sm w-[92%] md:w-[380px] pointer-events-none">
          <motion.div
            initial={{ opacity: 0, y: 80, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
            className="w-full bg-white/95 backdrop-blur-xl border border-pink-100/50 shadow-[0_20px_50px_rgba(226,19,110,0.15)] rounded-2xl overflow-hidden p-6 relative pointer-events-auto"
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
                <h3 className="text-base font-bold text-gray-900 leading-tight mt-0.5 font-display">
                  {showIOSGuide ? 'হোম স্ক্রিনে যুক্ত করুন 📱' : 'নোটিফিকেশন অন করুন ⚡'}
                </h3>
              </div>
            </div>

            {/* Description */}
            <p className="text-xs text-gray-600 mt-4 leading-relaxed font-semibold font-sans">
              {showIOSGuide 
                ? 'iOS ডিভাইসে সরাসরি অফার নোটিফিকেশন পেতে বুনন ফেব্রিক্স-কে হোম স্ক্রিনে যুক্ত করুন:' 
                : 'বুনন ফেব্রিক্স-এর লিমিটেড স্টক আপডেট, ফ্ল্যাশ সেল অফার এবং বিশেষ ডিসকাউন্ট কোডগুলো সবার আগে পেতে নোটিফিকেশনটি চালু রাখুন!'}
            </p>

            {/* iOS Guide Steps or Standard Bullet points */}
            {showIOSGuide ? (
              <div className="mt-4 space-y-3 p-3 bg-gray-50/80 rounded-xl border border-gray-100 font-sans">
                <div className="flex gap-2 text-xs font-semibold text-gray-700">
                  <span className="text-brand-primary">১.</span>
                  <span>সাফারি ব্রাউজারের নিচে থাকা <strong>শেয়ার (Share)</strong> আইকনে চাপ দিন।</span>
                </div>
                <div className="flex gap-2 text-xs font-semibold text-gray-700">
                  <span className="text-brand-primary">২.</span>
                  <span>মেনু স্ক্রল করে নিচে নামুন এবং <strong>'Add to Home Screen'</strong> সিলেক্ট করুন।</span>
                </div>
                <div className="flex gap-2 text-xs font-semibold text-gray-700">
                  <span className="text-brand-primary">৩.</span>
                  <span>এবার হোম স্ক্রিনে তৈরি হওয়া Bunon Fabrics অ্যাপটি ওপেন করলেই পুশ নোটিফিকেশন অন হয়ে যাবে!</span>
                </div>
              </div>
            ) : (
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
            )}

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleDismiss}
                className="flex-1 py-2.5 px-4 text-xs font-bold text-gray-500 hover:text-gray-800 hover:bg-gray-100/60 border border-gray-200/80 rounded-xl transition-all duration-200 font-sans"
              >
                পরে করবো
              </button>
              {!showIOSGuide && (
                <button
                  onClick={handleSubscribe}
                  className="flex-1 py-2.5 px-4 text-xs font-bold text-white bg-gradient-to-r from-brand-primary to-pink-500 hover:from-brand-primary-dark hover:to-pink-600 shadow-lg shadow-brand-primary/20 active:scale-[0.98] rounded-xl transition-all duration-200 font-sans"
                >
                  হ্যাঁ, অন করুন
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
