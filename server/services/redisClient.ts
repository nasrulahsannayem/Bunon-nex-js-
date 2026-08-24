import { createClient } from "redis";
import dotenv from "dotenv";
import { productDbPool } from "../db";

dotenv.config();

export const redisClient = createClient({
  url: `redis://${process.env.REDIS_HOST || '127.0.0.1'}:${process.env.REDIS_PORT || '6379'}`,
  password: process.env.REDIS_PASSWORD ? process.env.REDIS_PASSWORD.replace(/"/g, '') : undefined
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
    const [rows]: any = await productDbPool.execute(`
      SELECT 
        id, wc_product_id, name, slug, sku, price, regular_price, sale_price,
        on_sale, stock_status, stock_quantity, description, short_description,
        images, thumbnail, categories, tags, menu_order, date_created, total_sales
      FROM wc_products_full
      ORDER BY id DESC
    `);

    if (!rows || rows.length === 0) {
      return [];
    }

    const products = rows.map((p: any) => {
      let parsedImages = [];
      let parsedCategories = [];
      let parsedTags = [];
      try { parsedImages = typeof p.images === 'string' ? JSON.parse(p.images) : (p.images || []); } catch(e){}
      try { parsedCategories = typeof p.categories === 'string' ? JSON.parse(p.categories) : (p.categories || []); } catch(e){}
      try { parsedTags = typeof p.tags === 'string' ? JSON.parse(p.tags) : (p.tags || []); } catch(e){}

      return {
        id: p.wc_product_id || p.id,
        wc_product_id: p.wc_product_id,
        name: p.name,
        slug: p.slug || p.name.toLowerCase().replace(/\s+/g, '-'),
        sku: p.sku,
        price: p.price,
        regular_price: p.regular_price,
        sale_price: p.sale_price,
        on_sale: !!p.on_sale,
        stock_status: p.stock_status || 'instock',
        stock_quantity: p.stock_quantity,
        description: p.description || '',
        short_description: p.short_description || '',
        images: parsedImages.length > 0 ? parsedImages : [{ src: p.thumbnail || '' }],
        thumbnail: p.thumbnail || (parsedImages.length > 0 ? parsedImages[0].src : ''),
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
        return JSON.parse(data);
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
