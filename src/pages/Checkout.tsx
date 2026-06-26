import { useState, useEffect, useRef } from 'react';
import { useCart } from '../lib/store';
import { trackPixel } from '../lib/woocommerce';
import { motion } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import { 
  ShieldCheck, 
  Truck, 
  ArrowRight,
  ShoppingBag,
  ChevronDown,
  Trash2,
  Plus,
  Minus,
  Tag,
  X
} from 'lucide-react';

export default function Checkout() {
  const { items, clearCart, updateQuantity, removeItem } = useCart();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [shippingMethod, setShippingMethod] = useState('dhaka');
  
  // Hydration State for SSR (localStorage) issue
  const [isMounted, setIsMounted] = useState(false);

  // Coupon State
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponMessage, setCouponMessage] = useState({ text: '', type: '' });
  
  // Cancel Offer Popup States
  const [showCancelPopup, setShowCancelPopup] = useState(false);
  const [randomDiscount, setRandomDiscount] = useState(0);
  const [generatedCouponCode, setGeneratedCouponCode] = useState('');

  const [formData, setFormData] = useState({
    firstName: '',
    address1: '',
    address2: '',
    phone: '',
    district: '',
    note: '',
    paymentMethod: 'cod',
  });

  const pixelFired = useRef(false);

  const getCookie = (name) => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
    return null;
  };

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const savedPhone = getCookie('user_phone') || getCookie('billing_phone') || '';
    const savedName = getCookie('user_name') || getCookie('billing_first_name') || '';
    const savedDistrict = getCookie('billing_city') || '';
    const savedAddress = getCookie('billing_address_1') || '';

    if (savedPhone || savedName) {
      setFormData(prev => ({
        ...prev,
        phone: savedPhone || prev.phone,
        firstName: savedName || prev.firstName,
        district: savedDistrict || prev.district,
        address1: savedAddress || prev.address1
      }));
    }
  }, []);

  // ============================================================================
  // 🚀 BULLETPROOF CALCULATIONS
  // ============================================================================
  const calculatedSubtotal = items.reduce((sum, item) => {
    const numericPrice = Number(String(item.price).replace(/[^0-9.-]+/g, '')) || 0;
    const qty = Math.max(1, Number(item.quantity) || 1);
    return sum + (numericPrice * qty);
  }, 0);

  const hasFreeShippingItem = items.some((item) => {
    const hasFreeCategory = item.categories?.some((cat) => 
        cat.name?.toLowerCase() === 'free shipping' || cat.slug?.toLowerCase() === 'free-shipping'
    );
    return hasFreeCategory || item.shipping_class === 'free-shipping' || item.shipping_class === 'free' || item.free_shipping === true;
  });

  const shippingCost = hasFreeShippingItem ? 0 : (shippingMethod === 'dhaka' ? 80 : 150);
  
  // Apply 50 BDT discount for both paystation and bkash
  const onlineDiscount = (formData.paymentMethod === 'paystation' || formData.paymentMethod === 'bkash') ? 50 : 0;
  
  let couponDiscountAmount = 0;
  if (appliedCoupon) {
    if (appliedCoupon.isOnlineOnly && formData.paymentMethod === 'cod') {
      couponDiscountAmount = 0;
    } else {
      if (appliedCoupon.type === 'percent') {
        couponDiscountAmount = (calculatedSubtotal * appliedCoupon.amount) / 100;
      } else {
        couponDiscountAmount = appliedCoupon.amount;
      }
    }
  }

  const finalTotal = Math.max(0, calculatedSubtotal + shippingCost - onlineDiscount - couponDiscountAmount);

  // ============================================================================
  // 🚀 REAL WOOCOMMERCE COUPON VERIFICATION
  // ============================================================================
  const applyCoupon = async () => {
    if (!couponCode.trim()) {
      setCouponMessage({ text: 'কুপন কোড লিখুন', type: 'error' });
      return;
    }

    setCouponLoading(true);
    setCouponMessage({ text: '', type: '' });

    try {
      const response = await fetch('/api/verify-coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: couponCode, cartTotal: calculatedSubtotal })
      });
      
      const result = await response.json();

      if (response.ok && result.valid) {
        setAppliedCoupon({
          code: result.code,
          amount: Number(result.discount), 
          type: result.discount_type 
        });
        setCouponMessage({ text: 'কুপন সফলভাবে যুক্ত হয়েছে!', type: 'success' });
      } else {
        setAppliedCoupon(null);
        setCouponMessage({ text: result.message || 'কুপনটি সঠিক নয়!', type: 'error' });
      }
    } catch (error) {
      setAppliedCoupon(null);
      setCouponMessage({ text: 'সার্ভারে সমস্যা, আবার চেষ্টা করুন', type: 'error' });
    } finally {
      setCouponLoading(false);
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode('');
    setCouponMessage({ text: '', type: '' });
  };

  const handleCancelClick = () => {
    // Generate a random discount from 10 to 30%
    const percent = Math.floor(Math.random() * 21) + 10;
    setRandomDiscount(percent);
    setGeneratedCouponCode(`SAVE${percent}`);
    setShowCancelPopup(true);
  };

  const applyCancelDiscount = () => {
    setAppliedCoupon({
      code: generatedCouponCode,
      amount: randomDiscount,
      type: 'percent',
      isOnlineOnly: true
    });
    setShowCancelPopup(false);
  };

  // 🕵️ ADVANCED EXIT-INTENT ABANDONED CART TRACKER
  const payloadRef = useRef({ formData, items, finalTotal });
  
  useEffect(() => {
    payloadRef.current = { formData, items, finalTotal };
  }, [formData, items, finalTotal]);

  useEffect(() => {
    sessionStorage.removeItem('order_placed');

    const trackAbandonment = () => {
      const { formData, items, finalTotal } = payloadRef.current;
      const isOrderPlaced = sessionStorage.getItem('order_placed') === 'true';
      const cleanPhone = formData.phone.replace(/\D/g, '');

      if (!isOrderPlaced && cleanPhone.length >= 11 && items.length > 0) {
        const fullAddress = formData.district ? `${formData.address1}, ${formData.district}` : formData.address1;
        
        const payload = {
          customer_name: formData.firstName || 'Guest',
          phone: cleanPhone,
          address: fullAddress,
          city: formData.district || '',
          cart_products: items.map(item => ({
            product_id: item.id,
            name: item.name,
            price: Number(item.price),
            quantity: Math.max(1, Number(item.quantity) || 1)
          }))
        };

        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        navigator.sendBeacon('https://dash.bunonfabrics.com/api/orders/save_to_wp.php', blob);
      }
    };

    window.addEventListener('beforeunload', trackAbandonment);
    return () => {
      window.removeEventListener('beforeunload', trackAbandonment);
    };
  }, []);

  const trackIncompleteOrderOnBlur = async () => {
    const currentData = payloadRef.current;
    const cleanPhone = currentData.formData.phone.replace(/\D/g, '');
    
    if (cleanPhone.length < 11 || currentData.items.length === 0) return;

    try {
      const fullAddress = currentData.formData.district ? `${currentData.formData.address1}, ${currentData.formData.district}` : currentData.formData.address1;
      
      const payload = {
        customer_name: currentData.formData.firstName || 'Guest',
        phone: cleanPhone,
        address: fullAddress,
        city: currentData.formData.district || '',
        cart_products: currentData.items.map(item => ({
          product_id: item.id,
          name: item.name,
          price: Number(item.price),
          quantity: Math.max(1, Number(item.quantity) || 1)
        }))
      };

      await fetch('https://dash.bunonfabrics.com/api/orders/save_to_wp.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      console.log('Incomplete sync skipped.');
    }
  };

  useEffect(() => {
    if (items.length > 0 && !pixelFired.current) {
      trackPixel('InitiateCheckout', {
        content_type: 'product',
        contents: items.map(i => ({ id: i.id, quantity: Math.max(1, Number(i.quantity) || 1), price: Number(i.price) })),
        value: Number(finalTotal),
        currency: 'BDT'
      });
      pixelFired.current = true;
    }
    window.scrollTo(0, 0);
  }, [items.length]); 

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (items.length === 0) return;
    
    if (formData.phone.length !== 11 || !formData.phone.startsWith('01')) {
      alert('Please enter a valid 11-digit phone number starting with 01.');
      return;
    }
    
    if (!formData.district) {
      alert('Please select a district.');
      return;
    }

    setLoading(true);

    try {
      const nameParts = formData.firstName.trim().split(/\s+/);
      const fName = nameParts[0] || 'Guest';
      const lName = nameParts.slice(1).join(' ') || 'Customer';
      const savedEmail = getCookie('user_email') || getCookie('billing_email') || `${formData.phone}@bunon.shop`;

      const fbpToken = getCookie('_fbp');
      const fbcToken = getCookie('_fbc');

      const couponLines = appliedCoupon ? [{ code: appliedCoupon.code, discount: String(couponDiscountAmount) }] : [];

      const checkoutPayload = {
        customer: {
          name: formData.firstName,
          phone: formData.phone,
          email: savedEmail.toLowerCase(), 
          city: formData.district,
          area: formData.address2 || '',
          address: formData.address1,
          note: formData.note,
          fbp: fbpToken,
          fbc: fbcToken
        },
        cart: items.map(item => ({
          id: item.id,
          sku: item.sku || "N/A",
          name: item.name,
          quantity: Math.max(1, Number(item.quantity) || 1),
          price: Number(item.price),
          thumbnail: item.images?.[0]?.src || item.thumbnail || '/placeholder.png'
        })),
        paymentMethod: formData.paymentMethod,
        totalAmount: finalTotal,
        shippingFee: shippingCost,
        discount: onlineDiscount, 
        coupons: couponLines 
      };

      const response = await fetch('/api/checkout/place-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(checkoutPayload)
      });

      const result = await response.json();

      if (!response.ok || (result && result.ok === false)) {
        throw new Error(result?.msg || "Database connection error");
      }

      sessionStorage.setItem('order_placed', 'true');
      
      try {
        const cleanPhoneToDelete = formData.phone.replace(/\D/g, '');
        fetch(`https://dash.bunonfabrics.com/api/orders/remove_incomplete.php?phone=${cleanPhoneToDelete}`, {
          method: 'GET',
          keepalive: true
        }).catch(() => {});
      } catch (err) {
        console.error('Failed to remove incomplete order:', err);
      }

      document.cookie = `user_phone=${formData.phone}; path=/; max-age=31536000`;
      document.cookie = `user_name=${formData.firstName}; path=/; max-age=31536000`;

      const finalOrderId = String(result?.order_id || Math.floor(Date.now() / 1000));

      const trackingPayload = {
        transaction_id: finalOrderId,
        value: Number(finalTotal),
        currency: 'BDT',
        content_type: 'product',
        contents: items.map(i => ({ id: i.id, quantity: Math.max(1, Number(i.quantity) || 1), price: Number(i.price) })),
        user_data: {
          fn: fName.toLowerCase(),
          ln: lName.toLowerCase(),
          ph: formData.phone.trim(),
          em: savedEmail.toLowerCase(),
          ct: formData.district.toLowerCase(),
          st: formData.district.toLowerCase(),
          country: 'bd',
          external_id: finalOrderId,
          fbp: fbpToken,
          fbc: fbcToken
        }
      };

      if (formData.paymentMethod === 'cod') {
          localStorage.setItem('bf_pending_purchase', JSON.stringify(trackingPayload));
      }

      if (result.gateway && result.redirectUrl) {
        window.location.href = result.redirectUrl;
        return;
      }

      clearCart();
      navigate(`/order-received?order_id=${finalOrderId}&method=${formData.paymentMethod}&total=${finalTotal}`);

    } catch (error) {
      console.error('Checkout failed:', error);
      alert(error.message || 'Order Placement Failed! Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isMounted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 pt-24 pb-20 flex flex-col items-center justify-center px-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center w-full max-w-md bg-white p-8 rounded-2xl shadow-sm border border-black/5">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShoppingBag className="w-8 h-8 text-gray-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Cart is Empty</h1>
          <p className="text-gray-500 mb-8">Add items to proceed to checkout.</p>
          <Link to="/shop" className="inline-flex items-center justify-center w-full h-12 bg-brand-primary text-white font-semibold rounded-xl hover:brightness-105 transition-all">
              Continue Shopping
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-6 md:pt-10 pb-20">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="mb-4 md:mb-6 text-sm text-gray-500 flex items-center gap-1.5 flex-wrap">
          <Link className="hover:text-gray-900 transition-colors" to="/">Home</Link>
          <ArrowRight className="w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <Link className="hover:text-gray-900 transition-colors" to="/shop">Shop</Link>
          <ArrowRight className="w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <span className="text-gray-900 font-medium">Checkout</span>
        </nav>

        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Secure Checkout</h1>
            <p className="mt-1 text-sm text-gray-500">Complete your order — it only takes a minute.</p>
          </div>
          <button 
            type="button" 
            onClick={handleCancelClick}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#e2136e] bg-[#e2136e]/5 hover:bg-[#e2136e]/10 border border-[#e2136e]/20 rounded-lg transition-all hover:scale-105 active:scale-95 shrink-0"
          >
            <X className="w-3.5 h-3.5" /> CANCEL
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-6 lg:gap-8 xl:gap-10">
          <div className="space-y-6 max-md:space-y-0 max-md:bg-white max-md:rounded-2xl max-md:border max-md:border-black/5 max-md:shadow-sm max-md:p-4">
            <section className="md:rounded-2xl md:border md:border-black/5 md:bg-white md:shadow-sm p-0 md:p-6">
              <h2 className="flex items-center gap-3 mb-5 text-lg font-semibold text-gray-900 max-md:mt-2">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-brand-primary/10 text-brand-primary text-sm font-bold">1</span>
                Contact Details
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block">
                    <span className="block text-sm font-medium text-gray-700 mb-1.5">Full Name <span className="text-red-500">*</span></span>
                    <input 
                      required
                      type="text" 
                      placeholder="Your name" 
                      className="w-full h-11 px-3.5 rounded-lg border border-gray-200 bg-white text-base text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all"
                      value={formData.firstName}
                      onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                      onBlur={trackIncompleteOrderOnBlur}
                    />
                  </label>
                </div>
                
                <div className="sm:col-span-2">
                  <label className="block">
                    <span className="block text-sm font-medium text-gray-700 mb-1.5">Phone <span className="text-red-500">*</span></span>
                    <input 
                      required
                      type="tel" 
                      inputMode="numeric"
                      placeholder="01XXXXXXXXX" 
                      maxLength={11}
                      className="w-full h-11 px-3.5 rounded-lg border border-gray-200 bg-white text-base text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all"
                      value={formData.phone}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        setFormData({...formData, phone: val});
                      }}
                      onBlur={trackIncompleteOrderOnBlur}
                    />
                  </label>
                </div>
              </div>
            </section>

            <section className="md:rounded-2xl md:border md:border-black/5 md:bg-white md:shadow-sm p-0 md:p-6 max-md:mt-6 max-md:pt-6 max-md:border-t max-md:border-gray-100">
              <h2 className="flex items-center gap-3 mb-5 text-lg font-semibold text-gray-900">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-brand-primary/10 text-brand-primary text-sm font-bold">2</span>
                Delivery Address
              </h2>
              <div className="space-y-4">
                <label className="block">
                  <span className="block text-sm font-medium text-gray-700 mb-1.5">District <span className="text-red-500">*</span></span>
                  <div className="relative">
                    <select
                      required
                      className="w-full h-11 px-3.5 rounded-lg border border-gray-200 bg-white text-base text-gray-900 focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all appearance-none"
                      value={formData.district}
                      onChange={(e) => {
                         setFormData({...formData, district: e.target.value});
                         setShippingMethod(e.target.value.toLowerCase() === 'dhaka' ? 'dhaka' : 'outside');
                      }}
                      onBlur={trackIncompleteOrderOnBlur}
                    >
                      <option value="" disabled>Select district</option>
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
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </label>
                
                <label className="block">
                  <span className="block text-sm font-medium text-gray-700 mb-1.5">Address Line 1 <span className="text-red-500">*</span></span>
                  <textarea 
                    required
                    rows={2}
                    placeholder="House #, Road #, Area" 
                    className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 bg-white text-base text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all resize-none"
                    value={formData.address1}
                    onChange={(e) => setFormData({...formData, address1: e.target.value})}
                    onBlur={trackIncompleteOrderOnBlur}
                  />
                </label>
              </div>
            </section>

            <section className="md:rounded-2xl md:border md:border-black/5 md:bg-white md:shadow-sm p-0 md:p-6 overflow-visible max-md:mt-6 max-md:pt-6 max-md:border-t max-md:border-gray-100">
              <h2 className="flex items-center gap-3 mb-4 md:mb-5 text-base md:text-lg font-semibold text-gray-900">
                <span className="inline-flex items-center justify-center w-6 h-6 md:w-7 md:h-7 rounded-full bg-brand-primary/10 text-brand-primary text-xs md:text-sm font-bold">3</span>
                Payment Method
              </h2>

              <div className="mb-4 rounded-xl border border-[#E2136E]/15 bg-white shadow-sm p-1.5 md:p-2 overflow-hidden">
                <div className="border border-dashed border-[#E2136E]/40 bg-gradient-to-br from-[#fff5f8] to-[#fff0f5] rounded-lg p-2 md:p-2.5 flex items-center gap-2.5 md:gap-3">
                  <div className="w-8 h-8 md:w-9 md:h-9 rounded-full border border-[#E2136E] bg-white flex items-center justify-center text-[#E2136E] text-lg font-bold shrink-0 shadow-[0_4px_12px_rgba(226,19,110,0.15)] bunon-pulse">
                    <span className="font-serif">৳</span>
                  </div>
                  <div className="flex-1 flex justify-between items-center flex-wrap gap-1">
                    <h4 className="text-[#E2136E] font-bold text-[13px] md:text-[14px] leading-tight m-0">
                      অনলাইন পেমেন্ট অফার
                    </h4>
                    <div className="flex items-center gap-1.5 text-[12px] text-gray-700">
                      <span className="inline-flex items-center justify-center bg-[#E2136E] text-white text-[10px] md:text-[11px] px-2 py-0.5 rounded-full font-bold shadow-[0_2px_6px_rgba(226,19,110,0.25)] bunon-pulse">
                        ৳৫০ ডিসকাউন্ট
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                {[
                  { id: 'cod', title: 'ক্যাশ অন ডেলিভারি', subtitle: 'পণ্য হাতে পেয়ে মূল্য পরিশোধ করুন', icon: Truck },
                  { 
                    id: 'bkash', 
                    title: 'bKash Payment', 
                    subtitle: 'সরাসরি আপনার বিকাশ অ্যাকাউন্ট থেকে পেমেন্ট করুন',
                    icon: ShieldCheck,
                    img: '/image/bKash_logo.png'
                  },
                  { 
                    id: 'paystation', 
                    title: 'Other Online Payments', 
                    subtitle: 'Nagad, Rocket, Bank',
                    icon: ShieldCheck,
                    img: '/image/Payment-1-1024x98-1-1.png'
                  },
                ].map((pm) => (
                  <label 
                    key={pm.id} 
                    className={`relative flex flex-col justify-center p-3 md:p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      formData.paymentMethod === pm.id 
                        ? 'border-brand-primary bg-brand-primary/5 shadow-sm' 
                        : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input 
                        type="radio" 
                        name="payment" 
                        value={pm.id} 
                        checked={formData.paymentMethod === pm.id} 
                        onChange={(e) => {
                          setFormData({...formData, paymentMethod: e.target.value});
                        }} 
                        className="mt-1 w-4 h-4 text-brand-primary focus:ring-brand-primary border-gray-300"
                      />
                      
                      <div className="flex-1">
                        <span className="font-bold text-sm text-gray-900 block mb-0.5">
                          {pm.title}
                        </span>
                        <span className="text-xs text-gray-500 block">
                          {pm.subtitle}
                        </span>
                        
                        {pm.img && (
                          <img 
                            src={pm.img} 
                            alt="Payment Method" 
                            className="h-4 mt-2 object-contain opacity-90 pointer-events-none"
                            onError={(e) => e.target.style.display = 'none'}
                          />
                        )}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </section>
          </div>

          <div className="relative">
            <div className="sticky top-24 space-y-6">
              
              <div className="rounded-2xl border border-black/5 bg-white shadow-sm p-5 md:p-6">
                 <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-3">
                    <Tag className="w-4 h-4 text-brand-primary pointer-events-none" /> 
                    Have a coupon code?
                 </h3>
                 
                 {appliedCoupon ? (
                    <div className="flex items-center justify-between bg-green-50 border border-green-200 p-3 rounded-lg">
                       <div>
                          <p className="text-sm font-bold text-green-700 uppercase">{appliedCoupon.code}</p>
                          <p className="text-xs text-green-600">Coupon applied successfully</p>
                       </div>
                       <button type="button" onClick={removeCoupon} className="text-red-500 hover:text-red-700 text-sm font-medium">Remove</button>
                    </div>
                 ) : (
                    <div>
                       <div className="flex gap-2">
                          <input 
                             type="text" 
                             placeholder="Enter code here" 
                             className="flex-1 h-11 px-3.5 rounded-lg border border-gray-200 focus:border-brand-primary focus:ring-1 focus:ring-brand-primary text-sm uppercase"
                             value={couponCode}
                             onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                             disabled={couponLoading}
                          />
                          <button 
                             type="button"
                             onClick={applyCoupon}
                             disabled={couponLoading || !couponCode}
                             className="h-11 px-5 bg-gray-900 text-white rounded-lg font-semibold text-sm hover:bg-black disabled:opacity-50 transition-colors"
                          >
                             {couponLoading ? 'Applying...' : 'Apply'}
                          </button>
                       </div>
                       {couponMessage.text && (
                          <p className={`text-xs mt-2 ${couponMessage.type === 'error' ? 'text-red-500' : 'text-green-600'}`}>
                             {couponMessage.text}
                          </p>
                       )}
                    </div>
                 )}
              </div>

              <div className="rounded-2xl border border-black/5 bg-white shadow-sm p-5 md:p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Order Summary</h2>
                
                <div className="space-y-3 mb-4 max-h-[35vh] overflow-y-auto pr-2 custom-scrollbar">
                  {items.map((item, index) => {
                    const safeQuantity = Math.max(1, Number(item.quantity) || 1);
                    // 🚀 FIXED 2: Used store.ts logic for exact cartItemId
                    const cartItemId = item.selectedVariation ? `${item.id}-${item.selectedVariation.databaseId}` : item.id;
                    
                    return (
                    <div key={`${item.id}-${index}`} className="flex gap-3 group items-center py-1">
                      <div className="w-12 h-12 rounded-md bg-gray-50 border border-gray-100 overflow-hidden shrink-0">
                        <img src={item.images?.[0]?.src || item.thumbnail} className="w-full h-full object-cover pointer-events-none" alt="" />
                      </div>
                      
                      <div className="flex flex-col justify-center flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2">
                          <h4 className="text-[13px] font-semibold text-gray-900 leading-tight truncate">{item.name}</h4>
                          <button 
                            type="button" 
                            onClick={(e) => {
                              e.preventDefault();
                              if (removeItem) removeItem(cartItemId);
                            }}
                            className="text-gray-400 hover:text-red-500 transition-colors p-0.5"
                            title="Remove item"
                          >
                            <Trash2 className="w-3.5 h-3.5 pointer-events-none" />
                          </button>
                        </div>
                        
                        <div className="flex items-center justify-between mt-1">
                          <div className="flex items-center bg-gray-50 border border-gray-200 rounded">
                            <button 
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                if (updateQuantity && safeQuantity > 1) {
                                  // 🚀 FIXED 1: Send DELTA (-1) to match store.ts logic
                                  updateQuantity(cartItemId, -1);
                                }
                              }}
                              className="w-5 h-5 flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
                              disabled={safeQuantity <= 1}
                            >
                              <Minus className="w-2.5 h-2.5 pointer-events-none" />
                            </button>
                            <span className="w-5 text-center text-[11px] font-semibold text-gray-900">
                              {safeQuantity}
                            </span>
                            <button 
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                if (updateQuantity) {
                                  // 🚀 FIXED 1: Send DELTA (1) to match store.ts logic
                                  updateQuantity(cartItemId, 1);
                                }
                              }}
                              className="w-5 h-5 flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors"
                            >
                              <Plus className="w-2.5 h-2.5 pointer-events-none" />
                            </button>
                          </div>
                          
                          <span className="text-[13px] font-bold text-gray-900 tabular-nums">
                            ৳{(Number(item.price) * safeQuantity).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>

                <div className="border-t border-gray-100 pt-4 space-y-3">
                  <div className="flex justify-between items-center text-sm text-gray-500">
                    <span>Subtotal</span>
                    <span className="font-semibold text-gray-900 tabular-nums">৳{calculatedSubtotal.toLocaleString()}</span>
                  </div>
                  
                  <div className="flex justify-between items-center text-sm text-gray-500">
                    <span>
                      Shipping 
                      {shippingCost === 0 && <span className="text-[10px] text-emerald-600 font-bold ml-1 bg-emerald-100 px-1.5 py-0.5 rounded-full">(FREE)</span>}
                    </span>
                    <span className="font-semibold text-gray-900 tabular-nums">
                      {shippingCost === 0 ? '৳0' : `৳${shippingCost}`}
                    </span>
                  </div>

                  {appliedCoupon && (
                    <div className="flex justify-between items-center text-sm text-green-600">
                      <span className="flex flex-col">
                        <span>Coupon Discount ({appliedCoupon.code})</span>
                        {appliedCoupon.isOnlineOnly && formData.paymentMethod === 'cod' && (
                          <span className="text-[10px] text-red-500 font-bold leading-tight">
                            (শুধুমাত্র অনলাইন পেমেন্টে প্রযোজ্য)
                          </span>
                        )}
                      </span>
                      <span className="font-bold tabular-nums">- ৳{couponDiscountAmount.toLocaleString()}</span>
                    </div>
                  )}

                  {onlineDiscount > 0 && (
                    <div className="flex justify-between items-center text-[13px] text-[#e2136e] bg-[#e2136e]/5 px-2 py-1 -mx-2 rounded-md transition-all border border-dashed border-[#e2136e]/30">
                      <span className="font-semibold">Online Payment Discount</span>
                      <span className="font-bold tabular-nums">- ৳{onlineDiscount}</span>
                    </div>
                  )}

                  <div className="pt-3 border-t border-gray-100 flex justify-between items-center">
                    <span className="text-base font-bold text-gray-900">Total</span>
                    <span className="text-xl font-bold text-brand-primary tabular-nums">৳{finalTotal.toLocaleString()}</span>
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full mt-6 h-12 rounded-xl bg-brand-primary text-white text-base font-semibold shadow-sm hover:brightness-105 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                >
                  {loading ? 'Processing...' : 'Place Order'}
                  {!loading && <ArrowRight className="w-5 h-5 pointer-events-none" />}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>

      {/* 🎟️ CANCEL OFFER POPUP MODAL */}
      {showCancelPopup && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
          <style>{`
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes scaleUp {
              from { transform: scale(0.95); opacity: 0; }
              to { transform: scale(1); opacity: 1; }
            }
            .animate-fadeIn {
              animation: fadeIn 0.2s ease-out forwards;
            }
            .animate-scaleUp {
              animation: scaleUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
            }
          `}</style>
          
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-gray-100 overflow-hidden relative p-6 md:p-8 animate-scaleUp">
            
            {/* Close Button */}
            <button 
              type="button" 
              onClick={() => setShowCancelPopup(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center">
              <div className="w-14 h-14 bg-[#e2136e]/10 text-[#e2136e] rounded-full flex items-center justify-center mx-auto mb-4">
                <Tag className="w-7 h-7" />
              </div>

              <h3 className="text-xl md:text-2xl font-extrabold text-gray-900 mb-2 leading-tight">
                অর্ডার বাতিল করবেন না! 🌸
              </h3>
              <p className="text-xs text-gray-500 mb-6 leading-relaxed">
                আপনার জন্য রয়েছে একটি বিশেষ ধামাকা অফার। এখনই অর্ডার করলে অতিরিক্ত ডিসকাউন্ট পাবেন!
              </p>

              {/* Dynamic Percent Badge */}
              <div className="bg-gradient-to-r from-[#e2136e] to-[#ff4081] text-white rounded-2xl py-4 px-6 mb-6 shadow-md">
                <span className="block text-xs uppercase tracking-wider font-bold opacity-90">Special Discount Coupon</span>
                <span className="block text-4xl font-black my-1 tracking-tight">{randomDiscount}% OFF</span>
                <span className="inline-block bg-white/20 text-white text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-widest mt-1">
                  CODE: {generatedCouponCode}
                </span>
              </div>

              {/* Calculation Box */}
              <div className="bg-gray-50 rounded-xl p-4 text-left border border-gray-100 text-xs sm:text-sm space-y-2 mb-6">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal:</span>
                  <span className="font-semibold text-gray-900">৳{calculatedSubtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-[#e2136e] font-medium">
                  <span>নতুন {randomDiscount}% ডিসকাউন্ট:</span>
                  <span className="font-bold">- ৳{Math.round((calculatedSubtotal * randomDiscount) / 100).toLocaleString()}</span>
                </div>
                
                {/* Highlight Online Payment integration */}
                <div className="pt-2 border-t border-dashed border-gray-200 mt-2">
                  <p className="text-[11px] text-gray-500 leading-relaxed">
                    💡 <strong className="text-gray-800">অনলাইন পেমেন্ট করুন:</strong> অনলাইন পেমেন্ট (bKash/Paystation) সিলেক্ট করলে পূর্বের <span className="text-[#e2136e] font-bold">৳৫০ ডিসকাউন্ট</span> এবং এই কুপনের <span className="text-[#e2136e] font-bold">৳{Math.round((calculatedSubtotal * randomDiscount) / 100)}</span> একসাথে যোগ হয়ে মোট <span className="text-emerald-600 font-extrabold">৳{Math.round((calculatedSubtotal * randomDiscount) / 100) + 50}</span> ডিসকাউন্ট পাবেন!
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={applyCancelDiscount}
                  className="w-full h-12 bg-black hover:bg-gray-900 text-white font-bold rounded-xl shadow-lg transition-all active:scale-95 text-sm uppercase tracking-wider"
                >
                  অফারটি গ্রহণ করুন
                </button>
                <button
                  type="button"
                  onClick={() => setShowCancelPopup(false)}
                  className="w-full py-2 text-xs text-gray-400 hover:text-gray-600 font-semibold transition-colors"
                >
                  না, আমি অর্ডার করতে চাই না
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}

