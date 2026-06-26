import { wpDbPool } from '../db';
import { mailTransporter } from './email';

/**
 * Standard Wrapper for Marketing Emails
 */
function wrapMarketingHtml(title: string, bodyContent: string, email: string): string {
  const unsubscribeUrl = `https://bunon.shop/api/unsubscribe?email=${encodeURIComponent(email)}`;
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
    </head>
    <body style="font-family: Arial, sans-serif; background-color: #ffffff; color: #333; margin: 0; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: #fff;">
        <h2 style="color: #e2136e; border-bottom: 2px solid #f3f4f6; padding-bottom: 10px;">${title}</h2>
        <div style="font-size: 15px; line-height: 1.6;">
          ${bodyContent}
        </div>
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #999;">
          <p>This email was sent to ${email} because you are subscribed to Bunon Fabrics.</p>
          <p><a href="${unsubscribeUrl}" style="color: #e2136e;">Unsubscribe here</a></p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Sends a daily product promotion email to subscribed users
 */
export async function sendDailyNewsletter() {
  console.log('[CRON] Starting Daily Promotions Campaign...');
  
  try {
    // Get all subscribed users (from marketing table OR users table, but marketing is safe)
    const [subscribers]: any = await wpDbPool.execute(
      `SELECT email, name FROM wc_marketing_emails WHERE status = 'subscribed'`
    );

    if (!subscribers || subscribers.length === 0) {
      console.log('[CRON] No subscribers found for daily newsletter.');
      return;
    }

    // Instead of complex DB querying, let's fetch a dummy product or generic promotion for now.
    // In the future, this can dynamically pick an item from ramDatabase
    const offerSubject = "আজকের স্পেশাল অফার! ✨";
    
    for (const sub of subscribers) {
      const email = sub.email;
      const name = sub.name || 'সম্মানিত গ্রাহক';

      const content = `
        <p>আসসালামু আলাইকুম ${name},</p>
        <p>কেমন আছেন? বুনন ফেব্রিক্স-এর পক্ষ থেকে আপনাকে শুভেচ্ছা!</p>
        <p>আজকের দিনে আমাদের ওয়েবসাইটে চলছে একটি স্পেশাল ফ্ল্যাশ সেল। নতুন কিছু দারুণ কালেকশন অ্যাড হয়েছে, যেগুলো খুব দ্রুত শেষ হয়ে যাচ্ছে।</p>
        <p>নিচের লিংকে ক্লিক করে নতুন কালেকশনগুলো দেখে আসুন এবং আপনার পছন্দের ড্রেসটি লুফে নিন।</p>
        <p><a href="https://bunon.shop/shop" style="display: inline-block; background: #e2136e; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">Shop Now</a></p>
        <br/>
        <p>ধন্যবাদ,<br/><strong>বুনন ফেব্রিক্স টিম</strong></p>
      `;

      const html = wrapMarketingHtml(offerSubject, content, email);

      try {
        await mailTransporter.sendMail({
          from: '"Bunon Fabrics" <admin@bunonfabrics.com>',
          to: email,
          subject: offerSubject,
          html: html,
        });
      } catch (err: any) {
        console.error(`[CRON] Failed to send newsletter to ${email}:`, err.message);
      }

      // Small delay to prevent spamming the SMTP server
      await new Promise(res => setTimeout(res, 2000));
    }

    console.log(`[CRON] Daily Promotions Campaign Finished. Sent to ${subscribers.length} users.`);
  } catch (error: any) {
    console.error('[CRON] Error in Daily Promotions Campaign:', error.message);
  }
}
