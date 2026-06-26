import { productDbPool } from "./db";
import { setCachedProducts } from "./services/redisClient";

// 🟢 EcomOS ম্যাপ
export let ecomosProductMap = new Map<string, number>();

export const syncLocalDatabase = async () => {
  try {
    const [rows]: any = await productDbPool.execute(`
        SELECT 
            id, wc_product_id, name, slug, sku, price, regular_price, sale_price, 
            on_sale, stock_status, stock_quantity, description, short_description, 
            images, thumbnail, categories, tags, menu_order, date_created, total_sales
        FROM wc_products_full
    `);
    
    if (rows && rows.length > 0) {
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
      
      await setCachedProducts(products);
      console.log(`[REDIS-DB] Successfully saved ${products.length} FULL products from DIRECT LOCAL DB to Redis! ⚡`);
    }
  } catch (error: any) {
    console.error('[REDIS-DB] Local DB Sync Failed:', error.message);
  }
};
