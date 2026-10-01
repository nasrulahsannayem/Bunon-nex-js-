import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShoppingBag, Bell, Tag, Sparkles } from 'lucide-react';
import { getProducts, Product } from '../../lib/woocommerce';
import { useNavigate } from 'react-router-dom';

const BD_NAMES = [
  'মিলি', 'নিপা', 'সুবর্ণা', 'তাসনিম', 'সাদিয়া', 'রিয়া', 'ফাতেমা', 'মিম', 
  'আয়েশা', 'সুমাইয়া', 'ফারহানা', 'নুসরাত', 'লিমি', 'আনিকা', 'তানজিলা', 'জেরিন'
];

const BD_CITIES = [
  'ঢাকা', 'চট্টগ্রাম', 'সিলেট', 'রাজশাহী', 'খুলনা', 'বরিশাল', 'রংপুর', 'ময়মনসিংহ',
  'কুমিল্লা', 'নারায়ণগঞ্জ', 'গাজীপুর', 'বগুড়া', 'ফেনী', 'যশোর', 'টাঙ্গাইল', 'সাভার'
];

type NotificationType = 'purchase' | 'price_drop' | 'new_arrival' | 'discount';

interface LiveNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  product?: Product;
  timeText: string;
}

import ProductImage from '../ProductImage';
export default function SocialProofNotifications() {
  const [products, setProducts] = useState<Product[]>([]);
  const [currentNotification, setCurrentNotification] = useState<LiveNotification | null>(null);
  const [showCount, setShowCount] = useState(0);
  const navigate = useNavigate();

  // Load products once
  useEffect(() => {
    getProducts().then(data => {
      if (data && data.length > 0) {
        setProducts(data);
      }
    }).catch(err => console.error("Error loading products for notifications:", err));
  }, []);

  // Main loop to generate and show notifications
  useEffect(() => {
    if (products.length === 0) return;

    // Show first notification after 6 seconds
    const firstTimer = setTimeout(() => {
      triggerRandomNotification();
    }, 6000);

    // Setup interval for subsequent notifications (every 45 seconds)
    const interval = setInterval(() => {
      if (showCount < 4) { // Limit to 4 notifications per session/page-view
        triggerRandomNotification();
      }
    }, 45000);

    return () => {
      clearTimeout(firstTimer);
      clearInterval(interval);
    };
  }, [products, showCount]);

  const triggerRandomNotification = () => {
    if (products.length === 0) return;

    const randomProduct = products[Math.floor(Math.random() * products.length)];
    const types: NotificationType[] = ['purchase', 'price_drop', 'new_arrival', 'discount'];
    const selectedType = types[Math.floor(Math.random() * types.length)];

    let newNotification: LiveNotification;
    const randomName = BD_NAMES[Math.floor(Math.random() * BD_NAMES.length)];
    const randomCity = BD_CITIES[Math.floor(Math.random() * BD_CITIES.length)];

    const id = Math.random().toString();
    const timeText = 'এইমাত্র';

    const cleanPrice = (priceStr: string) => {
      return Number(priceStr.replace(/[^0-9.-]+/g, '')) || 0;
    };

    const regularPrice = cleanPrice(randomProduct.regular_price || randomProduct.price);
    const salePrice = cleanPrice(randomProduct.price);

    switch (selectedType) {
      case 'purchase':
        newNotification = {
          id,
          type: 'purchase',
          title: '🎉 নতুন অর্ডার সম্পন্ন!',
          message: `${randomCity} থেকে ${randomName} এইমাত্র "${randomProduct.name}" অর্ডার করেছেন।`,
          product: randomProduct,
          timeText
        };
        break;

      case 'price_drop':
        const discountAmt = Math.max(50, regularPrice - salePrice || 100);
        newNotification = {
          id,
          type: 'price_drop',
          title: '🔥 দাম কমেছে অফার!',
          message: `"${randomProduct.name}"-এ ৳${discountAmt} বিশেষ ছাড়! আজকের মূল্য মাত্র ৳${salePrice}`,
          product: randomProduct,
          timeText
        };
        break;

      case 'new_arrival':
        newNotification = {
          id,
          type: 'new_arrival',
          title: '⚡ নতুন কালেকশন যুক্ত হয়েছে!',
          message: `আমাদের স্টক-এ চমৎকার "${randomProduct.name}" যুক্ত করা হয়েছে। এখনই সংগ্রহ করুন!`,
          product: randomProduct,
          timeText
        };
        break;

      case 'discount':
      default:
        const randomPromo = [50, 100, 150][Math.floor(Math.random() * 3)];
        newNotification = {
          id,
          type: 'discount',
          title: '🎁 বিশেষ ছাড় অফার!',
          message: `আজকে অর্ডার করলেই পাবেন ফ্ল্যাট ৳${randomPromo} ডিসকাউন্ট! কোড: BUNON${randomPromo}`,
          product: randomProduct,
          timeText
        };
        break;
    }

    setCurrentNotification(newNotification);
    setShowCount(prev => prev + 1);

    // Auto-dismiss after 8 seconds
    setTimeout(() => {
      setCurrentNotification(prev => prev?.id === id ? null : prev);
    }, 8000);
  };

  const handleNotificationClick = () => {
    if (currentNotification?.product) {
      navigate(`/product/${currentNotification.product.id}`);
      setCurrentNotification(null);
    }
  };

  return (
    <AnimatePresence>
      {currentNotification && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="fixed bottom-20 left-4 md:left-6 z-[99] max-w-sm w-[90%] md:w-[350px] bg-white/95 backdrop-blur-md border border-gray-100 shadow-2xl rounded-2xl overflow-hidden cursor-pointer hover:shadow-gray-300/40 hover:-translate-y-0.5 transition-all duration-200"
          onClick={handleNotificationClick}
        >
          {/* Top Info Bar */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-50 bg-gray-50/50">
            <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span>bunon.shop • লাইভ আপডেট</span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setCurrentNotification(null);
              }}
              className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {/* Body Content */}
          <div className="p-4 flex gap-3.5 items-start">
            {/* Product Thumbnail or Icon */}
            {currentNotification.product?.images?.[0]?.src ? (
              <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-50 border border-gray-100/80 flex-shrink-0">
                <ProductImage
                  src={currentNotification.product.images[0]}
                  alt={currentNotification.product.name}
                  className="w-full h-full object-cover object-center"
                />
              </div>
            ) : (
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-brand-primary/10 to-pink-500/10 flex items-center justify-center text-brand-primary border border-brand-primary/10 flex-shrink-0">
                {currentNotification.type === 'purchase' && <ShoppingBag size={24} />}
                {currentNotification.type === 'price_drop' && <Tag size={24} />}
                {currentNotification.type === 'new_arrival' && <Sparkles size={24} />}
                {currentNotification.type === 'discount' && <Bell size={24} />}
              </div>
            )}

            {/* Message Details */}
            <div className="flex-grow min-w-0">
              <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 font-display">
                {currentNotification.type === 'purchase' && <ShoppingBag className="w-3.5 h-3.5 text-green-500" />}
                {currentNotification.type === 'price_drop' && <Tag className="w-3.5 h-3.5 text-amber-500" />}
                {currentNotification.type === 'new_arrival' && <Sparkles className="w-3.5 h-3.5 text-brand-primary" />}
                {currentNotification.type === 'discount' && <Bell className="w-3.5 h-3.5 text-blue-500" />}
                {currentNotification.title}
              </h4>
              <p className="text-xs text-gray-600 mt-1 leading-normal font-medium font-sans">
                {currentNotification.message}
              </p>
              <span className="text-[10px] text-gray-400 mt-2 block font-normal font-sans">
                {currentNotification.timeText}
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
