import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { dbPool } from '../db';
import { getProducts } from '../../src/lib/woocommerce';

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

// Generate Google OAuth2 access token for Firebase V1 API
async function getGoogleAccessToken(serviceAccount: ServiceAccount): Promise<string | null> {
  try {
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + 3600;
    
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const claim = Buffer.from(JSON.stringify({
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      exp,
      iat
    })).toString('base64url');
    
    const signInput = `${header}.${claim}`;
    const signature = crypto.sign(
      'RSA-SHA256',
      Buffer.from(signInput),
      serviceAccount.private_key.replace(/\\n/g, '\n')
    ).toString('base64url');
    
    const jwt = `${signInput}.${signature}`;
    
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt
      })
    });
    
    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`Google OAuth request failed: ${errText}`);
    }
    
    const tokenData = await tokenRes.json();
    return tokenData.access_token;
  } catch (error: any) {
    console.error('[FCM OAuth2 Error]:', error.message);
    return null;
  }
}

// Send push notification to all registered device tokens
export async function sendPushNotification(title: string, body: string, payload: Record<string, any> = {}) {
  try {
    const [tokens]: any = await dbPool.execute('SELECT token FROM bf_device_tokens');
    if (!tokens || tokens.length === 0) {
      console.log('[FCM V1] Push Notification skipped: No registered device tokens found.');
      return;
    }
    
    const deviceTokens = tokens.map((t: any) => t.token);
    
    let serviceAccount: ServiceAccount | null = null;
    const saPath = path.join(process.cwd(), 'firebase-service-account.json');
    
    if (fs.existsSync(saPath)) {
      try {
        const fileContent = fs.readFileSync(saPath, 'utf-8');
        serviceAccount = JSON.parse(fileContent);
        console.log('[FCM V1] Loaded Firebase Service Account from root file!');
      } catch (err: any) {
        console.warn('[FCM V1] Error parsing local service account file:', err.message);
      }
    }
    
    if (!serviceAccount) {
      try {
        const [rows]: any = await dbPool.execute(
          "SELECT setting_value FROM bf_app_settings WHERE setting_key = 'app_push_service_account' LIMIT 1"
        );
        if (rows && rows.length > 0 && rows[0].setting_value) {
          serviceAccount = JSON.parse(rows[0].setting_value);
          console.log('[FCM V1] Loaded Firebase Service Account from Database Settings!');
        }
      } catch (err: any) {
        console.warn('[FCM V1] Could not fetch service account from DB:', err.message);
      }
    }
    
    if (!serviceAccount) {
      console.log('[FCM V1 Warning] Push Notification Skipped! Google Firebase HTTP v1 requires "firebase-service-account.json" in project root.');
      return;
    }
    
    console.log(`[FCM V1] Generating OAuth2 token for Firebase project: ${serviceAccount.project_id}...`);
    const accessToken = await getGoogleAccessToken(serviceAccount);
    if (!accessToken) {
      console.error('[FCM V1 Error] Access Token generation failed!');
      return;
    }
    
    console.log(`[FCM V1] Broadcasting to ${deviceTokens.length} devices...`);
    const formattedData: Record<string, string> = {};
    if (payload) {
      Object.keys(payload).forEach(key => {
        formattedData[key] = String(payload[key]);
      });
    }
    
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`;
    const promises = deviceTokens.map(async (token: string) => {
      try {
        const response = await fetch(fcmUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title, body },
              data: formattedData
            }
          })
        });
        const resText = await response.text();
        console.log(`[FCM V1] Broadcast to token ${token.slice(0, 12)}... Response: ${resText.slice(0, 100)}`);
      } catch (err: any) {
        console.error(`[FCM V1 Error] Failed to send to token ${token.slice(0, 12)}:`, err.message);
      }
    });
    
    await Promise.all(promises);
    console.log('[FCM V1] Broadcast completed successfully!');
  } catch (error: any) {
    console.error('[FCM V1 Master Error]:', error.message);
  }
}

// Retargeting job: periodically select a product and push notifications to all users (Runs 4 times daily)
export async function sendDailyPushCampaign() {
  console.log('[Push Campaign] Starting push campaign processor...');
  try {
    const products = await getProducts();
    if (!products || products.length === 0) {
      console.log('[Push Campaign] No products found to promote.');
      return;
    }
    
    // Prioritize discount products
    const discountProducts = products.filter(p => {
      const reg = Number(p.regular_price) || 0;
      const sale = Number(p.price) || 0;
      return sale > 0 && reg > sale;
    });
    
    const targetProduct = discountProducts.length > 0
      ? discountProducts[Math.floor(Math.random() * discountProducts.length)]
      : products[Math.floor(Math.random() * products.length)];
      
    const cleanPrice = (priceStr: string) => Number(priceStr.replace(/[^0-9.-]+/g, '')) || 0;
    const salePrice = cleanPrice(targetProduct.price);
    const regPrice = cleanPrice(targetProduct.regular_price || targetProduct.price);
    
    let title = '⚡ নতুন কালেকশন অফার!';
    let body = `বুনন ফেব্রিক্স-এ চমৎকার "${targetProduct.name}" যুক্ত হয়েছে। এখনই স্টক শেষ হওয়ার আগে কিনুন!`;
    
    if (regPrice > salePrice) {
      const discountAmt = regPrice - salePrice;
      title = '🔥 দাম কমার বিশেষ অফার!';
      body = `"${targetProduct.name}"-এ ৳${discountAmt} বিশেষ ছাড়! আজকের অফার মূল্য মাত্র ৳${salePrice}`;
    }
    
    await sendPushNotification(title, body, {
      productId: targetProduct.id,
      image: targetProduct.images?.[0]?.src || '',
      url: `/product/${targetProduct.id}`
    });
    
    console.log(`[Push Campaign] Successfully broadcasted promotion campaign for: ${targetProduct.name}`);
  } catch (err: any) {
    console.error('[Push Campaign] Failed to run daily push campaign:', err.message);
  }
}
