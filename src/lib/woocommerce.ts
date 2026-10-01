import axios from 'axios';

const CATALOG_URL = '/api/products';

// 🔥 ওমনি-পিক্সেল ট্র্যাকিং মেকানিজম (যা কার্ট ও উইশলিস্ট ব্যবহার করে) 🔥
// Funnel events must fire once per session-step. ProductDetail fires
// InitiateCheckout on 'Buy Now' AND the Checkout route fires it again on mount,
// which inflated the checkout-start count in Ads Manager. Suppress a repeat of
// the same funnel event within the dedupe window.
const FUNNEL_DEDUPE_WINDOW_MS = 30_000;
const _funnelFiredAt: Record<string, number> = {};

export const trackPixel = (event: string, data?: any) => {
  const eventId = `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  if (typeof window !== 'undefined') {
    if (event === 'InitiateCheckout') {
      const last = _funnelFiredAt.InitiateCheckout || 0;
      const now = Date.now();
      if (last && now - last < FUNNEL_DEDUPE_WINDOW_MS) {
        console.log('[Omni-Tracking] InitiateCheckout suppressed (duplicate within window)');
        return;
      }
      _funnelFiredAt.InitiateCheckout = now;
    }
    // ViewContent is per-product: only suppress a re-render of the SAME product,
    // never a genuine browse to a different one.
    if (event === 'ViewContent') {
      const cid = String(data?.content_ids?.[0] ?? data?.content_name ?? '');
      const key = `ViewContent:${cid}`;
      const last = _funnelFiredAt[key] || 0;
      const now = Date.now();
      if (last && now - last < FUNNEL_DEDUPE_WINDOW_MS) {
        console.log(`[Omni-Tracking] ViewContent suppressed for ${cid} (duplicate within window)`);
        return;
      }
      _funnelFiredAt[key] = now;
    }
    // fbq throws parameter validation errors if user_data or unrecognized fields are passed inside track()
    const browserData = { ...data };
    delete browserData.user_data;
    
    // Meta Pixel STRICT validation for ALL events: value must be a finite number,
    // currency must be a 3-letter uppercase string (else fbq throws currency format error).
    const metaPixelData = { ...browserData };
    if (metaPixelData.value != null) {
      const n = Number(metaPixelData.value);
      if (Number.isFinite(n) && n >= 0) metaPixelData.value = n;
      else delete metaPixelData.value;
    }
    // Meta rejects a currency that arrives without a usable value (fired
    // "Invalid parameter format for currency"), so currency is validated
    // AND coupled to value: it only survives when value is a real number.
    if (metaPixelData.currency != null) {
      const c = String(metaPixelData.currency).trim().toUpperCase();
      if (/^[A-Z]{3}$/.test(c) && typeof metaPixelData.value === 'number') {
        metaPixelData.currency = c;
      } else {
        delete metaPixelData.currency;
      }
    }
    // NOTE: transaction_id must survive to fbq('track') so Meta can dedupe the
    // browser event against the CAPI copy (both share eventID + transaction_id).
    // Stripping it here caused duplicate Purchase counts in Ads Manager.
    if (event === 'Purchase') {
      // external_id is not a browser-pixel field -> Meta rejects unknown fields.
      delete metaPixelData.external_id;
    }
    
    if ((window as any).fbq) (window as any).fbq('track', event, metaPixelData, { eventID: eventId });
    if ((window as any).gtag) (window as any).gtag('event', event, browserData);
    const ttq = (window as any).ttq;
    // TikTok stub queues via .track until the real SDK loads; guard the
    // call so a missing/partial stub can never throw and kill tracking.
    if (ttq && typeof ttq.track === 'function') {
      try {
        // TikTok expects singular content_id / content_category; Meta's
        // content_ids is silently dropped and warned about
        // ("Missing 'content_id' parameter") which blocks Video Shopping Ads.
        const ttData: any = { ...browserData };
        delete ttData.content_ids;
        delete ttData.content_category;
        const firstId = Array.isArray(browserData.content_ids)
          ? browserData.content_ids[0]
          : browserData.content_ids;
        if (firstId != null) ttData.content_id = String(firstId);
        if (browserData.content_category != null) {
          ttData.content_category = String(browserData.content_category);
        }
        ttq.track(event, ttData);
      } catch { /* TikTok non-critical */ }
    }
    // We send the same eventId to the backend so Facebook deduplicates them!
    const getCookie = (name: string) => {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
      return null;
    };
    
    // Automatically capture user data if available in cookies (Advanced Matching)
    let userData = data?.user_data || {};
    if (!userData.ph && getCookie('user_phone')) userData.ph = getCookie('user_phone');
    if (!userData.fn && getCookie('user_name')) userData.fn = getCookie('user_name');
    if (!userData.em && getCookie('user_email')) userData.em = getCookie('user_email');
    if (!userData.ct && getCookie('billing_city')) userData.ct = getCookie('billing_city');
    if (!userData.fbp && getCookie('_fbp')) userData.fbp = getCookie('_fbp');
    if (!userData.fbc && getCookie('_fbc')) userData.fbc = getCookie('_fbc');
    // Google Ads click IDs were never forwarded, so GA4 could not tie the
    // server-side event back to the originating ad click.
    ['gclid', 'gbraid', 'wbraid', 'ttclid', 'ttp', 'epid'].forEach((k) => {
      const v = getCookie(k);
      if (v) userData[k] = v;
    });
    // GA4 counts one visitor per client_id + session_id pair. The server copy was
    // using event_id as the session, so every event looked like a brand-new user
    // (Realtime then showed inflated 'active users' from the wrong countries).
    let ga4Session = '';
    try { ga4Session = sessionStorage.getItem('bf_live_sid') || ''; } catch { /* private mode */ }
    if (!ga4Session) {
      ga4Session = Math.random().toString(36).slice(2) + Date.now().toString(36);
      try { sessionStorage.setItem('bf_live_sid', ga4Session); } catch { /* ignore */ }
    }
    if (!userData.session_id) userData.session_id = ga4Session;


    // Server-side tracking (CAPI + GA4 MP).
    // No secret is sent: the server scrubs monetary fields from browser events,
    // so this call can never inject revenue into the ad accounts. Purchase value
    // is reported only by the signed server-owned pipeline (orders/WhatsApp).
    fetch('/api/v1/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_name: event,
        event_id: eventId,
        event_source_url: window.location.href,
        user_data: userData,
        custom_data: data
      })
    }).catch(() => { /* tracking is best-effort */ });

  }

  console.log(`[Omni-Tracking] ${event} (ID: ${eventId})`, data);
};

export interface Product {
  id: number;
  databaseId?: number;
  name: string;
  slug: string;
  price: string;
  regular_price: string;
  sale_price: string;
  on_sale: boolean;
  stock_status: string;
  stock_quantity: number | null;
  description: string;
  short_description: string;
  images: { src: string }[];
  thumbnail?: string;
  shipping_class?: string;
  free_shipping?: boolean;
  categories: { name: string; slug: string }[];
  tags: string[];
  attributes?: any[];
  displayPrice?: string;
  variations?: any[];
  menu_order: number;
  date_created: string;
  total_sales: number;
  sku?: string; // Added optional sku for search reference
}

let storeDataCache: any = null;
let storeDataPromise: Promise<any> | null = null;

const CACHE_KEY = 'bunon_oms_tunnel_v8'; 
const CACHE_TIME_KEY = 'bunon_oms_tunnel_time_v8';
const CACHE_EXPIRY_MS = 1000 * 60 * 10; // 10 Mins

const VER_KEY = 'bunon_catalog_v';
const fetchStoreData = async () => {
  if (storeDataCache) return storeDataCache;
  if (storeDataPromise) return storeDataPromise;

  if (typeof window !== 'undefined') {
    const cachedData = localStorage.getItem(CACHE_KEY);
    const cachedTime = localStorage.getItem(CACHE_TIME_KEY);
    if (cachedData && cachedTime) {
      if (new Date().getTime() - parseInt(cachedTime) < CACHE_EXPIRY_MS) {
        // Instant-change guard: server version changed? skip stale cache.
        try {
          const vr = await axios.get('/api/products/version', { timeout: 4000 });
          const sv = Number(vr.data?.v || 0);
          const cv = Number(localStorage.getItem(VER_KEY) || 0);
          if (!sv || sv <= cv) {
            storeDataCache = JSON.parse(cachedData);
            fetchFreshDataBackground();
            return storeDataCache;
          }
        } catch { /* version check failed -> use cache as before */ 
          storeDataCache = JSON.parse(cachedData);
          fetchFreshDataBackground();
          return storeDataCache;
        }
      }
    }
  }
  storeDataPromise = fetchFreshDataBackground();
  return storeDataPromise;
};

const fetchFreshDataBackground = async () => {
  try {
    const res = await axios.get(CATALOG_URL);
    if (!res.data || !res.data.ok) throw new Error("Invalid response");
    
    const rawProducts = (res.data.data || []).map((p: any) => {
      // Rewrite images to go through local proxy caching
      const localImages = (p.images || []).map((img: any) => {
        if (img.src && (img.src.startsWith('http://') || img.src.startsWith('https://')) && !img.src.includes('/api/image-proxy')) {
          return { ...img, src: `/api/image-proxy?url=${encodeURIComponent(img.src)}` };
        }
        return img;
      });

      let localThumbnail = p.thumbnail || '';
      if (localThumbnail && (localThumbnail.startsWith('http://') || localThumbnail.startsWith('https://')) && !localThumbnail.includes('/api/image-proxy')) {
        localThumbnail = `/api/image-proxy?url=${encodeURIComponent(localThumbnail)}`;
      } else if (!localThumbnail && localImages.length > 0) {
        localThumbnail = localImages[0].src;
      }

      return {
        ...p,
        images: localImages,
        thumbnail: localThumbnail
      };
    });
    
    const catMap = new Map();
    catMap.set('All', { id: 'all', name: 'All Products', slug: 'All' });

    rawProducts.forEach((p: any) => {
      if (p.categories) {
        p.categories.forEach((c: any) => {
          if (c.slug) {
            catMap.set(c.slug, { id: c.slug, name: c.name, slug: c.slug });
          }
        });
      }
    });

    storeDataCache = { 
      categories: Array.from(catMap.values()), 
      products: rawProducts 
    };

    if (typeof window !== 'undefined') {
      localStorage.setItem(CACHE_KEY, JSON.stringify(storeDataCache));
      localStorage.setItem(CACHE_TIME_KEY, new Date().getTime().toString());
      axios.get('/api/products/version', { timeout: 4000 }).then(vr => {
        const sv = Number(vr.data?.v || 0);
        if (sv) localStorage.setItem(VER_KEY, String(sv));
      }).catch(() => {});
    }
    return storeDataCache;
  } catch (err) {
    if (storeDataCache && storeDataCache.products && storeDataCache.products.length > 0) {
      return storeDataCache;
    }
    // 🔥 FIX: Aggressively try to read from local storage if network fails
    if (typeof window !== 'undefined') {
      const fallbackData = localStorage.getItem(CACHE_KEY);
      if (fallbackData) {
        try {
          storeDataCache = JSON.parse(fallbackData);
          if (storeDataCache && storeDataCache.products) {
            return storeDataCache;
          }
        } catch (e) {}
      }
    }
    return { categories: [], products: [] };
  }
};

export const getProducts = async (categorySlug?: string, search?: string) => {
  const storeData = await fetchStoreData();
  let allProducts = storeData.products as Product[];

  if (categorySlug && categorySlug !== 'All') {
    allProducts = allProducts.filter(p => p.categories.some(c => c.slug === categorySlug));
  }
  if (search) {
    allProducts = allProducts.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  }
  return allProducts;
};

export const getCategories = async () => {
  try {
    const r = await axios.get("/api/categories", { timeout: 8000 });
    if (r.data && r.data.ok && Array.isArray(r.data.categories) && r.data.categories.length > 0) {
      const local = r.data.categories.map((c: any) => ({ id: c.id ?? c.slug, name: c.name, slug: c.slug }));
      return [{ id: "all", name: "All Products", slug: "All" }, ...local];
    }
  } catch {}
  const storeData = await fetchStoreData();
  return storeData.categories;
};

export const getProduct = async (idOrSlug: string | number) => {
  const storeData = await fetchStoreData();
  return (storeData.products as Product[]).find(p => 
    p.id.toString() === idOrSlug.toString() || p.slug === idOrSlug.toString()
  ) || null;
};



// 🚀 FIXED: Added the missing searchProducts function for the Navbar Live Search
export const searchProducts = async (query: string) => {
  const storeData = await fetchStoreData();
  const allProducts = storeData.products as Product[];
  
  if (!query) return [];
  
  const lowerQuery = query.toLowerCase();
  
  // Search by product name, slug, or ID
  return allProducts.filter(p => 
    p.name.toLowerCase().includes(lowerQuery) || 
    p.slug.toLowerCase().includes(lowerQuery) ||
    p.id.toString().includes(lowerQuery)
  );
};
