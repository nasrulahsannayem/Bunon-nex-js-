import { createClient } from "redis";
import dotenv from "dotenv";
import { productDbPool } from "../db";

dotenv.config();

export const redisClient = createClient({
  url: `redis://${process.env.REDIS_HOST || '127.0.0.1'}:${process.env.REDIS_PORT || '6379'}`,
  password: process.env.REDIS_PASSWORD ? process.env.REDIS_PASSWORD.trim().replace(/"/g, '') : undefined
});

redisClient.on('error', (err) => console.error('[REDIS] Client Error', err));

(async () => {
  try {
    await redisClient.connect();
    console.log('[REDIS] Connected successfully ⚡');
  } catch (err) {
    console.error('[REDIS] Connection failed:', err);
  }
})();

let memoryCache: any[] = [];

const hydrateProductsFromLocalDb = async () => {
  try {
    let [rows]: any = await productDbPool.execute(`
      SELECT 
        id, wc_product_id, name, slug, sku, price, regular_price, sale_price,
        on_sale, stock_status, stock_quantity, track_stock, delivery_fee, inside_delivery_fee, outside_delivery_fee, description, short_description,
        images, thumbnail, categories, tags, menu_order, date_created, total_sales,
        local_images
      FROM bunon_products WHERE status = 'publish'
      ORDER BY id DESC
    `);

    let src = 'bunon_products';
    if (!rows || (rows as any[]).length === 0) {
      const [fb]: any = await productDbPool.execute(`
      SELECT
        id, wc_product_id, name, slug, sku, price, regular_price, sale_price,
        on_sale, stock_status, stock_quantity, track_stock, delivery_fee, inside_delivery_fee, outside_delivery_fee, description, short_description,
        images, thumbnail, categories, tags, menu_order, date_created, total_sales,
        local_images
      FROM wc_products_full
      ORDER BY id DESC
    `);
      if (fb && (fb as any[]).length > 0) { (rows as any) = fb; src = 'wc_products_full'; }
    }

    if (!rows || rows.length === 0) {
      return [];
    }

    const domainUrl = (process.env.DOMAIN_URL || 'https://bunon.shop').replace(/\/$/, '');

    const products = rows.map((p: any) => {
      let parsedImages = [];
      let parsedCategories = [];
      let parsedTags = [];
      let parsedLocal = [];
      try { parsedImages = typeof p.images === 'string' ? JSON.parse(p.images) : (p.images || []); } catch(e){}
      try { parsedCategories = typeof p.categories === 'string' ? JSON.parse(p.categories) : (p.categories || []); } catch(e){}
      try { parsedTags = typeof p.tags === 'string' ? JSON.parse(p.tags) : (p.tags || []); } catch(e){}
      try { parsedLocal = typeof p.local_images === 'string' ? JSON.parse(p.local_images) : (p.local_images || []); } catch(e){}

      // Prefer locally-hosted images (domain-relative paths starting with /uploads)
      // Fall back to WP-hosted images only if no local copy exists.
      let finalImages = [];
      if (parsedLocal && parsedLocal.length > 0) {
        finalImages = parsedLocal.map((src: string) =>
          src.startsWith('/') ? { src: domainUrl + src } : { src }
        );
      } else if (parsedImages.length > 0) {
        finalImages = parsedImages;
      } else {
        finalImages = [{ src: p.thumbnail || '' }];
      }


      // Dual-price normalize: effective price = valid sale ?? regular ?? price
      const regN = (p.regular_price != null && p.regular_price !== '') ? Number(p.regular_price) : NaN;
      const saleN = (p.sale_price != null && p.sale_price !== '') ? Number(p.sale_price) : NaN;
      const baseN = (p.price != null && p.price !== '') ? Number(p.price) : NaN;
      const reg = !isNaN(regN) && regN > 0 ? regN : ((!isNaN(baseN) && baseN > 0) ? baseN : 0);
      const hasSale = !isNaN(saleN) && saleN > 0 && saleN < reg;
      const eff = hasSale ? saleN : reg;
      const discAmt = hasSale ? (reg - eff) : 0;
      const discPct = hasSale && reg > 0 ? Math.round((discAmt / reg) * 100) : 0;

      return {
        id: p.wc_product_id || p.id,
        wc_product_id: p.wc_product_id,
        name: p.name,
        slug: p.slug || p.name.toLowerCase().replace(/\s+/g, '-'),
        sku: p.sku,
        price: String(eff),
        regular_price: String(reg),
        sale_price: hasSale ? String(eff) : null,
        on_sale: hasSale,
        discount_amount: discAmt,
        discount_percent: discPct,
        source_table: src,
        stock_status: p.stock_status || 'instock',
        stock_quantity: p.stock_quantity,
        track_stock: p.track_stock == null ? 1 : Number(p.track_stock),
        delivery_fee: p.delivery_fee != null ? Number(p.delivery_fee) : null,
        inside_delivery_fee: p.inside_delivery_fee != null ? Number(p.inside_delivery_fee) : null,
        outside_delivery_fee: p.outside_delivery_fee != null ? Number(p.outside_delivery_fee) : null,
        available: (p.track_stock != null && Number(p.track_stock) === 0) ? true : Number(p.stock_quantity || 0) > 0,
        description: p.description || '',
        short_description: p.short_description || '',
        images: finalImages,
        thumbnail: finalImages.length > 0 ? finalImages[0].src : (p.thumbnail || ''),
        categories: parsedCategories.length > 0 ? parsedCategories : [{ name: 'All Products', slug: 'All' }],
        tags: parsedTags,
        menu_order: p.menu_order || 0,
        date_created: p.date_created,
        total_sales: p.total_sales || 0
      };
    });

    memoryCache = products;
    try {
      if (redisClient.isReady) {
        await redisClient.set('products', JSON.stringify(products));
      }
    } catch (err) {
      console.error('[REDIS] Error setting cache after DB hydrate');
    }

    console.log(`[REDIS-DB] Hydrated ${products.length} products from LOCAL DB fallback.`);
    return products;
  } catch (err: any) {
    console.error('[REDIS-DB] Local DB hydrate failed:', err.message);
    return [];
  }
};

export const getCachedProducts = async () => {
  try {
    if (redisClient.isReady) {
      const data = await redisClient.get('products');
      if (data) {
        return JSON.parse(data as string);
      }
    }
  } catch (err) {
    console.error('[REDIS] Error getting cache, using RAM/DB fallback');
  }

  if (memoryCache.length > 0) {
    return memoryCache;
  }

  return await hydrateProductsFromLocalDb();
};

// Invalidate both RAM + Redis product caches so admin writes reflect on storefront instantly.
export const invalidateProductsCache = async () => {
  memoryCache = [];
  try {
    if (redisClient.isReady) await redisClient.del('products');
  } catch (err) {
    console.error('[REDIS] Error invalidating products cache');
  }
};

export const setCachedProducts = async (products: any[]) => {
  memoryCache = products; // Always save to RAM fallback
  try {
    if (redisClient.isReady) {
      await redisClient.set('products', JSON.stringify(products));
    }
  } catch (err) {
    console.error('[REDIS] Error setting cache');
  }
};
