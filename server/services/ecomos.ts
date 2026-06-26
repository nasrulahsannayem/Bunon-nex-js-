import axios from "axios";
import { ecomosProductMap } from "../store";

// Track last warning time to avoid spamming logs
let lastEcomOsWarnTime = 0;
const ECOMOS_WARN_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

export async function syncEcomosProducts() {
  try {
    let page = 1;
    let hasMore = true;
    ecomosProductMap.clear(); 

    while (hasMore) {
      const response = await axios.get(`https://my.ecomos.store/api/v1/products?limit=100&page=${page}`, {
        headers: { "Authorization": `Bearer ${process.env.ECOMOS_API_TOKEN}` },
        timeout: 15000 // 15 second timeout
      });

      const responseData = response.data?.data;
      if (!responseData) {
          const now = Date.now();
          if (now - lastEcomOsWarnTime > ECOMOS_WARN_COOLDOWN_MS) {
            const errorPreview = typeof response.data === 'string' ? '(Received HTML/Text response instead of JSON - API may be down or token expired)' : response.data;
            console.warn("[EcomOS] Sync Warning: Invalid API response or no data", errorPreview);
            lastEcomOsWarnTime = now;
          }
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

      if (page >= last_page) {
        hasMore = false;
      } else {
        page++;
      }
    }
    if (ecomosProductMap.size > 0) {
      console.log("[EcomOS] Product Map Updated Successfully with all products!");
    }
  } catch (e: any) {
    const now = Date.now();
    if (now - lastEcomOsWarnTime > ECOMOS_WARN_COOLDOWN_MS) {
      console.error("[EcomOS] Failed to sync products:", e.message);
      lastEcomOsWarnTime = now;
    }
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
