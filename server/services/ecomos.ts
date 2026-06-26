import axios from "axios";
import { ecomosProductMap } from "../store";

export async function syncEcomosProducts() {
  try {
    let page = 1;
    let hasMore = true;
    ecomosProductMap.clear(); 

    while (hasMore) {
      const response = await axios.get(`https://my.ecomos.store/api/v1/products?limit=100&page=${page}`, {
        headers: { "Authorization": `Bearer ${process.env.ECOMOS_API_TOKEN}` }
      });

      const responseData = response.data?.data;
      if (!responseData) {
          const errorPreview = typeof response.data === 'string' ? '(Received HTML/Text response instead of JSON)' : response.data;
          console.error("[EcomOS] Sync Warning: Invalid API response or no data", errorPreview);
          break;
      }
      
      const { data, last_page } = responseData;
      
      if (Array.isArray(data)) {
        data.forEach((p: any) => {
          if (p.sku) {
              ecomosProductMap.set(p.sku, p.id);
          }
        });
      }

      console.log(`[EcomOS] Syncing page ${page}...`);
      
      if (page >= last_page) {
        hasMore = false;
      } else {
        page++;
      }
    }
    console.log("[EcomOS] Product Map Updated Successfully with all products!");
  } catch (e: any) {
    console.error("[EcomOS] Failed to sync products:", e.message);
  }
}

export async function sendToEcomOS(orderData: any) {
  const token = process.env.ECOMOS_API_TOKEN;
  console.log("[DEBUG] Starting EcomOS Sync. Token exists:", !!token);

  if (!token) {
    console.error("[ERROR] ECOMOS_API_TOKEN is not defined in .env!");
    return;
  }

  try {
    console.log("[DEBUG] Sending payload to EcomOS:", JSON.stringify(orderData));
    
    const response = await axios.post("https://my.ecomos.store/api/v1/orders", orderData, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json",
        "Content-Type": "application/json"
      }
    });
    
    console.log("[EcomOS] Order synced successfully! Invoice:", response.data?.data?.invoice);
  } catch (error: any) {
    if (error.response) {
      console.error("[EcomOS] API Error Response:", JSON.stringify(error.response.data));
    } else {
      console.error("[EcomOS] Network Error:", error.message);
    }
  }
}
