import express from "express";
import { dbPool } from "../db";

const router = express.Router();

// Get unsubscribe page
router.get("/unsubscribe", async (req, res) => {
  const email = req.query.email ? String(req.query.email) : "";

  if (!email) {
    return res.status(400).send("<h1>ভুল রিকোয়েস্ট</h1><p>দয়া করে সঠিক ইমেইল আইডি দিন।</p>");
  }

  try {
    // 1. Opt out from marketing list
    await dbPool.execute(
      `UPDATE wc_marketing_emails SET status = 'unsubscribed' WHERE email = ?`,
      [email]
    );

    // 2. Also opt out from recovery campaigns
    await dbPool.execute(
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

export default router;
