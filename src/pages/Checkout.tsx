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

    // 🕵️ CART & COUPON RESTORATION FROM MARKETING EMAIL CAMPAIGN
    try {
      const params = new URLSearchParams(window.location.search);
      const restoreCartStr = params.get('restore_cart');
      const promoCoupon = params.get('coupon');

      if (restoreCartStr) {
        const decodedItems = JSON.parse(decodeURIComponent(restoreCartStr));
        if (Array.isArray(decodedItems) && decodedItems.length > 0) {
          // Clear current cart first
          clearCart();
          
          // Re-insert each recovery item into cart store
          const { addItem } = useCart.getState();
          const { products } = useCart.getState(); // Assuming products might be available, otherwise fallback
          
          // Add recovered items sequentially
          decodedItems.forEach(recovered => {
            const mockProduct = {
              id: recovered.id,
              name: recovered.name || 'Recovered Product',
              price: String(recovered.price || '0'),
              images: recovered.thumbnail ? [{ src: recovered.thumbnail }] : [],
              categories: [],
              tags: [],
              menu_order: 0,
              date_created: '',
              total_sales: 0
            };
            addItem(mockProduct, recovered.selectedVariation || undefined);
          });
        }
      }

      if (promoCoupon) {
        setCouponCode(promoCoupon);
        // Automatically verify/apply coupon
        setAppliedCoupon({
          code: promoCoupon,
          amount: promoCoupon.startsWith('RECOVER') ? Number(promoCoupon.replace('RECOVER', '')) : 10,
          type: 'percent',
          isOnlineOnly: false
        });
        setCouponMessage({ text: 'রিকভারি ডিসকাউন্ট কুপন যুক্ত হয়েছে!', type: 'success' });
      }
    } catch (err) {
      console.error('Failed to restore marketing campaign cart:', err);
    }
  }, []);

  useEffect(() => {
    const savedPhone = getCookie('user_phone') || getCookie('billing_phone') || '';
    const savedName = decodeURIComponent(getCookie('user_name') || getCookie('billing_first_name') || '');
    const savedDistrict = decodeURIComponent(getCookie('billing_city') || '');
    const savedAddress = decodeURIComponent(getCookie('billing_address_1') || '');

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

  // 🕵️ Intercept back button to show Cancel Offer Popup
  useEffect(() => {
    // Push a dummy state to block the first back button click
    window.history.pushState(null, '', window.location.pathname);
    
    const handlePopState = (e: PopStateEvent) => {
      // Push again to prevent going back
      window.history.pushState(null, '', window.location.pathname);
      // Trigger the cancel popup!
      handleCancelClick();
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [generatedCouponCode, randomDiscount]);

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
    // Sync incomplete order details on cancel click if a phone is entered
    trackIncompleteOrderOnBlur();

    // Dynamic flat discount between ৳20 and ৳100 based on subtotal
    let flatAmt = 20;
    if (calculatedSubtotal <= 500) {
      flatAmt = 20;
    } else if (calculatedSubtotal >= 2500) {
      flatAmt = 100;
    } else {
      // Linear interpolation between 20 and 100 BDT
      const fraction = (calculatedSubtotal - 500) / 2000;
      flatAmt = 20 + Math.round(fraction * 80);
    }
    // Round to the nearest 5 BDT (e.g. 20, 25, 30, ... 100)
    flatAmt = Math.round(flatAmt / 5) * 5;
    flatAmt = Math.max(20, Math.min(100, flatAmt));
    
    setRandomDiscount(flatAmt); 
    setGeneratedCouponCode(`OFFER${flatAmt}`);
    setShowCancelPopup(true);
  };

  const applyCancelDiscount = () => {
    setAppliedCoupon({
      code: generatedCouponCode,
      amount: randomDiscount,
      type: 'fixed_cart',
      isOnlineOnly: true
    });
    setFormData(prev => ({ ...prev, paymentMethod: 'paystation' }));
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
        navigator.sendBeacon('/api/orders/save_to_wp.php', blob);
      }
    };

    window.addEventListener('beforeunload', trackAbandonment);
    return () => {
      window.removeEventListener('beforeunload', trackAbandonment);
    };
  }, []);

  const trackIncompleteOrderOnBlur = async (phoneOverride?: string) => {
    const currentData = payloadRef.current;
    const cleanPhone = (phoneOverride || currentData.formData.phone).replace(/\D/g, '');
    
    // Save to cookies for persistent recovery across sessions
    if (cleanPhone.length >= 11) {
      const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
      document.cookie = `user_phone=${cleanPhone}; expires=${expires}; path=/; SameSite=Lax`;
      if (currentData.formData.firstName) {
        document.cookie = `user_name=${encodeURIComponent(currentData.formData.firstName)}; expires=${expires}; path=/; SameSite=Lax`;
      }
      if (currentData.formData.district) {
        document.cookie = `billing_city=${encodeURIComponent(currentData.formData.district)}; expires=${expires}; path=/; SameSite=Lax`;
      }
      if (currentData.formData.address1) {
        document.cookie = `billing_address_1=${encodeURIComponent(currentData.formData.address1)}; expires=${expires}; path=/; SameSite=Lax`;
      }
    }

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

      await fetch('/api/orders/save_to_wp.php', {
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
      <div className="min-h-screen bg-gray-50 pt-6 md:pt-10 pb-28 md:pb-32 flex justify-center">
        <div className="max-w-[1600px] w-full px-4 sm:px-6 lg:px-8">
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

          <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-6 xl:gap-8 w-full">
          <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-4 md:p-6 space-y-5">
            
            {/* Top Product Overview Summary (matches user screenshot) */}
            <div className="bg-gray-50/70 border border-gray-100 rounded-2xl p-4 flex flex-col gap-3">
              {items.map((item, index) => (
                <div key={index} className="flex items-center gap-3.5 justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <img 
                      src={item.images?.[0]?.src || item.thumbnail} 
                      className="w-12 h-12 object-cover rounded-xl border border-gray-200 shrink-0 pointer-events-none" 
                      alt="" 
                    />
                    <div className="min-w-0">
                      <span className="inline-flex bg-brand-primary/10 text-brand-primary text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider mb-0.5">
                        Product
                      </span>
                      <h4 className="text-[12px] font-bold text-gray-900 truncate leading-tight">{item.name}</h4>
                      <span className="text-[10px] text-gray-500 block mt-0.5">Quantity: {item.quantity}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="block text-[8px] text-gray-400 font-extrabold uppercase tracking-wide">Total Price</span>
                    <span className="text-[13px] font-extrabold text-gray-900">৳{(Number(item.price) * item.quantity).toLocaleString()}</span>
                  </div>
                </div>
              ))}
              
              {/* Detailed Breakdown */}
              <div className="border-t border-gray-200/60 pt-2.5 mt-1 space-y-1.5 text-[11px] text-gray-600">
                <div className="flex justify-between items-center">
                  <span>Subtotal</span>
                  <span className="font-semibold text-gray-900">৳{calculatedSubtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Shipping</span>
                  <span className="font-semibold text-gray-900">
                    {shippingCost === 0 ? '৳0 (FREE)' : `৳${shippingCost}`}
                  </span>
                </div>
                {appliedCoupon && (
                  <div className="flex justify-between items-center text-green-600 font-semibold">
                    <span>Coupon Discount ({appliedCoupon.code})</span>
                    <span>- ৳{couponDiscountAmount.toLocaleString()}</span>
                  </div>
                )}
                {onlineDiscount > 0 && (
                  <div className="flex justify-between items-center text-[#e2136e] font-semibold">
                    <span>Online Payment Discount</span>
                    <span>- ৳{onlineDiscount}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2 border-t border-dashed border-gray-200 mt-1">
                  <span className="text-xs font-bold text-gray-900">Total</span>
                  <span className="text-sm font-extrabold text-brand-primary">৳{finalTotal.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <section className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="sm:col-span-2">
                  <label className="block">
                    <span className="block text-xs font-semibold text-gray-600 mb-1">আপনার নাম <span className="text-red-500">*</span></span>
                    <input 
                      required
                      type="text" 
                      placeholder="এখানে আপনার সম্পূর্ণ নাম লিখুন" 
                      className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all shadow-sm"
                      value={formData.firstName}
                      onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                      onBlur={trackIncompleteOrderOnBlur}
                    />
                  </label>
                </div>
                
                <div className="sm:col-span-2">
                  <label className="block">
                    <span className="block text-xs font-semibold text-gray-600 mb-1 font-sans">মোবাইল নম্বর <span className="text-red-500">*</span></span>
                    <input 
                      required
                      type="tel" 
                      inputMode="numeric"
                      placeholder="01XXXXXXXXX" 
                      maxLength={11}
                      className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm font-sans text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all shadow-sm"
                      value={formData.phone}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        setFormData({...formData, phone: val});
                        if (val.length === 11) {
                          trackIncompleteOrderOnBlur(val);
                        }
                      }}
                      onBlur={trackIncompleteOrderOnBlur}
                    />
                  </label>
                </div>

                <div className="sm:col-span-2">
                  <label className="block">
                    <span className="block text-xs font-semibold text-gray-600 mb-1">জেলা নির্বাচন করুন <span className="text-red-500">*</span></span>
                    <div className="relative">
                      <select
                        required
                        className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all appearance-none shadow-sm"
                        value={formData.district}
                        onChange={(e) => {
                           setFormData({...formData, district: e.target.value});
                           setShippingMethod(e.target.value.toLowerCase() === 'dhaka' ? 'dhaka' : 'outside');
                        }}
                        onBlur={trackIncompleteOrderOnBlur}
                      >
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
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                  </label>
                </div>
                
                <div className="sm:col-span-2">
                  <label className="block">
                    <span className="block text-xs font-semibold text-gray-600 mb-1">সম্পূর্ণ ঠিকানা <span className="text-red-500">*</span></span>
                    <textarea 
                      required
                      rows={2}
                      placeholder="বাসা নম্বর, রোড নম্বর, এলাকা অথবা গ্রামের নাম লিখুন" 
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all resize-none shadow-sm"
                      value={formData.address1}
                      onChange={(e) => setFormData({...formData, address1: e.target.value})}
                      onBlur={trackIncompleteOrderOnBlur}
                    />
                  </label>
                </div>
              </div>
            </section>

            <section className="pt-5 border-t border-gray-100">
              <h2 className="flex items-center gap-3 mb-3 text-sm md:text-base font-bold text-gray-900">
                পেমেন্ট মেথড নির্বাচন করুন
              </h2>

              <div className="mb-3 rounded-xl border border-[#E2136E]/15 bg-white shadow-sm p-1.5 md:p-2 overflow-hidden">
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
              
              <div className="grid grid-cols-3 gap-1.5 md:gap-3 mt-3 w-full">
                {[
                  { id: 'bkash', title: 'বিকাশ পেমেন্ট', color: '#e2136e', bg: 'rgba(226, 19, 110, 0.05)' },
                  { id: 'paystation', title: 'নগদ, রকেট, ব্যাংক', color: '#f7941d', bg: 'rgba(247, 148, 29, 0.05)' },
                  { id: 'cod', title: 'ক্যাশ অন ডেলিভারি', color: '#059669', bg: 'rgba(5, 150, 105, 0.05)' },
                ].map((pm) => {
                  const isSelected = formData.paymentMethod === pm.id;
                  return (
                    <label 
                      key={pm.id} 
                      className="relative flex items-center justify-center gap-1 md:gap-2 h-8 md:h-10 px-1 md:px-3.5 rounded-full border cursor-pointer transition-all duration-200 select-none"
                      style={{
                        borderColor: isSelected ? pm.color : '#e5e7eb',
                        backgroundColor: isSelected ? pm.bg : '#ffffff',
                        boxShadow: isSelected ? `0 0 0 1px ${pm.color}` : 'none',
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
                      <span className="w-3 h-3 md:w-4 md:h-4 rounded-full border flex items-center justify-center shrink-0"
                        style={{
                          borderColor: isSelected ? pm.color : '#d1d5db',
                        }}
                      >
                        {isSelected && <span className="w-1.5 h-1.5 md:w-2.5 md:h-2.5 rounded-full" style={{ backgroundColor: pm.color }} />}
                      </span>
                      {pm.id === 'paystation' ? (
                        <span className="font-bold text-[7.5px] min-[360px]:text-[8.5px] min-[390px]:text-[9.5px] md:text-sm whitespace-nowrap text-center flex items-center gap-0.5 justify-center">
                          <span style={{ color: '#f7941d' }}>নগদ</span>
                          <span className="opacity-40" style={{ color: isSelected ? pm.color : '#9ca3af' }}>,</span>
                          <span style={{ color: '#8c2d82' }}>রকেট</span>
                          <span className="opacity-40" style={{ color: isSelected ? pm.color : '#9ca3af' }}>,</span>
                          <span style={{ color: '#0054a6' }}>ব্যাংক</span>
                        </span>
                      ) : (
                        <span className="font-bold text-[8px] min-[360px]:text-[9px] min-[390px]:text-[10px] md:text-sm whitespace-nowrap text-center truncate"
                          style={{
                            color: pm.color,
                          }}
                        >
                          {pm.title}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="relative">
            <div className="sticky top-24">
              <div className="rounded-2xl border border-black/5 bg-white shadow-sm p-5 md:p-6 space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Order Summary</h2>
                  
                  <div className="space-y-3 mb-4 max-h-[35vh] overflow-y-auto pr-2 custom-scrollbar">
                    {items.map((item, index) => {
                      const safeQuantity = Math.max(1, Number(item.quantity) || 1);
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
                </div>

                {/* Coupon Code Block */}
                <div className="pt-4 border-t border-gray-100">
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
              </div>
            </div>
          </div>
        </form>
      </div>

      {/* Sticky Bottom CTA for All Devices */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100 p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] pb-safe">
        <div className="max-w-[1400px] mx-auto px-4 flex items-center justify-between gap-4">
          <div>
            <span className="block text-[10px] md:text-xs text-gray-500 font-semibold">সর্বমোট মূল্য</span>
            <span className="text-base md:text-xl font-black text-brand-primary tabular-nums">৳{finalTotal.toLocaleString()}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              const form = document.querySelector('form');
              if (form) form.requestSubmit();
            }}
            disabled={loading}
            className="w-40 sm:w-48 md:w-64 h-11 bg-brand-primary hover:brightness-105 text-white text-sm md:text-base font-bold rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-50 shadow-md shadow-brand-primary/15"
          >
            {loading ? 'প্রসেসিং হচ্ছে...' : 'Order Now'}
            {!loading && <ArrowRight className="w-4 h-4 md:w-5 md:h-5" />}
          </button>
        </div>
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
          
          <div className="bg-white rounded-3xl max-w-md w-full shadow-[0_25px_60px_rgba(0,0,0,0.2)] border border-gray-100 overflow-hidden relative animate-scaleUp">
            
            {/* Top decorative gradient bar */}
            <div className="h-2 bg-gradient-to-r from-[#e2136e] via-brand-primary to-[#ff4081]" />

            {/* Close Button */}
            <button 
              type="button" 
              onClick={() => {
                setShowCancelPopup(false);
                window.location.href = '/';
              }}
              className="absolute top-5 right-5 text-gray-400 hover:text-gray-700 transition-colors w-7 h-7 flex items-center justify-center rounded-full bg-gray-50 hover:bg-gray-100"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="p-6 md:p-8 text-center">
              <div className="w-14 h-14 bg-gradient-to-br from-red-50 to-red-100 text-brand-primary rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
                <Tag className="w-7 h-7" />
              </div>

              <h3 className="text-xl md:text-2xl font-black text-gray-900 mb-1.5 leading-tight font-display">
                অর্ডারটি সম্পন্ন করুন! 🌸
              </h3>
              <p className="text-xs text-gray-500 mb-5 leading-relaxed">
                আপনার জন্য রয়েছে একটি বিশেষ ধামাকা কুপন অফার। কুপনটি নিয়ে এখনই সহজে অর্ডার সম্পন্ন করুন।
              </p>

              {/* Premium Ticket Style Voucher */}
              <div className="relative bg-gradient-to-br from-[#fff5f8] to-[#fff0f5] border border-[#e2136e]/20 rounded-2xl p-5 mb-5 shadow-sm overflow-hidden">
                {/* Left Ticket Notch */}
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-8 bg-white border-r border-[#e2136e]/20 rounded-r-full -translate-x-2" />
                {/* Right Ticket Notch */}
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-8 bg-white border-l border-[#e2136e]/20 rounded-l-full translate-x-2" />
                
                <span className="block text-[10px] uppercase tracking-wider font-extrabold text-[#e2136e] opacity-80">Special Savings Voucher</span>
                
                <div className="my-3 flex items-baseline justify-center gap-1">
                  <span className="text-4xl md:text-5xl font-black text-brand-primary tracking-tight">৳{randomDiscount + 50}</span>
                  <span className="text-sm font-bold text-gray-700">ফ্ল্যাট ছাড়</span>
                </div>
                
                <div className="border-t border-dashed border-[#e2136e]/30 pt-3 mt-3 text-left space-y-1 text-[11px] text-gray-600">
                  <div className="flex justify-between">
                    <span>বিশেষ কুপন ছাড়:</span>
                    <span className="font-bold text-gray-900">৳{randomDiscount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>অনলাইন পেমেন্ট ছাড়:</span>
                    <span className="font-bold text-[#e2136e]">৳৫০</span>
                  </div>
                </div>
                
                <div className="mt-3.5 inline-flex items-center gap-1.5 bg-white/80 border border-[#e2136e]/20 px-3 py-1 rounded-full text-xs font-mono font-bold text-brand-primary">
                  CODE: {generatedCouponCode}
                </div>
              </div>

              {/* Order Summary box */}
              <div className="bg-gray-50 rounded-2xl p-4 text-left border border-gray-200/60 text-xs space-y-1.5 mb-6">
                <div className="flex justify-between text-gray-500">
                  <span>Subtotal:</span>
                  <span className="font-semibold text-gray-800">৳{calculatedSubtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-[#e2136e] font-semibold">
                  <span>অনলাইন পেমেন্ট কুপন ডিসকাউন্ট:</span>
                  <span>- ৳{randomDiscount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-[#e2136e] font-semibold pb-1.5 border-b border-gray-200/60">
                  <span>অনলাইন পেমেন্ট মেথড ডিসকাউন্ট:</span>
                  <span>- ৳৫০</span>
                </div>
                <div className="flex justify-between pt-1.5 font-bold text-gray-900 text-sm">
                  <span>ডিসকাউন্টে সর্বমোট মূল্য:</span>
                  <span className="text-brand-primary font-black">৳{Math.max(0, calculatedSubtotal + shippingCost - onlineDiscount - randomDiscount).toLocaleString()}</span>
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={applyCancelDiscount}
                  className="w-full h-12 bg-brand-primary hover:brightness-105 text-white font-extrabold rounded-xl shadow-lg shadow-brand-primary/20 transition-all active:scale-95 text-sm uppercase tracking-wider flex items-center justify-center gap-2 bunon-pulse"
                >
                  ডিসকাউন্ট নিয়ে অর্ডার করুন ⚡
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}

