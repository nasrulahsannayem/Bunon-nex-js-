import axios from 'axios';

const CATALOG_URL = '/api/products';

// 🔥 ওমনি-পিক্সেল ট্র্যাকিং মেকানিজম (যা কার্ট ও উইশলিস্ট ব্যবহার করে) 🔥
export const trackPixel = (event: string, data?: any) => {
  if (typeof window !== 'undefined') {
    if ((window as any).fbq) (window as any).fbq('track', event, data);
    if ((window as any).gtag) (window as any).gtag('event', event, data);
    if ((window as any).ttq) (window as any).ttq.track(event, data);
  }
  console.log(`[Omni-Tracking] ${event}`, data);
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
  categories: { name: string; slug: string }[];
  tags: string[];
  menu_order: number;
  date_created: string;
  total_sales: number;
  sku?: string; // Added optional sku for search reference
}

let storeDataCache: any = null;
let storeDataPromise: Promise<any> | null = null;

const CACHE_KEY = 'bunon_oms_tunnel_v7'; 
const CACHE_TIME_KEY = 'bunon_oms_tunnel_time_v7';
const CACHE_EXPIRY_MS = 1000 * 60 * 10; // 10 Mins

const fetchStoreData = async () => {
  if (storeDataCache) return storeDataCache;
  if (storeDataPromise) return storeDataPromise;

  if (typeof window !== 'undefined') {
    const cachedData = localStorage.getItem(CACHE_KEY);
    const cachedTime = localStorage.getItem(CACHE_TIME_KEY);
    if (cachedData && cachedTime) {
      if (new Date().getTime() - parseInt(cachedTime) < CACHE_EXPIRY_MS) {
        storeDataCache = JSON.parse(cachedData);
        fetchFreshDataBackground();
        return storeDataCache;
      }
    }
  }
  storeDataPromise = fetchFreshDataBackground();
  return storeDataPromise;
};

const fetchFreshDataBackground = async () => {
  try {
    const res = await axios.get(`https://bunon.shop${CATALOG_URL}`);
    if (!res.data || !res.data.ok) throw new Error("Invalid response");
    
    const rawProducts = (res.data.data || []).map((p: any) => {
      // Rewrite images to go through local proxy caching
      const localImages = (p.images || []).map((img: any) => {
        if (img.src && (img.src.startsWith('http://') || img.src.startsWith('https://')) && !img.src.includes('bunon.shop/api/image-proxy')) {
          return { ...img, src: `https://bunon.shop/api/image-proxy?url=${encodeURIComponent(img.src)}` };
        }
        return img;
      });

      let localThumbnail = p.thumbnail || '';
      if (localThumbnail && (localThumbnail.startsWith('http://') || localThumbnail.startsWith('https://')) && !localThumbnail.includes('bunon.shop/api/image-proxy')) {
        localThumbnail = `https://bunon.shop/api/image-proxy?url=${encodeURIComponent(localThumbnail)}`;
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
    }
    return storeDataCache;
  } catch (err) {
    return storeDataCache || { categories: [], products: [] };
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
  const storeData = await fetchStoreData();
  return storeData.categories;
};

export const getProduct = async (idOrSlug: string | number) => {
  const storeData = await fetchStoreData();
  return (storeData.products as Product[]).find(p => 
    p.id.toString() === idOrSlug.toString() || p.slug === idOrSlug.toString()
  ) || null;
};

export const createOrder = async (orderData: any) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        id: Math.floor(Math.random() * 100000),
        orderKey: `bunon_order_${Math.random().toString(36).substring(7)}`,
        total: String(orderData.total || "0.00"),
        paymentMethodTitle: orderData.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Online Payment',
        payment_url: null,
        result: "success"
      });
    }, 1200);
  });
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
