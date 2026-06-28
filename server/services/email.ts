import nodemailer from 'nodemailer';
import { dbPool, productDbPool } from '../db';
import { getCachedProducts } from './redisClient';

const IS_LOCAL = process.env.MAIL_HOST === '127.0.0.1' || process.env.MAIL_HOST === 'localhost';
const MAIL_PORT = IS_LOCAL ? 25 : (Number(process.env.MAIL_PORT) || 465); // Force 25 for local to bypass submission auth
const IS_SECURE = MAIL_PORT === 465; // 465=SSL/TLS, 587/25=STARTTLS/Plain

const transporterConfig: any = {
  host: process.env.MAIL_HOST || '127.0.0.1',
  port: MAIL_PORT,
  secure: IS_SECURE,
  ignoreTLS: IS_LOCAL && !IS_SECURE, // If local and not 465, ignore TLS to avoid sendmail 454 STARTTLS error
  tls: {
    rejectUnauthorized: false
  }
};

// 🚀 FIX: Local sendmail acts as an open relay for 127.0.0.1 but will reject virtual user auth.
// Only provide auth if we are NOT connecting to localhost, or if explicitly required.
if (!IS_LOCAL) {
  transporterConfig.auth = {
    user: process.env.MAIL_USER || 'admin@bunonfabrics.com',
    pass: process.env.MAIL_PASS ? process.env.MAIL_PASS.replace(/"/g, '') : 'naim#707207AA'
  };
}

// Initialize NodeMailer transporter
export const mailTransporter = nodemailer.createTransport(transporterConfig);

// Verify connection on startup (non-blocking)
mailTransporter.verify((error) => {
  if (error) {
    console.warn(`[Email] SMTP connection warning (${process.env.MAIL_HOST}:${MAIL_PORT}):`, error.message);
  } else {
    console.log(`[Email] SMTP ready ✓ (host: ${process.env.MAIL_HOST}, port: ${MAIL_PORT}, secure: ${IS_SECURE})`);
  }
});

/**
 * Standard Footer and Header wrapper to ensure Inbox-delivery and high styling
 */
function wrapHtmlBody(title: string, bodyContent: string, email: string): string {
  const unsubscribeUrl = `https://bunon.shop/api/unsubscribe?email=${encodeURIComponent(email)}`;
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 0; color: #1f2937; }
        .wrapper { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #f3f4f6; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
        .header { background: linear-gradient(135deg, #e2136e 0%, #ff4081 100%); padding: 30px; text-align: center; color: white; }
        .header h1 { margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
        .content { padding: 30px; line-height: 1.6; font-size: 15px; }
        .footer { background-color: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #f3f4f6; }
        .footer a { color: #e2136e; text-decoration: none; font-weight: 600; }
        .btn { display: inline-block; background-color: #e2136e; color: #ffffff !important; font-weight: bold; text-decoration: none; padding: 12px 30px; border-radius: 10px; margin: 20px 0; text-align: center; box-shadow: 0 4px 10px rgba(226, 19, 110, 0.2); }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="header">
          <h1>${title} 🌸</h1>
        </div>
        <div class="content">
          ${bodyContent}
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} Bunon Fabrics. All rights reserved.</p>
          <p>60 Lake Circus Rd, Kalabagan, Dhaka. | Hotline: 09611900606</p>
          <p>আপনি যদি প্রমোশনাল মেইল পেতে না চান, তবে <a href="${unsubscribeUrl}" target="_blank">এখানে ক্লিক করে আনসাবস্ক্রাইব করুন</a>।</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Sends order received confirmation email
 */
export async function sendOrderConfirmationEmail(toEmail: string, orderData: any) {
  try {
    const productsHtml = (orderData.items || []).map((item: any) => {
      let imgUrl = (item.images && item.images[0] && item.images[0].src) ? item.images[0].src : (item.thumbnail || '/assets/images/woocommerce-placeholder-300x300.webp');
      if (imgUrl.startsWith('/')) {
        imgUrl = `https://bunon.shop${imgUrl.startsWith('//') ? imgUrl.substring(1) : imgUrl}`;
      }
      return `
      <tr style="border-bottom: 1px solid #f3f4f6;">
        <td style="padding: 10px 0; font-weight: 600; display: flex; align-items: center; gap: 10px;">
          <img src="${imgUrl}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 6px; border: 1px solid #eaeaea;" alt="${item.name}">
          <span>${item.name}</span>
        </td>
        <td style="padding: 10px 0; text-align: center;">${item.quantity}টি</td>
        <td style="padding: 10px 0; text-align: right; font-weight: 700;">৳${item.price}</td>
      </tr>
      `;
    }).join('');

    const bodyContent = `
      <p>আসসালামু আলাইকুম <strong>${orderData.firstName || 'সম্মানিত গ্রাহক'}</strong>,</p>
      <p>বুনন ফেব্রিক্স-এ আপনার অর্ডারটি সফলভাবে গৃহীত হয়েছে! নিচে আপনার অর্ডারের সংক্ষিপ্ত বিবরণ দেওয়া হলো:</p>
      
      ${orderData.autoPassword ? `
      <div style="background-color: #e8f5e9; border-left: 4px solid #4caf50; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <h3 style="margin-top: 0; color: #2e7d32;">🎉 আপনার অ্যাকাউন্ট তৈরি হয়েছে!</h3>
        <p style="margin: 0;">আপনার সুবিধার্থে আমরা একটি অ্যাকাউন্ট তৈরি করেছি। এখন থেকে আপনি সহজেই অর্ডার ট্র্যাক করতে পারবেন এবং স্পেশাল ডিসকাউন্ট পাবেন।</p>
        <ul style="margin: 10px 0 0 0;">
          <li><strong>User ID (Phone):</strong> ${orderData.phone.replace(/\D/g, '')}</li>
          <li><strong>Password:</strong> ${orderData.autoPassword}</li>
        </ul>
        <p style="margin-top: 10px; font-size: 14px;"><a href="https://bunon.shop/login" style="color: #e2136e; font-weight: bold;">এখানে লগইন করুন</a></p>
      </div>
      ` : ''}

      <div style="background-color: #f9fafb; border-radius: 12px; padding: 20px; margin: 20px 0;">
        <p style="margin: 0 0 10px 0;"><strong>অর্ডার নম্বর:</strong> #${orderData.orderId || Math.floor(100000 + Math.random() * 900000)}</p>
        <p style="margin: 0 0 10px 0;"><strong>পেমেন্ট মেথড:</strong> ${orderData.paymentMethod === 'cod' ? 'Cash on Delivery (ক্যাশ অন ডেলিভারি)' : 'Online Payment (অনলাইন পেমেন্ট)'}</p>
        <p style="margin: 0;"><strong>ডেলিভারি ঠিকানা:</strong> ${orderData.address1}, ${orderData.district}</p>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <thead>
          <tr style="border-bottom: 2px solid #f3f4f6; color: #9ca3af; font-size: 12px; text-transform: uppercase;">
            <th style="text-align: left; padding-bottom: 10px;">প্রোডাক্ট</th>
            <th style="text-align: center; padding-bottom: 10px;">পরিমাণ</th>
            <th style="text-align: right; padding-bottom: 10px;">মূল্য</th>
          </tr>
        </thead>
        <tbody>
          ${productsHtml}
          <tr>
            <td colspan="2" style="padding: 15px 0 5px 0; font-weight: bold; text-align: right;">সাবটোটাল:</td>
            <td style="padding: 15px 0 5px 0; font-weight: bold; text-align: right;">৳${orderData.subtotal}</td>
          </tr>
          <tr>
            <td colspan="2" style="padding: 5px 0; font-weight: bold; text-align: right;">ডেলিভারি চার্জ:</td>
            <td style="padding: 5px 0; font-weight: bold; text-align: right;">৳${orderData.shippingCost}</td>
          </tr>
          ${orderData.discount > 0 ? `
          <tr style="color: #e2136e;">
            <td colspan="2" style="padding: 5px 0; font-weight: bold; text-align: right;">ডিসকাউন্ট:</td>
            <td style="padding: 5px 0; font-weight: bold; text-align: right;">- ৳${orderData.discount}</td>
          </tr>` : ''}
          <tr style="font-size: 18px; font-weight: bold;">
            <td colspan="2" style="padding: 15px 0; border-top: 2px solid #f3f4f6; text-align: right;">সর্বমোট:</td>
            <td style="padding: 15px 0; border-top: 2px solid #f3f4f6; text-align: right; color: #e2136e;">৳${orderData.total}</td>
          </tr>
        </tbody>
      </table>

      <p style="text-align: center;">বুনন ফেব্রিক্স-এর পাশে থাকার জন্য আপনাকে আন্তরিক ধন্যবাদ। যেকোনো প্রয়োজনে কল করুন আমাদের হটলাইনে: <strong>09611900606</strong>।</p>
    `;

    const html = wrapHtmlBody('আপনার অর্ডারটি সফল হয়েছে!', bodyContent, toEmail);

    await mailTransporter.sendMail({
      from: '"Bunon Fabrics" <admin@bunonfabrics.com>',
      to: toEmail,
      subject: `বুনন ফেব্রিক্স: অর্ডার সফলভাবে গৃহীত হয়েছে! #${orderData.orderId || ''}`,
      html: html,
      text: `আসসালামু আলাইকুম ${orderData.firstName || 'সম্মানিত গ্রাহক'}, বুনন ফেব্রিক্সে আপনার অর্ডারটি সফলভাবে গৃহীত হয়েছে। সর্বমোট মূল্য: ৳${orderData.total}`,
      headers: {
        'List-Unsubscribe': `<https://bunon.shop/api/unsubscribe?email=${encodeURIComponent(toEmail)}>`
      }
    });

    // Also auto subscribe them to marketing emails if they place an order
    await productDbPool.execute(
      `INSERT INTO wc_marketing_emails (email, phone, name, status) 
       VALUES (?, ?, ?, 'subscribed') 
       ON DUPLICATE KEY UPDATE status='subscribed', name=?`,
      [toEmail, orderData.phone, orderData.firstName, orderData.firstName]
    );

    await productDbPool.execute(
      `INSERT INTO bf_email_logs (order_id, recipient_email, email_type, status) VALUES (?, ?, 'order_confirmation', 'sent')`,
      [orderData.orderId, toEmail]
    );

    console.log(`[Email] Order confirmation sent successfully to ${toEmail}`);
  } catch (err: any) {
    console.error('[Email] Failed to send order confirmation:', err.message);
    try {
      await productDbPool.execute(
        `INSERT INTO bf_email_logs (order_id, recipient_email, email_type, status, error_message) VALUES (?, ?, 'order_confirmation', 'failed', ?)`,
        [orderData.orderId || null, toEmail, err.message]
      );
    } catch (dbErr) {
      // Ignore inner db error
    }
  }
}

/**
 * Sends recovery email with dynamic discount coupons (5% to 20%)
 */
export async function sendCartRecoveryEmail(email: string, phone: string, name: string, cartItems: any[], discountPercent: number) {
  if (email && email.endsWith('@bunon.shop')) {
    console.log(`[Email] Skip recovery mail for ${email} because it is a placeholder.`);
    return;
  }
  try {
    // Check if user is unsubscribed
    const [subscriber]: any = await productDbPool.execute('SELECT status FROM wc_marketing_emails WHERE email = ?', [email]);
    if (subscriber && subscriber[0]?.status === 'unsubscribed') {
      console.log(`[Email] Skip recovery mail for ${email} because they are unsubscribed.`);
      return;
    }

    const firstProduct = cartItems[0];
    const generatedCoupon = `RECOVER${discountPercent}`;

    // Construct checkout restoration query parameters
    const cartParam = encodeURIComponent(JSON.stringify(cartItems.map(item => ({
      id: item.product_id || item.id,
      quantity: item.quantity,
      selectedVariation: item.selectedVariation || null
    }))));
    const magicCheckoutLink = `https://bunon.shop/checkout?restore_cart=${cartParam}&coupon=${generatedCoupon}`;

    const abandonedItemsHtml = cartItems.slice(0, 3).map((item: any) => {
      let imgUrl = (item.images && item.images[0] && item.images[0].src) ? item.images[0].src : (item.thumbnail || '/assets/images/woocommerce-placeholder-300x300.webp');
      if (imgUrl.startsWith('/')) {
        imgUrl = `https://bunon.shop${imgUrl.startsWith('//') ? imgUrl.substring(1) : imgUrl}`;
      }
      return `
        <div style="display: inline-block; margin: 5px; text-align: center;">
          <img src="${imgUrl}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 8px; border: 1px solid #eaeaea;" alt="${item.name}">
          <p style="font-size: 10px; color: #6b7280; margin-top: 5px; max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.name}</p>
        </div>
      `;
    }).join('');

    const bodyContent = `
      <p>আসসালামু আলাইকুম <strong>${name || 'প্রিয় গ্রাহক'}</strong>,</p>
      <p>আপনার পছন্দের নিচের প্রোডাক্টগুলো এখনো আপনার শপিং কার্টে অপেক্ষারত রয়েছে। অর্ডারটি শেষ করতে পারেননি কোনো কারণে?</p>
      
      <div style="text-align: center; margin: 20px 0;">
        ${abandonedItemsHtml}
        ${cartItems.length > 3 ? `<p style="font-size: 12px; color: #9ca3af;">এবং আরও ${cartItems.length - 3}টি আইটেম...</p>` : ''}
      </div>
      
      <p>আপনাকে সাহায্য করতে বুনন ফেব্রিক্স দিচ্ছে <strong>ফ্ল্যাট ${discountPercent}% ডিসকাউন্ট কুপন!</strong> অফারটি সীমিত সময়ের জন্য প্রযোজ্য।</p>
      
      <div style="background: #fff5f8; border: 1.5px dashed #e2136e; padding: 20px; border-radius: 12px; text-align: center; margin: 25px 0;">
        <span style="font-size: 13px; color: #6b7280; text-transform: uppercase; font-weight: bold; letter-spacing: 1px;">আপনার বিশেষ ডিসকাউন্ট কোড</span>
        <h2 style="font-size: 32px; color: #e2136e; margin: 10px 0; font-family: monospace; font-weight: 800;">${generatedCoupon}</h2>
        <p style="margin: 0; font-size: 13px; color: #9ca3af;">(চেকআউট পেজে কোডটি ব্যবহার করুন অথবা নিচের লিংকে ক্লিক করুন)</p>
      </div>

      <div style="text-align: center;">
        <a href="${magicCheckoutLink}" class="btn" style="color: white !important;">অফারে অর্ডারটি সম্পন্ন করুন ⚡</a>
      </div>

      <p style="font-size: 13px; color: #6b7280; margin-top: 20px;">* এই লিঙ্কটিতে ক্লিক করলে আপনার পছন্দের কার্ট আইটেমগুলো কুপনসহ সরাসরি রিকভার হবে।</p>
    `;

    const html = wrapHtmlBody(`আপনার জন্য ${discountPercent}% বিশেষ ডিসকাউন্ট অফার!`, bodyContent, email);

    await mailTransporter.sendMail({
      from: '"Bunon Fabrics" <admin@bunonfabrics.com>',
      to: email,
      subject: `বুনন ফেব্রিক্স: আপনার জন্য বিশেষ ${discountPercent}% ডিসকাউন্ট উপহার! 🎁`,
      html: html,
      text: `আসসালামু আলাইকুম ${name}, আপনার শপিং কার্টের আইটেমগুলো নিয়ে অফারে সহজে অর্ডার সম্পন্ন করুন। কুপন কোড: ${generatedCoupon}`,
      headers: {
        'List-Unsubscribe': `<https://bunon.shop/api/unsubscribe?email=${encodeURIComponent(email)}>`
      }
    });

    console.log(`[Email] Recovery email sent successfully to ${email} with ${discountPercent}% discount`);
  } catch (err: any) {
    console.error('[Email] Failed to send cart recovery email:', err.message);
  }
}

/**
 * Sends daily showcases/promotions newsletter autonomously
 */
export async function sendDailyNewsletter() {
  try {
    // 1. Fetch active subscribers
    const [subscribers]: any = await productDbPool.execute("SELECT email, name FROM wc_marketing_emails WHERE status = 'subscribed'");
    if (!subscribers || subscribers.length === 0) return;

    // 2. Select 3 random hot products from local catalog
    const products = await getCachedProducts();
    if (!products || products.length === 0) return;

    // Shuffle and pick 3 products
    const shuffled = [...products].sort(() => 0.5 - Math.random());
    const selectedProducts = shuffled.slice(0, 3);

    for (const sub of subscribers) {
      const email = sub.email;
      const name = sub.name || 'সম্মানিত গ্রাহক';

      const productsHtml = selectedProducts.map((p: any) => {
        let imgUrl = p.thumbnail || '/assets/images/woocommerce-placeholder-300x300.webp';
        if (imgUrl.startsWith('/')) {
          imgUrl = `https://bunon.shop${imgUrl.startsWith('//') ? imgUrl.substring(1) : imgUrl}`;
        }
        return `
        <div style="border: 1px solid #f3f4f6; border-radius: 12px; overflow: hidden; margin-bottom: 20px; background-color: white;">
          <img src="${imgUrl}" style="width: 100%; max-height: 250px; object-cover: fit;" alt="${p.name}" />
          <div style="padding: 15px;">
            <h4 style="margin: 0 0 8px 0; font-size: 16px; color: #1f2937;">${p.name}</h4>
            <p style="margin: 0 0 12px 0; color: #e2136e; font-size: 18px; font-weight: bold;">মূল্য: ৳${p.price}</p>
            <a href="https://bunon.shop/product/${p.id}" style="display: inline-block; background-color: #1f2937; color: white !important; padding: 8px 18px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: bold;">বিস্তারিত দেখুন</a>
          </div>
        </div>
      `;
      }).join('');

      const bodyContent = `
        <p>আসসালামু আলাইকুম <strong>${name}</strong>,</p>
        <p>বুনন ফেব্রিক্স-এর আজকের স্পেশাল কালেকশন ও ট্রেন্ডিং প্রোডাক্টগুলো একনজরে দেখে নিন। স্টক শেষ হওয়ার আগেই অর্ডার করুন!</p>
        
        <div style="margin: 25px 0;">
          ${productsHtml}
        </div>

        <p style="text-align: center;">আজই ভিজিট করুন আমাদের ওয়েবসাইট এবং উপভোগ করুন প্রিমিয়াম শপিং অভিজ্ঞতা।</p>
      `;

      const html = wrapHtmlBody('আজকের হট কালেকশন সমূহ!', bodyContent, email);

      await mailTransporter.sendMail({
        from: '"Bunon Fabrics" <admin@bunonfabrics.com>',
        to: email,
        subject: `বুনন ফেব্রিক্স: আজকের বিশেষ ধামাকা কালেকশন! 🛍️`,
        html: html,
        text: `আসসালামু আলাইকুম ${name}, বুনন ফেব্রিক্সের আজকের বিশেষ ট্রেন্ডিং প্রোডাক্টগুলো দেখুন।`
      });
    }

    console.log(`[Email] Autonomous daily newsletter sent successfully to ${subscribers.length} subscribers.`);
  } catch (err: any) {
    console.error('[Email] Failed to process daily newsletter campaign:', err.message);
  }
}

/**
 * Sends welcome email to new subscribers
 */
export async function sendWelcomeEmail(email: string) {
  try {
    const generatedCoupon = 'WELCOME10';
    const bodyContent = `
      <p>আসসালামু আলাইকুম,</p>
      <p>বুনন ফেব্রিক্স-এর নিউজলেটার সাবস্ক্রাইব করার জন্য আপনাকে অসংখ্য ধন্যবাদ! আপনার জন্য রইল আমাদের পক্ষ থেকে একটি ছোট্ট উপহার।</p>
      
      <div style="background: #fff5f8; border: 1.5px dashed #e2136e; padding: 20px; border-radius: 12px; text-align: center; margin: 25px 0;">
        <span style="font-size: 13px; color: #6b7280; text-transform: uppercase; font-weight: bold; letter-spacing: 1px;">আপনার প্রথম অর্ডারের জন্য ১০% ডিসকাউন্ট কোড</span>
        <h2 style="font-size: 32px; color: #e2136e; margin: 10px 0; font-family: monospace; font-weight: 800;">${generatedCoupon}</h2>
        <p style="margin: 0; font-size: 13px; color: #9ca3af;">(চেকআউট পেজে কোডটি ব্যবহার করুন)</p>
      </div>

      <div style="text-align: center;">
        <a href="https://bunon.shop/shop" class="btn" style="color: white !important;">শপিং শুরু করুন</a>
      </div>
    `;

    const html = wrapHtmlBody('বুনন ফেব্রিক্স-এ আপনাকে স্বাগতম! 🎉', bodyContent, email);

    await mailTransporter.sendMail({
      from: '"Bunon Fabrics" <admin@bunonfabrics.com>',
      to: email,
      subject: `বুনন ফেব্রিক্সে আপনাকে স্বাগতম! আপনার জন্য ১০% ছাড়ের উপহার! 🎁`,
      html: html,
      text: `আসসালামু আলাইকুম, বুনন ফেব্রিক্সে আপনাকে স্বাগতম! আপনার প্রথম অর্ডারের জন্য ১০% ডিসকাউন্ট কোড: ${generatedCoupon}`,
      headers: {
        'List-Unsubscribe': `<https://bunon.shop/api/unsubscribe?email=${encodeURIComponent(email)}>`
      }
    });

    console.log(`[Email] Welcome email sent successfully to ${email}`);
  } catch (err: any) {
    console.error('[Email] Failed to send welcome email:', err.message);
  }
}
