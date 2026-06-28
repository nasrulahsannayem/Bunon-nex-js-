import express from "express";
import { productDbPool } from "../db";

const router = express.Router();

// Get unsubscribe page
router.get("/unsubscribe", async (req, res) => {
  const email = req.query.email ? String(req.query.email) : "";

  if (!email) {
    return res.status(400).send("<h1>ভুল রিকোয়েস্ট</h1><p>দয়া করে সঠিক ইমেইল আইডি দিন।</p>");
  }

  try {
    // 1. Opt out from marketing list
    await productDbPool.execute(
      `UPDATE wc_marketing_emails SET status = 'unsubscribed' WHERE email = ?`,
      [email]
    );

    // 2. Also opt out from recovery campaigns
    await productDbPool.execute(
      `UPDATE wc_cart_recovery_queue SET status = 'cancelled' WHERE email = ?`,
      [email]
    );

    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>আনসাবস্ক্রাইব সফল হয়েছে</title>
        <style>
          body { font-family: sans-serif; text-align: center; padding: 50px; background-color: #f9fafb; color: #1f2937; }
          .card { max-width: 500px; margin: auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
          h1 { color: #e2136e; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>আনসাবস্ক্রাইব সফল হয়েছে 🌸</h1>
          <p>আপনার ইমেইল আইডি <strong>${email}</strong> সফলভাবে আমাদের মেইলিং লিস্ট থেকে বাদ দেওয়া হয়েছে।</p>
          <p>বুনন ফেব্রিক্স-এর সাথে থাকার জন্য ধন্যবাদ।</p>
          <hr style="border:0; border-top: 1px solid #f3f4f6; margin: 20px 0;">
          <a href="https://bunon.shop" style="color: #e2136e; text-decoration: none; font-weight: bold;">ওয়েবসাইটে ফিরে যান</a>
        </div>
      </body>
      </html>
    `);
  } catch (error: any) {
    return res.status(500).send(`<h1>ত্রুটি ঘটেছে</h1><p>${error.message}</p>`);
  }
});

// 🧪 TEST MARKETING EMAIL FLOWS
router.get("/test-marketing-emails", async (req, res) => {
  const targetEmail = req.query.email ? String(req.query.email) : "nasrul8879@gmail.com";

  try {
    const { sendOrderConfirmationEmail, sendCartRecoveryEmail } = await import("../services/email");
    const { getCachedProducts } = await import("../services/redisClient");

    // 1. Send Order Confirmation Email Test
    console.log(`[Test-Mail] Triggering order confirmation test to ${targetEmail}`);
    await sendOrderConfirmationEmail(targetEmail, {
      orderId: 994821,
      firstName: "Nasrul",
      phone: "01700000000",
      address1: "House 24, Road 5, Kalabagan",
      district: "Dhaka",
      subtotal: 1250,
      shippingCost: 80,
      discount: 100,
      total: 1230,
      paymentMethod: "bkash",
      items: [
        { name: "Premium Cotton Printed Saree", quantity: 1, price: 1250, thumbnail: "/assets/images/couple-dress.webp" }
      ]
    });

    // 2. Send Cart Recovery Email Test
    console.log(`[Test-Mail] Triggering cart recovery test to ${targetEmail}`);
    await sendCartRecoveryEmail(
      targetEmail,
      "01700000000",
      "Nasrul",
      [
        { id: 101, name: "Traditional Silk Saree", price: 2450, quantity: 1, thumbnail: "/assets/images/saree.jpg" }
      ],
      15 // 15% discount coupon
    );

    // 3. Send Daily Newsletter Test
    console.log(`[Test-Mail] Triggering daily showcase newsletter test to ${targetEmail}`);
    const products = (await getCachedProducts()) || [];
    const selectedProducts = products.slice(0, 2); // Pick first 2 items

    const productsHtml = selectedProducts.map((p: any) => `
      <div style="border: 1px solid #f3f4f6; border-radius: 12px; overflow: hidden; margin-bottom: 20px; background-color: white;">
        <img src="${p.thumbnail}" style="width: 100%; max-height: 250px; object-cover: fit;" alt="${p.name}" />
        <div style="padding: 15px;">
          <h4 style="margin: 0 0 8px 0; font-size: 16px; color: #1f2937;">${p.name}</h4>
          <p style="margin: 0 0 12px 0; color: #e2136e; font-size: 18px; font-weight: bold;">মূল্য: ৳${p.price}</p>
          <a href="https://bunon.shop/product/${p.id}" style="display: inline-block; background-color: #1f2937; color: white !important; padding: 8px 18px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: bold;">বিস্তারিত দেখুন</a>
        </div>
      </div>
    `).join('');

    const unsubscribeUrl = `https://bunon.shop/api/unsubscribe?email=${encodeURIComponent(targetEmail)}`;
    const newsletterContent = `
      <p>আসসালামু আলাইকুম <strong>Nasrul</strong>,</p>
      <p>বুনন ফেব্রিক্স-এর আজকের বিশেষ ধামাকা কালেকশন ও ট্রেন্ডিং প্রোডাক্টগুলো একনজরে দেখে নিন। স্টক শেষ হওয়ার আগেই অর্ডার করুন!</p>
      <div style="margin: 25px 0;">
        ${productsHtml.length > 0 ? productsHtml : '<p>কোনো প্রোডাক্ট পাওয়া যায়নি</p>'}
      </div>
      <p style="text-align: center;">আজই ভিজিট করুন আমাদের ওয়েবসাইট এবং উপভোগ করুন প্রিমিয়াম শপিং অভিজ্ঞতা।</p>
    `;

    const { mailTransporter } = await import("../services/email");
    const wrapHtmlBody = (title: string, bodyContent: string) => `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: sans-serif; background-color: #f9fafb; margin: 0; padding: 0; color: #1f2937; }
          .wrapper { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #f3f4f6; overflow: hidden; }
          .header { background: linear-gradient(135deg, #e2136e 0%, #ff4081 100%); padding: 30px; text-align: center; color: white; }
          .content { padding: 30px; line-height: 1.6; }
          .footer { background-color: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #9ca3af; }
          .footer a { color: #e2136e; text-decoration: none; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <div class="header"><h1>আজকের বিশেষ কালেকশন! 🌸</h1></div>
          <div class="content">${bodyContent}</div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Bunon Fabrics. All rights reserved.</p>
            <p>আমাদের মেইল পেতে না চাইলে <a href="${unsubscribeUrl}" target="_blank">এখানে ক্লিক করে আনসাবস্ক্রাইব করুন</a></p>
          </div>
        </div>
      </body>
      </html>
    `;

    await mailTransporter.sendMail({
      from: '"Bunon Fabrics" <admin@bunonfabrics.com>',
      to: targetEmail,
      subject: `বুনন ফেব্রিক্স: আজকের বিশেষ ধামাকা কালেকশন! 🛍️`,
      html: wrapHtmlBody('আজকের বিশেষ কালেকশন!', newsletterContent)
    });

    return res.json({ ok: true, message: `Successfully sent 3 marketing test emails to ${targetEmail}!` });
  } catch (error: any) {
    console.error("Test email sending failed:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});
// Subscribe to Newsletter
router.post("/subscribe", async (req, res) => {
  const { email } = req.body;
  
  if (!email || !email.includes('@')) {
    return res.status(400).json({ ok: false, message: "Valid email is required" });
  }

  try {
    // Upsert into wc_marketing_emails
    await productDbPool.execute(
      `INSERT INTO wc_marketing_emails (email, name, status) 
       VALUES (?, 'Subscriber', 'subscribed') 
       ON DUPLICATE KEY UPDATE status='subscribed'`,
      [email]
    );

    // Send the welcome email with 10% discount
    const { sendWelcomeEmail } = await import("../services/email");
    await sendWelcomeEmail(email);

    return res.json({ ok: true, message: "Successfully subscribed!" });
  } catch (error: any) {
    console.error("Subscription failed:", error);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

export default router;
