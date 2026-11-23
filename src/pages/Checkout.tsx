import { useState, useEffect, useRef } from 'react';
import { useCart } from '../lib/store';
import { trackPixel } from '../lib/woocommerce';
import { motion } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import {ShieldCheck, Truck, ArrowRight, ShoppingBag, ChevronDown, Trash2, Plus, Minus, Tag, X, AlertCircle} from 'lucide-react';

import ProductImage, { bestProductImage } from '../components/ProductImage';
export default function Checkout() {
  const { items, clearCart, updateQuantity, removeItem } = useCart();
  const navigate = useNavigate();
  // 🚦 INLINE VALIDATION (replaces the blocking alert() popups).
  // A native alert() froze the page, threw the customer back to the top of their
  // scroll position, and made them hunt for the offending field. Now the submit
  // attempt marks the bad field, scrolls it into view, and focuses it — the
  // customer is taken to the problem instead of being told about it.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const markError = (field: string, message: string) => {
    setFieldErrors((prev) => ({ ...prev, [field]: message }));
    // rAF so the class + error text are painted before we scroll to it.
    window.requestAnimationFrame(() => {
      const el = document.getElementById(`checkout-${field}-anchor`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const input = el.querySelector<HTMLInputElement>('input, textarea, select');
        // Don't steal focus from a field the customer is already correcting.
        if (input && document.activeElement !== input) {
          window.setTimeout(() => input.focus({ preventScroll: true }), 320);
        }
      }
    });
  };

  const clearError = (field: string) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  // 🟥 Submit-level failure banner (replaces alert() on a failed place-order).
  const [submitError, setSubmitError] = useState('');
  const popupEmailErrorRef = useRef(false);

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
    email: '',
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
          const { addItem, updateQuantity } = useCart.getState();
          
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
              total_sales: 0,
              slug: '',
              regular_price: String(recovered.price || '0'),
              sale_price: '',
              on_sale: false,
              stock_status: 'instock',
              stock_quantity: null,
              description: '',
              short_description: ''
            } as any;
            addItem(mockProduct, recovered.selectedVariation || undefined);
            if (recovered.quantity && recovered.quantity > 1) {
              const cartItemId = recovered.selectedVariation ? `${recovered.id}-${recovered.selectedVariation.databaseId}` : recovered.id;
              updateQuantity(cartItemId, recovered.quantity - 1);
            }
          });
        }
      }

      if (promoCoupon) {
        setCouponCode(promoCoupon);
        // Automatically verify/apply coupon
        const isRecover = promoCoupon.startsWith('RECOVER');
        setAppliedCoupon({
          code: promoCoupon,
          amount: isRecover ? Number(promoCoupon.replace('RECOVER', '')) : 10,
          type: isRecover ? 'fixed_cart' : 'percent',
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
    const savedEmail = decodeURIComponent(getCookie('user_email') || getCookie('billing_email') || '');
    const savedDistrict = decodeURIComponent(getCookie('billing_city') || '');
    const savedAddress = decodeURIComponent(getCookie('billing_address_1') || '');

    if (!savedPhone && !savedName && !savedEmail && !savedAddress) return;

    // 🛡️ AUTOFILL GUARD: browser autofill fires on the same tick as mount, often
    // AFTER this effect runs. Restoring cookies synchronously would therefore wipe
    // the values the browser just injected. Defer the restore, then only fill
    // fields that are still empty in the DOM — the browser always wins.
    const timer = window.setTimeout(() => {
      const domValue = (id: string) => {
        const el = document.getElementById(id) as HTMLInputElement | null;
        return el && el.value ? el.value.trim() : '';
      };
      const browserFilledPhone = domValue('checkout-phone');
      const browserFilledName = domValue('checkout-name');
      const browserFilledAddress = domValue('checkout-address');
      const browserFilledEmail = domValue('checkout-cancel-email');

      setFormData(prev => ({
        ...prev,
        phone: browserFilledPhone || savedPhone || prev.phone,
        firstName: browserFilledName || savedName || prev.firstName,
        email: browserFilledEmail || savedEmail || prev.email,
        district: savedDistrict || prev.district,
        address1: browserFilledAddress || savedAddress || prev.address1
      }));

      // Auto-map saved district cookie to delivery zone.
      // Cookie contains 'Dhaka' -> inside Dhaka (80tk). Any other district -> Outside (150tk).
      if (savedDistrict) {
        setShippingMethod(savedDistrict.trim().toLowerCase() === 'dhaka' ? 'dhaka' : 'outside');
      }
    }, 400);

    return () => window.clearTimeout(timer);
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

  // Per-product delivery fee calculation with fallback to default flat rate
  const customFees = items.map(item => Number(item.delivery_fee) || 0);
  const hasCustomFees = customFees.some(f => f > 0);
  
  const shippingCost = hasFreeShippingItem 
    ? 0 
    : (hasCustomFees 
      ? customFees.reduce((a, b) => a + b, 0) 
      : (shippingMethod === 'dhaka' ? 80 : 150));
  
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
    // Customer opened the cancel-offer popup: schedule a capture so the popup's
    // own discount flow has real data behind it. Gated + debounced like every
    // other path.
    scheduleIncompleteCapture();

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
  
  // 🚀 FIX #5: Sync payloadRef immediately on every state change
  payloadRef.current = { formData, items, finalTotal };

  // ⚠️ The legacy exit-intent tracker (beforeunload + visibilitychange + pagehide,
  // ungated) lived here. It is replaced by the gated `bestEffortExit` handler
  // below, which fires only when the payload actually passes the phone + field
  // gate and differs from the last captured signature. visibilitychange was the
  // worst offender: on mobile it fires on every app switch, transmitting customer
  // PII without consent. sessionStorage 'order_placed' is now handled by the
  // submit guard instead.

  const lastSentData = useRef({ phone: '', email: '' });

  // 🛡️ INCOMPLETE-CAPTURE CONTROL — pattern ported from Order Guard 1.51.1
  // (assets/js/incomplete-orders.js). Previously this fired on blur x3, on the
  // 11th digit, and on beforeunload/visibilitychange/pagehide — up to 7 times per
  // checkout for identical data. Now: one debounced capture, one signature, one
  // in-flight request, and a hard stop the moment a real order is submitted.
  const CAPTURE_DEBOUNCE_MS = 2500;
  const BD_PHONE_RE = /^01[3-9]\d{8}$/;
  const captureTimer = useRef<number | null>(null);
  const lastCaptureSignature = useRef('');
  const captureInFlight = useRef(false);
  const isSubmitting = useRef(false);

  // Deterministic signature over the fields that actually matter. Key order is
  // fixed by the literal below, so it never depends on JSON iteration order.
  const buildCaptureSignature = (d: typeof formData) =>
    [
      d.phone.replace(/\D/g, ''),
      (d.firstName || '').trim().toLowerCase(),
      (d.address1 || '').trim().toLowerCase(),
      (d.district || '').trim().toLowerCase(),
      (d.email || '').trim().toLowerCase(),
      items.map((it) => `${it.id}:${it.quantity}`).sort().join(','),
    ].join('|');

  // Gate: valid BD phone AND at least two other meaningful customer fields.
  // Order Guard counts >=3 raw fields; here the phone is mandatory, so the extra
  // requirement is 2 of {name, address, district, email} — an address-less row
  // cannot produce a useful recovery email.
  const isCaptureable = (d: typeof formData) => {
    if (!BD_PHONE_RE.test(d.phone.replace(/\D/g, ''))) return false;
    if (items.length === 0) return false;
    const others = [d.firstName, d.address1, d.district, d.email].filter(
      (v) => String(v || '').trim() !== ''
    ).length;
    return others >= 2;
  };

  const trackIncompleteOrder = async () => {
    const currentData = payloadRef.current;
    const { formData: fd, items: its } = currentData;

    if (isSubmitting.current || captureInFlight.current) return;
    if (!isCaptureable(fd)) return;
    if (buildCaptureSignature(fd) === lastCaptureSignature.current) return;

    const cleanPhone = fd.phone.replace(/\D/g, '');
    const userEmail = fd.email || getCookie('user_email');

    // Save to cookies for persistent recovery across sessions
    const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `user_phone=${cleanPhone}; expires=${expires}; path=/; SameSite=Lax`;
    if (fd.firstName) {
      document.cookie = `user_name=${encodeURIComponent(fd.firstName)}; expires=${expires}; path=/; SameSite=Lax`;
    }
    if (fd.email) {
      document.cookie = `user_email=${encodeURIComponent(fd.email)}; expires=${expires}; path=/; SameSite=Lax`;
    }
    if (fd.district) {
      document.cookie = `billing_city=${encodeURIComponent(fd.district)}; expires=${expires}; path=/; SameSite=Lax`;
    }
    if (fd.address1) {
      document.cookie = `billing_address_1=${encodeURIComponent(fd.address1)}; expires=${expires}; path=/; SameSite=Lax`;
    }

    captureInFlight.current = true;
    try {
      const fullAddress = fd.district ? `${fd.address1}, ${fd.district}` : fd.address1;
      const payload = {
        customer_name: fd.firstName || 'Guest',
        phone: cleanPhone,
        address: fullAddress,
        city: fd.district || '',
        email: userEmail ? decodeURIComponent(userEmail) : '',
        cart_products: its.map((item) => ({
          product_id: item.id,
          name: item.name,
          price: Number(item.price),
          quantity: Math.max(1, Number(item.quantity) || 1),
          thumbnail: bestProductImage(item)
        }))
      };
      const res = await fetch('/api/orders/save_to_wp.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) lastCaptureSignature.current = buildCaptureSignature(fd);
    } catch (err) {
      // signature unchanged -> the next debounce will retry
    } finally {
      captureInFlight.current = false;
    }
  };

  const scheduleIncompleteCapture = () => {
    if (captureTimer.current) window.clearTimeout(captureTimer.current);
    captureTimer.current = window.setTimeout(() => {
      captureTimer.current = null;
      trackIncompleteOrder();
    }, CAPTURE_DEBOUNCE_MS);
  };

  // Single debounced trigger. Replaces onBlur x3 + the 11-digit capture.
  useEffect(() => {
    const handler = () => {
      if (isSubmitting.current) return;
      scheduleIncompleteCapture();
    };
    document.addEventListener('change', handler);
    document.addEventListener('input', handler);
    return () => {
      document.removeEventListener('change', handler);
      document.removeEventListener('input', handler);
      if (captureTimer.current) window.clearTimeout(captureTimer.current);
    };
  }, []);

  // Emergency exit: best-effort beacon ONLY if the payload already passed the
  // gate and differs from what was last sent. The old code also fired on
  // visibilitychange (which fires on every app switch on mobile, silently
  // transmitting PII) and on pagehide (duplicating beforeunload). Both removed.
  useEffect(() => {
    const bestEffortExit = () => {
      if (isSubmitting.current) return;
      const { formData: fd } = payloadRef.current;
      if (!isCaptureable(fd)) return;
      if (buildCaptureSignature(fd) === lastCaptureSignature.current) return;

      const cleanPhone = fd.phone.replace(/\D/g, '');
      const userEmail = fd.email || getCookie('user_email');
      const fullAddress = fd.district ? `${fd.address1}, ${fd.district}` : fd.address1;
      navigator.sendBeacon(
        '/api/orders/save_to_wp.php',
        JSON.stringify({
          customer_name: fd.firstName || 'Guest',
          phone: cleanPhone,
          address: fullAddress,
          city: fd.district || '',
          email: userEmail ? decodeURIComponent(userEmail) : '',
          cart_products: items.map((item) => ({
            product_id: item.id,
            name: item.name,
            price: Number(item.price),
            quantity: Math.max(1, Number(item.quantity) || 1),
            thumbnail: bestProductImage(item)
          }))
        })
      );
    };
    window.addEventListener('beforeunload', bestEffortExit);
    return () => window.removeEventListener('beforeunload', bestEffortExit);
  }, [items]);

  // Submit guard: the moment an order is genuinely being placed, incomplete
  // capture must stop so we never record a customer as "abandoned" while they
  // are actually checking out.
  useEffect(() => {
    const stop = () => { isSubmitting.current = true; };
    document.addEventListener('submit', stop, true);
    return () => document.removeEventListener('submit', stop, true);
  }, []);

  // ⏱️ IDLE WIN-BACK OFFER — this replaces the visible CANCEL button that used to
  // occupy a full row above the form on mobile. A customer who pauses on checkout
  // without acting is the highest-intent abandoner there is, so they get the same
  // 20-100 BDT offer, just triggered by hesitation instead of by a button they
  // had to find. Fires at most once per session, never while an order is being
  // placed, and never before the customer has entered enough to be worth a nudge.
  useEffect(() => {
    const IDLE_MS = 45000;
    let fired = false;
    let timer: number | undefined;

    const arm = () => {
      if (fired || isSubmitting.current) return;
      if (showCancelPopup) return;
      const { formData: fd, items: its } = payloadRef.current;
      // Nudge only a real lead: a valid phone and at least one more field filled.
      if (!BD_PHONE_RE.test(fd.phone.replace(/\D/g, ''))) return;
      if (![fd.firstName, fd.address1, fd.district].some((v) => String(v || '').trim())) return;
      if (its.length === 0) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (isSubmitting.current || fired) return;
        fired = true;
        handleCancelClick();
      }, IDLE_MS);
    };

    const events: Array<keyof DocumentEventMap> = ['input', 'change', 'pointerdown', 'keydown'];
    events.forEach((e) => document.addEventListener(e, arm, { passive: true }));
    arm();

    return () => {
      window.clearTimeout(timer);
      events.forEach((e) => document.removeEventListener(e, arm));
    };
  }, [showCancelPopup]);

  
  const handleSubmit = async (e) => {
    e.preventDefault();
    // Hard stop for incomplete capture the moment a genuine order starts, so an
    // actively-converting customer is never re-flagged as "abandoned". A pending
    // debounce is cancelled outright.
    isSubmitting.current = true;
    setSubmitError('');
    if (captureTimer.current) { window.clearTimeout(captureTimer.current); captureTimer.current = null; }
    if (items.length === 0) return;

    // Validate in DOM order and stop at the first problem, so the customer is
    // scrolled to the topmost thing that still needs attention.
    if (!formData.firstName.trim()) {
      markError('name', 'আপনার নাম লিখুন।');
      return;
    }
    if (formData.phone.length !== 11 || !formData.phone.startsWith('01')) {
      markError('phone', 'সঠিক ১১ ডিজিট মোবাইল নম্বর লিখুন (যেমন 01712345678)।');
      return;
    }
    if (!formData.district) {
      markError('area', 'ডেলিভারি এরিয়া নির্বাচন করুন।');
      return;
    }
    if (!formData.address1.trim()) {
      markError('address', 'সম্পূর্ণ ঠিকানা লিখুন।');
      return;
    }

    setLoading(true);

    try {
      const nameParts = formData.firstName.trim().split(/\s+/);
      const fName = nameParts[0] || 'Guest';
      const lName = nameParts.slice(1).join(' ') || 'Customer';
      const savedEmail = formData.email || getCookie('user_email') || getCookie('billing_email') || "";

      const fbpToken = getCookie('_fbp');
      const fbcToken = getCookie('_fbc');

      const couponLines = appliedCoupon ? [{ code: appliedCoupon.code, discount: String(couponDiscountAmount) }] : [];

      const checkoutPayload = {
        customer: {
          name: formData.firstName,
          phone: formData.phone,
          email: savedEmail ? savedEmail.toLowerCase() : null, 
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
          thumbnail: bestProductImage(item)
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
        fetch(`/api/orders/remove_incomplete.php?phone=${cleanPhoneToDelete}`, {
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
        content_ids: items.map(i => String(i.id)),
        contents: items.map(i => ({ id: String(i.id), quantity: Math.max(1, Number(i.quantity) || 1), price: Number(i.price) })),
        num_items: items.reduce((acc, item) => acc + Math.max(1, Number(item.quantity) || 1), 0),
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
      setSubmitError(error.message || 'অর্ডার দেওয়া যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।');
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
      <div className="min-h-screen bg-gray-50 pt-3 md:pt-10 pb-28 md:pb-32 flex justify-center">
        <div className="max-w-[1600px] w-full px-4 sm:px-6 lg:px-8">
          {/* Header row removed. The former "CANCEL / win-back" button was hidden
              because it consumed a full row above the form on every mobile screen,
              and nothing else lived beside it. The win-back offer itself is untouched
              and still fires from handleCancelClick via the idle timer below, so the
              discount is not lost — it is just no longer paid for with 40px of every
              customer's viewport. */}

          {submitError && (
            <div role="alert" className="mb-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[13px] font-semibold text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="flex-1">{submitError}</span>
              <button type="button" onClick={() => setSubmitError('')} aria-label="বন্ধ করুন" className="shrink-0 opacity-60 hover:opacity-100">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-6 xl:gap-8 w-full">
          <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-4 md:p-6 space-y-5">
            
            {/* Top Product Overview Summary (matches user screenshot) */}
            <div className="bg-gray-50/70 border border-gray-100 rounded-2xl p-4 flex flex-col gap-3">
              {items.map((item, index) => {
                const safeQuantity = Math.max(1, Number(item.quantity) || 1);
                const topCartItemId = item.selectedVariation ? `${item.id}-${item.selectedVariation.databaseId}` : item.id;
                return (
                <div key={`${item.id}-${index}`} className="flex items-center gap-3.5 justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <ProductImage 
                      src={bestProductImage(item)} 
                      className="w-12 h-12 object-cover rounded-xl border border-gray-200 shrink-0 pointer-events-none" 
                      alt="" 
                    />
                    <div className="min-w-0">
                      <span className="inline-flex bg-brand-primary/10 text-brand-primary text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider mb-0.5">
                        Product
                      </span>
                      <h4 className="text-[12px] font-bold text-gray-900 truncate leading-tight">{item.name}</h4>
                      {/* 📦 Qty stepper + remove — mobile needs these here because the
                          sidebar copy is desktop-only. Same updateQuantity/removeItem
                          handlers as the sidebar, so behaviour is identical. */}
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex items-center bg-white border border-gray-200 rounded-md">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              if (updateQuantity && safeQuantity > 1) {
                                updateQuantity(topCartItemId, -1);
                              }
                            }}
                            className="w-6 h-6 flex items-center justify-center text-gray-600 hover:bg-gray-100 active:bg-gray-200 transition-colors disabled:opacity-40"
                            disabled={safeQuantity <= 1}
                            aria-label={`${item.name} quantity decrease`}
                          >
                            <Minus className="w-3 h-3 pointer-events-none" />
                          </button>
                          <span className="w-6 text-center text-[11px] font-bold text-gray-900 tabular-nums">
                            {safeQuantity}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              if (updateQuantity) {
                                updateQuantity(topCartItemId, 1);
                              }
                            }}
                            className="w-6 h-6 flex items-center justify-center text-gray-600 hover:bg-gray-100 active:bg-gray-200 transition-colors"
                            aria-label={`${item.name} quantity increase`}
                          >
                            <Plus className="w-3 h-3 pointer-events-none" />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            if (removeItem) removeItem(topCartItemId);
                          }}
                          className="inline-flex items-center gap-1 px-1.5 py-1 text-gray-400 hover:text-red-500 active:bg-red-50 transition-colors rounded"
                          aria-label={`${item.name} remove from cart`}
                          title="Remove item"
                        >
                          <Trash2 className="w-3 h-3 pointer-events-none" />
                          <span className="text-[9px] font-bold uppercase tracking-wide">সরান</span>
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="block text-[8px] text-gray-400 font-extrabold uppercase tracking-wide">Total Price</span>
                    <span className="text-[13px] font-extrabold text-gray-900">৳{(Number(item.price) * safeQuantity).toLocaleString()}</span>
                  </div>
                </div>
                );
              })}
              
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

            <section className="space-y-3 sm:space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3.5">
                <div className="sm:col-span-2" id="checkout-name-anchor">
                  <label className="block">
                    <span className="block text-xs font-semibold text-gray-600 mb-1">আপনার নাম <span className="text-red-500">*</span></span>
                    <input 
                      required
                      type="text" 
                      id="checkout-name"
                      name="name"
                      autoComplete="name"
                      enterKeyHint="next"
                      placeholder="এখানে আপনার সম্পূর্ণ নাম লিখুন" 
                      className={"w-full h-11 sm:h-10 px-3 rounded-xl border bg-white text-[15px] sm:text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 transition-all shadow-sm " + (fieldErrors.name ? "border-red-400 focus:border-red-500 focus:ring-red-400" : "border-gray-200 focus:border-brand-primary focus:ring-brand-primary")}
                      aria-invalid={!!fieldErrors.name}
                      value={formData.firstName}
                      onChange={(e) => { setFormData({...formData, firstName: e.target.value}); clearError('name'); }}
                    />
                  </label>
                  {fieldErrors.name && (
                    <p role="alert" className="mt-1.5 flex items-center gap-1 text-[12px] font-semibold text-red-600">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {fieldErrors.name}
                    </p>
                  )}
                </div>
                
                <div className="sm:col-span-2" id="checkout-phone-anchor">
                  <label className="block">
                    <span className="block text-xs font-semibold text-gray-600 mb-1 font-sans">মোবাইল নম্বর <span className="text-red-500">*</span></span>
                    <input 
                      required
                      type="tel" 
                      id="checkout-phone"
                      name="tel"
                      autoComplete="tel"
                      inputMode="numeric"
                      enterKeyHint="next"
                      placeholder="01XXXXXXXXX" 
                      maxLength={11}
                      className={"w-full h-11 sm:h-10 px-3 rounded-xl border bg-white text-[15px] sm:text-sm font-sans text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 transition-all shadow-sm " + (fieldErrors.phone ? "border-red-400 focus:border-red-500 focus:ring-red-400" : "border-gray-200 focus:border-brand-primary focus:ring-brand-primary")}
                      aria-invalid={!!fieldErrors.phone}
                      value={formData.phone}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        setFormData({...formData, phone: val});
                        if (val.length === 11 && val.startsWith('01')) clearError('phone');
                        else if (fieldErrors.phone) clearError('phone');
                      }}
                    />
                  </label>
                  {fieldErrors.phone && (
                    <p role="alert" className="mt-1.5 flex items-center gap-1 text-[12px] font-semibold text-red-600">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {fieldErrors.phone}
                    </p>
                  )}
                </div>

                {/* সম্পূর্ণ ঠিকানা */}
                <div className="sm:col-span-2" id="checkout-address-anchor">
                  <label className="block">
                    <span className="block text-xs font-semibold text-gray-600 mb-1">সম্পূর্ণ ঠিকানা <span className="text-red-500">*</span></span>
                    <input
                      required
                      id="checkout-address"
                      name="street-address"
                      autoComplete="address-line1"
                      type="text"
                      enterKeyHint="done"
                      placeholder={formData.district === 'Outside' ? "জেলা, থানা, গ্রাম ও বাসা নম্বর লিখুন" : "বাসা নম্বর, রোড নম্বর, এলাকা লিখুন"}
                      className={"w-full h-11 sm:h-10 px-3 rounded-xl border bg-white text-[15px] sm:text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 transition-all " + (fieldErrors.address ? "border-red-400 focus:border-red-500 focus:ring-red-400" : "border-gray-200 focus:border-brand-primary focus:ring-brand-primary")}
                      aria-invalid={!!fieldErrors.address}
                      value={formData.address1}
                      onChange={(e) => { setFormData({...formData, address1: e.target.value}); clearError('address'); }}
                    />
                  </label>
                  {fieldErrors.address && (
                    <p role="alert" className="mt-1.5 flex items-center gap-1 text-[12px] font-semibold text-red-600">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {fieldErrors.address}
                    </p>
                  )}
                </div>

                {/* ডেলিভারি এরিয়া — placed AFTER the address so the customer fills
                    each field once, top to bottom, with no scrolling back up. The
                    shipping cost only changes at submit time, so nothing on screen
                    jumps when this is picked. */}
                <div className="sm:col-span-2" id="checkout-area-anchor">
                  <h3 className="flex items-center gap-3 mb-2 sm:mb-3 text-sm md:text-base font-bold text-gray-900">
                    ডেলিভারি এরিয়া নির্বাচন করুন <span className="text-red-500">*</span>
                  </h3>
                  <div className="grid grid-cols-2 gap-1.5 md:gap-3 w-full">
                    {[
                      { id: 'Dhaka', title: 'ঢাকার ভেতরে' },
                      { id: 'Outside', title: 'ঢাকার বাইরে' },
                    ].map((da) => {
                      const isSelected = formData.district === da.id;
                      return (
                        <label
                          key={da.id}
                          className="relative flex items-center justify-center gap-1 md:gap-2 h-8 md:h-10 px-1 md:px-3.5 rounded-full border cursor-pointer transition-all duration-200 select-none"
                          style={{
                            borderColor: isSelected ? '#e2136e' : '#e5e7eb',
                            backgroundColor: isSelected ? 'rgba(226, 19, 110, 0.05)' : '#ffffff',
                            boxShadow: isSelected ? '0 0 0 1px #e2136e' : 'none',
                          }}
                        >
                          <input
                            type="radio"
                            name="delivery_area"
                            value={da.id}
                            checked={isSelected}
                            onChange={() => {
                              setFormData({...formData, district: da.id});
                              setShippingMethod(da.id === 'Dhaka' ? 'dhaka' : 'outside');
                              clearError('area');
                            }}
                            className="sr-only"
                          />
                          <span className="w-3 h-3 md:w-4 md:h-4 rounded-full border flex items-center justify-center shrink-0"
                            style={{ borderColor: isSelected ? '#e2136e' : '#d1d5db' }}
                          >
                            {isSelected && <span className="w-1.5 h-1.5 md:w-2.5 md:h-2.5 rounded-full" style={{ backgroundColor: '#e2136e' }} />}
                          </span>
                          <span className="font-bold text-[10px] min-[360px]:text-[11px] min-[390px]:text-[12px] md:text-sm whitespace-nowrap text-center truncate"
                            style={{ color: isSelected ? '#e2136e' : '#6b7280' }}
                          >
                            {da.title}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {fieldErrors.area && (
                    <p role="alert" className="mt-1.5 flex items-center gap-1 text-[12px] font-semibold text-red-600">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {fieldErrors.area}
                    </p>
                  )}
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

          {/* 🛒 ORDER SUMMARY SIDEBAR — desktop only.
              On mobile this was stacking underneath the form as a SECOND copy of
              the summary, pushing the real submit button far down the page. The
              mobile layout gets the same information (and the same qty/remove
              controls) from the top summary inside the form instead. */}
          <div className="relative hidden lg:block">
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
                          <ProductImage src={bestProductImage(item)} className="w-full h-full object-cover pointer-events-none" alt="" />
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
                               name="coupon"
                               autoComplete="off"
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
          
          <div className="bg-white rounded-2xl md:rounded-3xl max-w-md w-full shadow-[0_25px_60px_rgba(0,0,0,0.2)] border border-gray-100 overflow-hidden relative animate-scaleUp flex flex-col max-h-[85vh]">
            
            {/* Top decorative gradient bar */}
            <div className="h-2 w-full shrink-0 bg-gradient-to-r from-[#e2136e] via-brand-primary to-[#ff4081]" />

            {/* Close Button */}
            <button 
              type="button" 
              onClick={() => {
                setShowCancelPopup(false);
                window.location.href = '/';
              }}
              className="absolute top-4 right-4 z-10 text-gray-400 hover:text-gray-700 transition-colors w-8 h-8 flex items-center justify-center rounded-full bg-gray-100/80 hover:bg-gray-200 backdrop-blur-sm"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="p-4 md:p-6 text-center overflow-y-auto scrollbar-hide flex-1">
              <div className="w-9 h-9 md:w-11 md:h-11 bg-gradient-to-br from-red-50 to-red-100 text-brand-primary rounded-full flex items-center justify-center mx-auto mb-3 md:mb-4 shadow-inner">
                <Tag className="w-4.5 h-4.5 md:w-6 md:h-6" />
              </div>

              {/* Heading and the paragraph beneath it were removed. The voucher
                  amount already says everything the copy said, and on a phone this
                  block pushed the email field and the CTA below the fold. */}

              {/* Premium Ticket Style Voucher */}
              <div className="relative bg-gradient-to-br from-[#fff5f8] to-[#fff0f5] border border-[#e2136e]/20 rounded-2xl p-3.5 mb-3.5 shadow-sm overflow-hidden">
                {/* Left Ticket Notch */}
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-8 bg-white border-r border-[#e2136e]/20 rounded-r-full -translate-x-2" />
                {/* Right Ticket Notch */}
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-8 bg-white border-l border-[#e2136e]/20 rounded-l-full translate-x-2" />
                
                <span className="block text-[10px] uppercase tracking-wider font-extrabold text-[#e2136e] opacity-80">Special Savings Voucher</span>
                
                <div className="my-1.5 flex items-baseline justify-center gap-1">
                  <span className="text-3xl md:text-4xl font-black text-brand-primary tracking-tight">৳{randomDiscount + 50}</span>
                  <span className="text-sm font-bold text-gray-700">ফ্ল্যাট ছাড়</span>
                </div>
                
                <div className="border-t border-dashed border-[#e2136e]/30 pt-2 mt-2 text-left space-y-0.5 text-[11px] text-gray-600">
                  <div className="flex justify-between">
                    <span>বিশেষ কুপন ছাড়:</span>
                    <span className="font-bold text-gray-900">৳{randomDiscount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>অনলাইন পেমেন্ট ছাড়:</span>
                    <span className="font-bold text-[#e2136e]">৳৫০</span>
                  </div>
                </div>
                
                <div className="mt-2.5 inline-flex items-center gap-1.5 bg-white/80 border border-[#e2136e]/20 px-3 py-1 rounded-full text-xs font-mono font-bold text-brand-primary">
                  CODE: {generatedCouponCode}
                </div>
              </div>

              {/* Order Summary box */}
              <div className="bg-gray-50 rounded-2xl p-3 text-left border border-gray-200/60 text-[11px] space-y-1 mb-3.5">
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
              
              <div className="mb-3">
                <input 
                  type="email" 
                  required
                  id="checkout-cancel-email"
                  name="email"
                  autoComplete="email"
                  enterKeyHint="send"
                  placeholder="ডিসকাউন্ট পেতে আপনার ইমেইল দিন (বাধ্যতামূলক)" 
                  className="w-full h-11 px-4 rounded-xl border border-[#e2136e]/30 bg-white text-[15px] md:text-sm font-sans text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#e2136e] focus:ring-1 focus:ring-[#e2136e] transition-all shadow-sm text-center"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                />
              </div>

              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    if (!formData.email || !formData.email.includes('@')) {
                      popupEmailErrorRef.current = true;
                      const el = document.getElementById('checkout-cancel-email');
                      if (el) {
                        el.classList.add('border-red-400');
                        el.focus({ preventScroll: true });
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }
                      return;
                    }
                    const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
                    document.cookie = `user_email=${encodeURIComponent(formData.email)}; expires=${expires}; path=/; SameSite=Lax`;
                    applyCancelDiscount();
                  }}
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

