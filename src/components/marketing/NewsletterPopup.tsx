import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Gift, CheckCircle } from 'lucide-react';

export default function NewsletterPopup() {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    // Check if user has already seen the popup or subscribed
    const hasSeenPopup = localStorage.getItem('bunon_newsletter_seen');
    const isSubscribed = localStorage.getItem('bunon_newsletter_subscribed');

    if (hasSeenPopup || isSubscribed) {
      return;
    }

    // Trigger popup after 10 seconds or on exit intent
    const timer = setTimeout(() => {
      setIsOpen(true);
      localStorage.setItem('bunon_newsletter_seen', 'true');
    }, 10000);

    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 0 && !localStorage.getItem('bunon_newsletter_seen')) {
        setIsOpen(true);
        localStorage.setItem('bunon_newsletter_seen', 'true');
      }
    };

    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) return;

    setLoading(true);
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const data = await res.json();
      if (res.ok) {
        setSubscribed(true);
        localStorage.setItem('bunon_newsletter_subscribed', 'true');
        
        // Close after 3 seconds
        setTimeout(() => setIsOpen(false), 3000);
      } else {
        alert(data.message || 'Failed to subscribe. Try again.');
      }
    } catch (error) {
      alert('Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-black/60 z-[100] backdrop-blur-sm"
          />

          {/* Popup Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-[90%] max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row"
          >
            {/* Close Button */}
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-3 right-3 p-1.5 bg-gray-100 text-gray-500 hover:bg-gray-200 rounded-full transition-colors z-10"
            >
              <X size={18} />
            </button>

            <div className="p-8 md:p-10 text-center w-full relative overflow-hidden">
              {/* Background Decoration */}
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-brand-primary to-pink-400"></div>

              {!subscribed ? (
                <>
                  <div className="w-16 h-16 bg-brand-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Gift className="w-8 h-8 text-brand-primary" />
                  </div>
                  
                  <h3 className="text-2xl font-bold text-gray-900 mb-2 font-bengali leading-tight">
                    ১০% স্পেশাল ডিসকাউন্ট!
                  </h3>
                  <p className="text-gray-500 mb-6 font-bengali text-sm leading-relaxed">
                    আপনার প্রথম অর্ডারে ১০% ডিসকাউন্ট পেতে ইমেইল দিয়ে এখনই সাবস্ক্রাইব করুন। ডিসকাউন্ট কোড আপনার ইমেইলে পাঠিয়ে দেওয়া হবে।
                  </p>

                  <form onSubmit={handleSubscribe} className="space-y-3 relative">
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="আপনার ইমেইল অ্যাড্রেস লিখুন"
                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none transition-all"
                      />
                    </div>
                    
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-brand-primary text-white py-3 rounded-xl font-bold hover:bg-brand-secondary transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                      {loading ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        'ডিসকাউন্ট কোড নিন'
                      )}
                    </button>
                  </form>
                  <p className="text-[10px] text-gray-400 mt-4">
                    * By subscribing you agree to our terms and conditions.
                  </p>
                </>
              ) : (
                <div className="py-8">
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6"
                  >
                    <CheckCircle className="w-10 h-10 text-green-600" />
                  </motion.div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2 font-bengali">
                    ধন্যবাদ! 🎉
                  </h3>
                  <p className="text-gray-600 mb-6 font-bengali">
                    আপনার ইমেইলে ডিসকাউন্ট কোডটি পাঠানো হয়েছে। ইনবক্স (অথবা স্প্যাম ফোল্ডার) চেক করুন।
                  </p>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="bg-gray-900 text-white px-8 py-2.5 rounded-lg font-medium hover:bg-gray-800 transition-colors"
                  >
                    শপিং শুরু করুন
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
