import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Tag, ChevronDown, CheckCircle, X, ShieldCheck, BatteryCharging, Baby, Car, PlayCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { trackPixel } from '../lib/woocommerce';
import ProductImage from '../components/ProductImage';

export default function LandingCarBMW() {
  const navigate = useNavigate();
  
  // ==========================================
  // 🚀 PRODUCT DETAILS & STATES
  // ==========================================
  const product = {
    id: 66016,
    name: "BMW Style Baby Ride On Car",
    price: 1790,
    regularPrice: 3075,
  };

  const images = [
    'https://bunonfabrics.com/api/image-proxy?url=https%3A%2F%2Fbunon.shop%2Fimage%2Fbmw-ride-on-car%2Fbmw-ride-on-car-2.jpg',
    'https://bunonfabrics.com/api/image-proxy?url=https%3A%2F%2Fbunon.shop%2Fimage%2Fbmw-ride-on-car%2Fbmw-ride-on-car-3.jpg',
    'https://bunonfabrics.com/api/image-proxy?url=https%3A%2F%2Fbunon.shop%2Fimage%2Fbmw-ride-on-car%2Fbmw-ride-on-car-4.jpg'
  ];

  const [activeImage, setActiveImage] = useState(images[0]);
  const [loading, setLoading] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Form & Cart State
  const [quantity, setQuantity] = useState(1);
  const [formData, setFormData] = useState({
    firstName: '',
    phone: '',
    district: '',
    address1: '',
    email: '',
    paymentMethod: 'cod',
  });

  // Cancel Popup State
  const [showCancelPopup, setShowCancelPopup] = useState(false);
  const [randomDiscount, setRandomDiscount] = useState(0);
  const [appliedCancelDiscount, setAppliedCancelDiscount] = useState(0);

  const pixelFired = useRef(false);

  // ==========================================
  // 🧮 CALCULATIONS
  // ==========================================
  const calculatedSubtotal = product.price * quantity;
  const shippingCost = formData.district.toLowerCase() === 'dhaka' ? 80 : (formData.district ? 150 : 0);
  
  // Apply 50 BDT discount for both paystation and bkash
  const onlineDiscount = (formData.paymentMethod === 'paystation' || formData.paymentMethod === 'bkash') ? 50 : 0;
  
  const finalTotal = Math.max(0, calculatedSubtotal + shippingCost - onlineDiscount - appliedCancelDiscount);

  // 100% Error-Free Cookie Helper
  const getCookie = (name: string) => {
    const value = "; " + document.cookie;
    const parts = value.split("; " + name + "=");
    if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
    return null;
  };

  // ==========================================
  // 🕵️ INCOMPLETE ORDER TRACKING (100% BULLETPROOF)
  // ==========================================
  const payloadRef = useRef({ formData, quantity, finalTotal });
  payloadRef.current = { formData, quantity, finalTotal };
  const lastSentData = useRef({ phone: '', email: '' });

  useEffect(() => {
    setIsMounted(true);
    
    // Fire Pixel on Load
    if (!pixelFired.current) {
      trackPixel('ViewContent', { content_name: product.name, content_ids: [String(product.id)], value: product.price, currency: 'BDT' });
      trackPixel('InitiateCheckout', { 
        content_type: 'product', 
        content_ids: [String(product.id)], 
        num_items: quantity, 
        value: finalTotal, 
        currency: 'BDT' 
      });
      pixelFired.current = true;
    }

    // Restore Cookies for Auto-fill
    const savedPhone = getCookie('user_phone');
    const savedName = getCookie('user_name') ? decodeURIComponent(getCookie('user_name') || '') : '';
    if (savedPhone) setFormData(prev => ({ ...prev, phone: savedPhone, firstName: savedName || prev.firstName }));

    // Back Button Intercept for Popup
    window.history.pushState(null, '', window.location.pathname);
    const handlePopState = () => {
      window.history.pushState(null, '', window.location.pathname);
      handleCancelClick();
    };
    window.addEventListener('popstate', handlePopState);

    // Advanced Abandoned Cart (Exit Intent for Mobile & Desktop)
    const trackAbandonment = () => {
      if (sessionStorage.getItem('order_placed') === 'true') return;
      const currentForm = payloadRef.current.formData;
      const currentQty = payloadRef.current.quantity;
      const cleanPhone = currentForm.phone.replace(/\D/g, '');
      
      if (cleanPhone.length >= 11) {
        const addressData = currentForm.district ? currentForm.address1 + ", " + currentForm.district : currentForm.address1;
        const payload = {
          customer_name: currentForm.firstName || 'Guest',
          phone: cleanPhone,
          address: addressData,
          city: currentForm.district || '',
          email: currentForm.email || '',
          cart_products: [{ product_id: product.id, name: product.name, price: product.price, quantity: currentQty, thumbnail: images[0] }]
        };
        // sendBeacon is perfect for exit-intent capturing
        navigator.sendBeacon('/api/orders/save_to_wp.php', JSON.stringify(payload));
      }
    };

    window.addEventListener('beforeunload', trackAbandonment);
    window.addEventListener('pagehide', trackAbandonment);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') trackAbandonment();
    });

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('beforeunload', trackAbandonment);
      window.removeEventListener('pagehide', trackAbandonment);
    };
  }, []);

  // Track Incomplete Order On Blur (Every time user clicks outside input)
  const trackIncompleteOrderOnBlur = async (phoneOverride?: string) => {
    const currentData = payloadRef.current;
    const cleanPhone = (phoneOverride || currentData.formData.phone).replace(/\D/g, '');
    
    // Always save to cookies for better UX
    if (cleanPhone.length >= 11) {
      const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
      document.cookie = "user_phone=" + cleanPhone + "; expires=" + expires + "; path=/; SameSite=Lax";
      if (currentData.formData.firstName) {
        document.cookie = "user_name=" + encodeURIComponent(currentData.formData.firstName) + "; expires=" + expires + "; path=/; SameSite=Lax";
      }
    }

    if (cleanPhone.length < 11) return; // Need at least full phone number
    if (lastSentData.current.phone === cleanPhone) return; // Prevent duplicate calls for same phone
    lastSentData.current = { phone: cleanPhone, email: currentData.formData.email };

    try {
      const addressData = currentData.formData.district ? currentData.formData.address1 + ", " + currentData.formData.district : currentData.formData.address1;
      const payload = {
        customer_name: currentData.formData.firstName || 'Guest',
        phone: cleanPhone,
        address: addressData,
        city: currentData.formData.district || '',
        email: currentData.formData.email,
        cart_products: [{ product_id: product.id, name: product.name, price: product.price, quantity: currentData.quantity, thumbnail: images[0] }]
      };
      await fetch('/api/orders/save_to_wp.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    } catch (e) {
      console.log('Incomplete sync error');
    }
  };

  // ==========================================
  // 🎁 CANCEL POPUP LOGIC
  // ==========================================
  const handleCancelClick = () => {
    trackIncompleteOrderOnBlur(); // Ensure we save before they get the popup
    setRandomDiscount(50);
    setShowCancelPopup(true);
  };

  const applyCancelDiscount = () => {
    setAppliedCancelDiscount(randomDiscount);
    setFormData(prev => ({ ...prev, paymentMethod: 'paystation' })); // Encourage online payment
    setShowCancelPopup(false);
  };

  // ==========================================
  // 🚀 FINAL ORDER SUBMIT
  // ==========================================
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.phone.length !== 11 || !formData.phone.startsWith('01')) {
      alert('অনুগ্রহ করে সঠিক ১১ ডিজিটের মোবাইল নাম্বার দিন (যেমন: 01XXXXXXXXX)।');
      return;
    }
    if (!formData.district) {
      alert('অনুগ্রহ করে আপনার জেলা নির্বাচন করুন।');
      return;
    }

    setLoading(true);

    const fbpToken = getCookie('_fbp');
    const fbcToken = getCookie('_fbc');

    const checkoutPayload = {
      customer: {
        name: formData.firstName,
        phone: formData.phone,
        email: formData.email || null,
        city: formData.district,
        address: formData.address1,
        fbp: fbpToken,
        fbc: fbcToken
      },
      cart: [{
        id: product.id,
        name: product.name,
        quantity: quantity,
        price: product.price,
        thumbnail: images[0]
      }],
      paymentMethod: formData.paymentMethod,
      totalAmount: finalTotal,
      shippingFee: shippingCost,
      discount: onlineDiscount,
      coupons: appliedCancelDiscount > 0 ? [{ code: 'OFFER50', discount: String(appliedCancelDiscount) }] : []
    };

    try {
      const response = await fetch('/api/checkout/place-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(checkoutPayload)
      });
      const result = await response.json();

      if (!response.ok || result.ok === false) throw new Error(result?.msg || "Server Error");

      sessionStorage.setItem('order_placed', 'true'); // Prevent abandoned cart triggering
      
      // Clean up incomplete record if successful
      try {
        const cleanPhone = formData.phone.replace(/\D/g, '');
        fetch('/api/orders/remove_incomplete.php?phone=' + cleanPhone, { method: 'GET', keepalive: true }).catch(() => {});
      } catch (err) {}

      trackPixel('Purchase', { value: finalTotal, currency: 'BDT', content_ids: [String(product.id)], content_type: 'product' });

      if (result.gateway && result.redirectUrl) {
        window.location.href = result.redirectUrl;
        return;
      }

      setOrderSuccess(true);
      window.scrollTo(0, 0);

    } catch (error) {
      alert('অর্ডার প্লেস করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।');
    } finally {
      setLoading(false);
    }
  };

  if (!isMounted) return null;

  // ==========================================
  // 🎉 SUCCESS SCREEN (Same page, ultra-fast)
  // ==========================================
  if (orderSuccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="max-w-lg w-full bg-white rounded-3xl p-8 md:p-12 text-center shadow-2xl border border-gray-100">
          <div className="w-24 h-24 bg-green-100 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
            <CheckCircle className="w-12 h-12" />
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-gray-900 mb-4">অর্ডার সফল হয়েছে! 🎉</h1>
          <p className="text-gray-600 mb-8 text-lg">আপনার অর্ডারটি কনফার্ম করতে আমাদের প্রতিনিধি খুব শীঘ্রই আপনাকে কল করবেন। ধন্যবাদ!</p>
          
          <div className="bg-gray-50 rounded-2xl p-5 mb-8 text-left border border-gray-100">
            <p className="text-sm text-gray-500 mb-2 uppercase font-bold tracking-wider">অর্ডার সামারি</p>
            <div className="flex justify-between font-bold text-gray-900 mb-2">
              <span>{product.name} (x{quantity})</span>
              <span>৳{calculatedSubtotal}</span>
            </div>
            <div className="flex justify-between font-black text-brand-primary text-xl border-t border-gray-200 pt-3 mt-3">
              <span>সর্বমোট পে করবেন:</span>
              <span>৳{finalTotal}</span>
            </div>
          </div>

          <button onClick={() => navigate('/')} className="bg-gray-900 text-white font-bold py-4 px-8 rounded-xl w-full hover:bg-black transition-all shadow-lg shadow-gray-300">
            আরও শপিং করুন
          </button>
        </motion.div>
      </div>
    );
  }

  // ==========================================
  // 🛒 MAIN LANDING PAGE UI (Full-Width, Mobile First)
  // ==========================================
  return (
    <div className="min-h-screen bg-[#f8f9fa] pb-28 md:pb-12 font-sans overflow-x-hidden">
      
      {/* Top Banner Alert */}
      <div className="bg-gradient-to-r from-red-600 via-red-500 to-red-600 text-white text-center py-2.5 px-4 font-bold text-sm md:text-base sticky top-0 z-50 shadow-md flex items-center justify-center gap-2">
        <span className="animate-bounce">🔥</span> স্টক ফুরিয়ে যাওয়ার আগেই আজই অর্ডার করুন!
      </div>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 md:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] xl:grid-cols-[1.4fr_1fr] gap-8 lg:gap-12">
          
          {/* LEFT COLUMN: PRODUCT SHOWCASE */}
          <div className="space-y-6 md:space-y-8">
            
            {/* Title & Price Header */}
            <div className="bg-white rounded-3xl p-6 md:p-8 shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-gray-100">
              <div className="inline-flex items-center gap-1.5 bg-red-100 text-red-600 font-black px-3 py-1 rounded-full text-[11px] uppercase tracking-wider mb-4 shadow-sm">
                Top Rated 🔥
              </div>
              <h1 className="text-3xl md:text-5xl font-black text-gray-900 leading-tight mb-5">{product.name} কিডস রাইড-পুশ কার</h1>
              
              <div className="flex items-center flex-wrap gap-4 mb-2">
                <span className="text-4xl md:text-6xl font-black text-brand-primary tracking-tight">৳{product.price}</span>
                <span className="text-xl md:text-3xl text-gray-400 line-through font-bold">৳{product.regularPrice}</span>
                <span className="bg-red-100 text-red-600 font-bold px-3 py-1.5 rounded-lg text-sm shadow-sm border border-red-200">Save ৳{product.regularPrice - product.price}</span>
              </div>
            </div>

            {/* Product Main Image Viewer */}
            <div className="bg-white rounded-3xl p-4 md:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100">
              <motion.img 
                key={activeImage} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                src={activeImage} 
                className="w-full h-[350px] md:h-[550px] object-cover rounded-2xl shadow-sm border border-gray-100"
                alt="BMW Baby Car"
              />
              <div className="flex gap-3 mt-4 overflow-x-auto pb-2 custom-scrollbar justify-center">
                {images.map((img, i) => (
                  <button key={i} onClick={() => setActiveImage(img)} className={`shrink-0 rounded-xl overflow-hidden border-2 transition-all shadow-sm ${activeImage === img ? 'border-brand-primary scale-105' : 'border-transparent hover:border-gray-300'}`}>
                    <ProductImage src={img} className="w-16 h-16 md:w-24 md:h-24 object-cover" alt="" />
                  </button>
                ))}
              </div>
            </div>

            {/* 🔥 LOCAL VIDEO SECTION (Replaces YouTube Embed) */}
            <div className="bg-white rounded-3xl p-5 md:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 flex flex-col items-center text-center">
              <h3 className="font-black text-gray-900 mb-4 text-xl md:text-3xl flex items-center justify-center gap-2">
                ভিডিওতে দেখুন রিয়েল রিভিউ <PlayCircle className="w-8 h-8 text-[#e2136e] animate-pulse" />
              </h3>
              <p className="text-gray-500 mb-6 text-sm md:text-base font-medium">প্রোডাক্টটি কেমন হবে তার সঠিক ধারণা পেতে ভিডিওটি সম্পূর্ণ দেখুন</p>
              
              {/* Vertical Local Video Wrapper (9:16 Aspect Ratio) */}
              <div className="relative w-full max-w-[360px] mx-auto rounded-3xl overflow-hidden shadow-2xl bg-black border-[6px] border-gray-900" style={{ aspectRatio: '9/16' }}>
                <video 
                  src="/videos/BMW.mp4" 
                  autoPlay 
                  loop 
                  muted 
                  playsInline 
                  controls 
                  className="absolute top-0 left-0 w-full h-full object-cover"
                >
                  Your browser does not support the video tag.
                </video>
              </div>
            </div>

            {/* Free Gift Highlight */}
            <div className="bg-gradient-to-br from-[#059669] to-[#047857] rounded-3xl p-6 md:p-10 shadow-[0_15px_40px_rgba(5,150,105,0.25)] text-white relative overflow-hidden">
              <div className="absolute top-[-20%] right-[-10%] opacity-10 rotate-12"><Tag className="w-64 h-64" /></div>
              <p className="font-black text-2xl md:text-4xl mb-3 relative z-10 flex items-center gap-2">🎁 মেগা অফার চলছে!</p>
              <p className="text-emerald-50 text-base md:text-xl font-medium relative z-10 leading-relaxed max-w-xl">
                প্রতিটি অর্ডারের সাথে পাচ্ছেন একটি প্রিমিয়াম <b>স্কুল ব্যাগ</b> এবং সুন্দর এক সেট <b>স্টিকার</b> সম্পূর্ণ ফ্রি!
              </p>
            </div>

            {/* Dynamic Q&A Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)] flex gap-4 items-start">
                <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shrink-0 shadow-inner"><Baby className="w-7 h-7"/></div>
                <div><h4 className="font-black text-gray-900 mb-1.5 text-lg">উপযুক্ত বয়স</h4><p className="text-sm font-medium text-gray-500 leading-relaxed">১.৫ থেকে ৫ বছর বয়সী বাচ্চাদের জন্য পারফেক্ট।</p></div>
              </div>
              
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)] flex gap-4 items-start">
                <div className="w-14 h-14 bg-orange-50 text-orange-600 rounded-2xl flex items-center justify-center shrink-0 shadow-inner"><BatteryCharging className="w-7 h-7"/></div>
                <div><h4 className="font-black text-gray-900 mb-1.5 text-lg">কোনো ব্যাটারি লাগে না</h4><p className="text-sm font-medium text-gray-500 leading-relaxed">ম্যানুয়াল রাইড-অন কার, বাচ্চারা পা দিয়ে চালাবে।</p></div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)] flex gap-4 items-start">
                <div className="w-14 h-14 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center shrink-0 shadow-inner"><ShieldCheck className="w-7 h-7"/></div>
                <div><h4 className="font-black text-gray-900 mb-1.5 text-lg">১০০% নিরাপদ</h4><p className="text-sm font-medium text-gray-500 leading-relaxed">High-quality, non-toxic plastic ও smooth edges।</p></div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)] flex gap-4 items-start">
                <div className="w-14 h-14 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center shrink-0 shadow-inner"><Car className="w-7 h-7"/></div>
                <div><h4 className="font-black text-gray-900 mb-1.5 text-lg">ইন্ডোর ও আউটডোর</h4><p className="text-sm font-medium text-gray-500 leading-relaxed">ঘরের ভিতরে এবং বাইরে সমানভাবে চালানো যায়।</p></div>
              </div>
            </div>
            
            {/* Dimensions */}
            <div className="bg-gray-100/50 rounded-2xl p-6 border border-gray-200 text-sm md:text-base text-gray-700 text-center font-bold tracking-wide">
              📏 সাইজ: দৈর্ঘ্য: ২৩ ইঞ্চি | প্রস্থ: ৯ ইঞ্চি | উচ্চতা: ১০.৫ ইঞ্চি
            </div>
          </div>

          {/* RIGHT COLUMN: STICKY CHECKOUT FORM */}
          <div className="relative">
            <div className="lg:sticky lg:top-16 bg-white rounded-[2rem] p-6 md:p-10 shadow-[0_20px_60px_rgb(0,0,0,0.08)] border border-gray-100">
              <h2 className="text-2xl md:text-3xl font-black text-gray-900 mb-8 flex items-center gap-3 pb-5 border-b border-gray-100">
                অর্ডার করতে ফর্মটি পূরণ করুন <ArrowRight className="w-7 h-7 text-brand-primary"/>
              </h2>

              <form onSubmit={handleSubmit} className="space-y-5">
                
                {/* User Info */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">আপনার নাম <span className="text-red-500">*</span></label>
                  <input required type="text" placeholder="সম্পূর্ণ নাম লিখুন" className="w-full h-14 px-4 rounded-xl border-2 border-gray-100 focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10 outline-none bg-gray-50 focus:bg-white transition-all text-base font-semibold" value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} onBlur={() => trackIncompleteOrderOnBlur()} />
                </div>
                
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">মোবাইল নম্বর <span className="text-red-500">*</span></label>
                  <input required type="tel" maxLength={11} placeholder="01XXXXXXXXX" className="w-full h-14 px-4 rounded-xl border-2 border-gray-100 focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10 outline-none bg-gray-50 focus:bg-white transition-all text-base font-bold tracking-[0.1em]" value={formData.phone} 
                    onChange={e => {
                      const val = e.target.value.replace(/\D/g, '');
                      setFormData({...formData, phone: val});
                      if(val.length === 11) trackIncompleteOrderOnBlur(val);
                    }} 
                    onBlur={() => trackIncompleteOrderOnBlur()} 
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">জেলা নির্বাচন করুন <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <select required className="w-full h-14 px-4 rounded-xl border-2 border-gray-100 focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10 outline-none bg-gray-50 focus:bg-white transition-all appearance-none text-base font-semibold" value={formData.district} onChange={e => setFormData({...formData, district: e.target.value})} onBlur={() => trackIncompleteOrderOnBlur()}>
                      <option value="" disabled>জেলা সিলেক্ট করুন</option>
                      <option value="Dhaka">Dhaka</option>
                      <option value="Chittagong">Chittagong</option>
                      <option value="Sylhet">Sylhet</option>
                      <option value="Rajshahi">Rajshahi</option>
                      <option value="Khulna">Khulna</option>
                      <option value="Barisal">Barisal</option>
                      <option value="Rangpur">Rangpur</option>
                      <option value="Mymensingh">Mymensingh</option>
                      <option value="Other">Other</option>
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">সম্পূর্ণ ঠিকানা <span className="text-red-500">*</span></label>
                  <textarea required rows={2} placeholder="বাসা নম্বর, রোড নম্বর, এলাকা অথবা গ্রামের নাম লিখুন" className="w-full p-4 rounded-xl border-2 border-gray-100 focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10 outline-none resize-none bg-gray-50 focus:bg-white transition-all text-base font-semibold leading-relaxed" value={formData.address1} onChange={e => setFormData({...formData, address1: e.target.value})} onBlur={() => trackIncompleteOrderOnBlur()} />
                </div>

                {/* Quantity Selector */}
                <div className="flex items-center justify-between bg-white p-4 rounded-2xl border-2 border-gray-100 shadow-sm mt-2">
                   <span className="font-black text-gray-800 text-base">কয়টি নিতে চান?</span>
                   <div className="flex items-center bg-gray-50 rounded-xl overflow-hidden border border-gray-200 shadow-inner">
                      <button type="button" onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-12 h-12 flex items-center justify-center font-black text-gray-600 hover:bg-gray-200 transition-colors text-lg">-</button>
                      <span className="w-12 text-center font-black text-gray-900 text-lg">{quantity}</span>
                      <button type="button" onClick={() => setQuantity(quantity + 1)} className="w-12 h-12 flex items-center justify-center font-black text-gray-600 hover:bg-gray-200 transition-colors text-lg">+</button>
                   </div>
                </div>

                {/* Payment Methods */}
                <section className="pt-6 border-t border-gray-100">
                  <h2 className="flex items-center gap-3 mb-4 text-base font-black text-gray-900">
                    পেমেন্ট মেথড নির্বাচন করুন
                  </h2>

                  <div className="mb-4 rounded-2xl border border-[#E2136E]/20 bg-white shadow-sm p-2 overflow-hidden">
                    <div className="border border-dashed border-[#E2136E]/40 bg-gradient-to-br from-[#fff5f8] to-white rounded-xl p-3 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full border-2 border-[#E2136E] bg-white flex items-center justify-center text-[#E2136E] text-xl font-black shrink-0 shadow-[0_4px_12px_rgba(226,19,110,0.15)]">
                        ৳
                      </div>
                      <div className="flex-1 flex justify-between items-center flex-wrap gap-2">
                        <h4 className="text-[#E2136E] font-black text-sm m-0 tracking-wide">
                          অনলাইন পেমেন্ট অফার
                        </h4>
                        <span className="inline-flex items-center justify-center bg-[#E2136E] text-white text-[11px] px-3 py-1 rounded-full font-black shadow-md shadow-[#E2136E]/30 animate-pulse">
                          ৳৫০ ডিসকাউন্ট
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
                    {[
                      { id: 'bkash', title: 'বিকাশ পেমেন্ট', color: '#e2136e', bg: 'rgba(226, 19, 110, 0.03)' },
                      { id: 'paystation', title: 'নগদ, রকেট, ব্যাংক', color: '#f7941d', bg: 'rgba(247, 148, 29, 0.03)' },
                      { id: 'cod', title: 'ক্যাশ অন ডেলিভারি', color: '#059669', bg: 'rgba(5, 150, 105, 0.03)' },
                    ].map((pm) => {
                      const isSelected = formData.paymentMethod === pm.id;
                      return (
                        <label 
                          key={pm.id} 
                          className="relative flex items-center justify-center gap-2 h-12 md:h-14 px-2 rounded-xl border-2 cursor-pointer transition-all duration-200 select-none overflow-hidden"
                          style={{
                            borderColor: isSelected ? pm.color : '#f3f4f6',
                            backgroundColor: isSelected ? pm.bg : '#ffffff',
                          }}
                        >
                          <input 
                            type="radio" 
                            name="payment" 
                            value={pm.id} 
                            checked={isSelected} 
                            onChange={(e) => {
                              setFormData({...formData, paymentMethod: e.target.value});
                            }} 
                            className="sr-only"
                          />
                          <span className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                            style={{ borderColor: isSelected ? pm.color : '#d1d5db' }}
                          >
                            {isSelected && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: pm.color }} />}
                          </span>
                          
                          {pm.id === 'paystation' ? (
                            <span className="font-bold text-[10px] sm:text-[9px] md:text-[11px] whitespace-nowrap text-center flex items-center gap-1 justify-center tracking-tight">
                              <span style={{ color: '#f7941d' }}>নগদ</span>
                              <span className="opacity-30">,</span>
                              <span style={{ color: '#8c2d82' }}>রকেট</span>
                              <span className="opacity-30">,</span>
                              <span style={{ color: '#0054a6' }}>ব্যাংক</span>
                            </span>
                          ) : (
                            <span className="font-bold text-[11px] sm:text-[10px] md:text-[12px] whitespace-nowrap text-center tracking-tight" style={{ color: isSelected ? pm.color : '#4b5563' }}>
                              {pm.title}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </section>

                {/* Final Order Summary */}
                <div className="bg-gray-50 rounded-2xl p-6 mt-8 border border-gray-200 shadow-inner">
                   <div className="flex justify-between text-sm md:text-base mb-3 text-gray-600 font-bold">
                     <span>Subtotal ({quantity}x)</span><span className="text-gray-900">৳{calculatedSubtotal.toLocaleString()}</span>
                   </div>
                   <div className="flex justify-between text-sm md:text-base mb-3 text-gray-600 font-bold">
                     <span>Shipping Charge</span>
                     <span className="text-gray-900">{shippingCost === 0 && !formData.district ? 'Zilla Select korun' : `৳${shippingCost}`}</span>
                   </div>
                   
                   {onlineDiscount > 0 && (
                     <div className="flex justify-between items-center text-[13px] md:text-sm text-[#e2136e] bg-[#e2136e]/5 px-3 py-2 -mx-3 rounded-xl border border-dashed border-[#e2136e]/30 my-3 font-bold">
                       <span>Online Payment Discount</span><span>- ৳{onlineDiscount}</span>
                     </div>
                   )}
                   
                   {appliedCancelDiscount > 0 && (
                     <div className="flex justify-between text-sm md:text-base text-emerald-600 bg-emerald-50 px-3 py-2 -mx-3 rounded-xl border border-dashed border-emerald-200 my-3 font-bold">
                       <span>Special Promo Applied</span><span>- ৳{appliedCancelDiscount}</span>
                     </div>
                   )}

                   <div className="flex justify-between text-2xl font-black mt-4 pt-4 border-t border-gray-200">
                     <span className="text-gray-900">Total</span><span className="text-brand-primary">৳{finalTotal.toLocaleString()}</span>
                   </div>
                </div>

                <button type="submit" disabled={loading} className="w-full h-16 bg-brand-primary hover:brightness-105 text-white font-black text-xl rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.2)] mt-8 disabled:opacity-50 transition-all flex justify-center items-center gap-3 transform active:scale-95 uppercase tracking-wide">
                  {loading ? 'প্রসেসিং হচ্ছে...' : 'অর্ডার কনফার্ম করুন 🚀'}
                </button>

                <div className="flex items-center justify-center gap-2 mt-5 text-sm font-bold text-gray-400">
                  <ShieldCheck className="w-5 h-5 text-emerald-500" /> 100% Safe & Secure Checkout
                </div>
              </form>
            </div>
          </div>

        </div>
      </div>

      {/* 📱 STICKY BOTTOM CTA (Mobile Only - Pops up on scroll) */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 p-4 shadow-[0_-10px_30px_rgba(0,0,0,0.08)] pb-safe">
        <div className="flex items-center justify-between gap-4">
          <div>
            <span className="block text-[11px] text-gray-500 font-black uppercase tracking-widest">সর্বমোট মূল্য</span>
            <span className="text-2xl font-black text-brand-primary tabular-nums">৳{finalTotal.toLocaleString()}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              const form = document.querySelector('form');
              if (form) {
                form.scrollIntoView({ behavior: 'smooth' });
                // Add a tiny bit of focus logic to Name input
                setTimeout(() => {
                    const firstInput = form.querySelector('input');
                    if(firstInput) firstInput.focus();
                }, 500);
              }
            }}
            disabled={loading}
            className="flex-1 h-14 bg-brand-primary text-white font-black rounded-xl flex items-center justify-center gap-2 shadow-[0_8px_20px_rgba(0,0,0,0.15)] text-lg uppercase tracking-wide"
          >
            {loading ? 'Wait...' : 'Order Now'} <ArrowRight className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* 🎟️ EXIT INTENT CANCEL OFFER POPUP */}
      {showCancelPopup && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden relative flex flex-col">
            <div className="h-3 w-full bg-gradient-to-r from-[#e2136e] to-brand-primary" />
            <button type="button" onClick={() => { setShowCancelPopup(false); window.location.href = '/'; }} className="absolute top-5 right-5 text-gray-400 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-full p-1.5 transition-colors"><X className="w-5 h-5" /></button>
            <div className="p-8 text-center">
              <div className="w-20 h-20 bg-red-50 text-[#e2136e] rounded-full flex items-center justify-center mx-auto mb-5 shadow-inner"><Tag className="w-10 h-10" /></div>
              <h3 className="text-3xl font-black text-gray-900 mb-2">অর্ডারটি সম্পন্ন করুন! 🌸</h3>
              <p className="text-base font-medium text-gray-500 mb-6">আপনার জন্য রয়েছে একটি বিশেষ ধামাকা অফার।</p>
              
              <div className="bg-gradient-to-br from-[#fff5f8] to-white border border-[#e2136e]/20 rounded-2xl p-6 mb-6 shadow-sm">
                <span className="text-xs font-black text-[#e2136e] uppercase tracking-widest mb-2 block">Special Savings</span>
                <div className="flex justify-center items-baseline gap-2">
                  <span className="text-6xl font-black text-brand-primary">৳{randomDiscount + 50}</span>
                  <span className="text-sm font-black text-gray-700">ফ্ল্যাট ছাড়</span>
                </div>
                <p className="text-xs font-bold text-gray-400 mt-2 tracking-wide">(অনলাইন পেমেন্ট ৳৫০ + স্পেশাল ৳৫০)</p>
              </div>

              <input type="email" placeholder="ইমেইল দিন (অপশনাল)" className="w-full h-14 px-4 rounded-xl border-2 border-gray-100 text-center mb-5 focus:outline-none focus:border-brand-primary font-semibold" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} onBlur={() => trackIncompleteOrderOnBlur()} />
              
              <button onClick={applyCancelDiscount} className="w-full h-16 bg-brand-primary text-white font-black text-lg rounded-xl shadow-lg shadow-brand-primary/30 flex items-center justify-center gap-2 hover:brightness-105 uppercase tracking-wide">
                ডিসকাউন্ট নিয়ে অর্ডার করুন ⚡
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}