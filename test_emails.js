import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

const mailTransporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST || 'mail.bunonfabrics.com',
  port: Number(process.env.MAIL_PORT) || 465,
  secure: true,
  auth: {
    user: process.env.MAIL_USER || 'admin@bunonfabrics.com',
    pass: process.env.MAIL_PASS ? process.env.MAIL_PASS.replace(/"/g, '') : 'naim#707207AA'
  },
  tls: {
    rejectUnauthorized: false
  }
});

function wrapHtmlBody(title, bodyContent, email) {
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

async function runTests() {
  const email = 'nasrul8879@gmail.com';
  console.log(`Sending test emails to ${email}...`);

  // 1. Order Confirmation
  const orderBody = `
    <p>আসসালামু আলাইকুম <strong>Nasrul Ahsan</strong>,</p>
    <p>বুনন ফেব্রিক্স-এ আপনার অর্ডারটি সফলভাবে গৃহীত হয়েছে! নিচে আপনার অর্ডারের সংক্ষিপ্ত বিবরণ দেওয়া হলো:</p>
    <div style="background-color: #f9fafb; border-radius: 12px; padding: 20px; margin: 20px 0;">
      <p style="margin: 0 0 10px 0;"><strong>অর্ডার নম্বর:</strong> #998877</p>
      <p style="margin: 0 0 10px 0;"><strong>পেমেন্ট মেথড:</strong> Cash on Delivery (ক্যাশ অন ডেলিভারি)</p>
      <p style="margin: 0;"><strong>ডেলিভারি ঠিকানা:</strong> Mirpur 10, Dhaka</p>
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
        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 10px 0; font-weight: 600;">Premium Cotton Three Piece</td>
          <td style="padding: 10px 0; text-align: center;">1টি</td>
          <td style="padding: 10px 0; text-align: right; font-weight: 700;">৳1250</td>
        </tr>
        <tr style="font-size: 18px; font-weight: bold;">
          <td colspan="2" style="padding: 15px 0; border-top: 2px solid #f3f4f6; text-align: right;">সর্বমোট:</td>
          <td style="padding: 15px 0; border-top: 2px solid #f3f4f6; text-align: right; color: #e2136e;">৳1310</td>
        </tr>
      </tbody>
    </table>
    <p style="text-align: center;">বুনন ফেব্রিক্স-এর পাশে থাকার জন্য আপনাকে আন্তরিক ধন্যবাদ। যেকোনো প্রয়োজনে কল করুন আমাদের হটলাইনে: <strong>09611900606</strong>।</p>
  `;
  await mailTransporter.sendMail({
    from: '"Bunon Fabrics" <admin@bunonfabrics.com>',
    to: email,
    subject: `বুনন ফেব্রিক্স: অর্ডার সফলভাবে গৃহীত হয়েছে! #998877`,
    html: wrapHtmlBody('আপনার অর্ডারটি সফল হয়েছে!', orderBody, email)
  });
  console.log('✅ Order Confirmation sent.');

  // 2. Cart Recovery
  const discountPercent = 15;
  const generatedCoupon = 'RECOVER15';
  const recoveryBody = `
    <p>আসসালামু আলাইকুম <strong>Nasrul Ahsan</strong>,</p>
    <p>আপনার পছন্দের প্রিমিয়াম থ্রি-পিস বা ফেব্রিক্সগুলো এখনো আপনার শপিং কার্টে অপেক্ষারত রয়েছে। অর্ডারটি শেষ করতে পারেননি কোনো কারণে?</p>
    <p>আপনাকে সাহায্য করতে বুনন ফেব্রিক্স দিচ্ছে <strong>ফ্ল্যাট ${discountPercent}% ডিসকাউন্ট কুপন!</strong> অফারটি সীমিত সময়ের জন্য প্রযোজ্য।</p>
    <div style="background: #fff5f8; border: 1.5px dashed #e2136e; padding: 20px; border-radius: 12px; text-align: center; margin: 25px 0;">
      <span style="font-size: 13px; color: #6b7280; text-transform: uppercase; font-weight: bold; letter-spacing: 1px;">আপনার বিশেষ ডিসকাউন্ট কোড</span>
      <h2 style="font-size: 32px; color: #e2136e; margin: 10px 0; font-family: monospace; font-weight: 800;">${generatedCoupon}</h2>
      <p style="margin: 0; font-size: 13px; color: #9ca3af;">(চেকআউট পেজে কোডটি ব্যবহার করুন অথবা নিচের লিংকে ক্লিক করুন)</p>
    </div>
    <div style="text-align: center;">
      <a href="https://bunon.shop/checkout?coupon=${generatedCoupon}" class="btn" style="color: white !important;">অফারে অর্ডারটি সম্পন্ন করুন ⚡</a>
    </div>
    <p style="font-size: 13px; color: #6b7280; margin-top: 20px;">* এই লিঙ্কটিতে ক্লিক করলে আপনার পছন্দের কার্ট আইটেমগুলো কুপনসহ সরাসরি রিকভার হবে।</p>
  `;
  await mailTransporter.sendMail({
    from: '"Bunon Fabrics" <admin@bunonfabrics.com>',
    to: email,
    subject: `বুনন ফেব্রিক্স: আপনার জন্য বিশেষ ৳${discountPercent}% ডিসকাউন্ট উপহার! 🎁`,
    html: wrapHtmlBody(`আপনার জন্য ${discountPercent}% বিশেষ ডিসকাউন্ট অফার!`, recoveryBody, email)
  });
  console.log('✅ Cart Recovery sent.');

  // 3. Newsletter
  const promoBody = `
    <p>আসসালামু আলাইকুম <strong>Nasrul Ahsan</strong>,</p>
    <p>বুনন ফেব্রিক্স-এর আজকের স্পেশাল কালেকশন ও ট্রেন্ডিং প্রিমিয়াম সুতি থ্রি-পিস কালেকশনগুলো একনজরে দেখে নিন। স্টক শেষ হওয়ার আগেই অর্ডার করুন!</p>
    <div style="margin: 25px 0;">
      <div style="border: 1px solid #f3f4f6; border-radius: 12px; overflow: hidden; margin-bottom: 20px; background-color: white;">
        <div style="padding: 15px;">
          <h4 style="margin: 0 0 8px 0; font-size: 16px; color: #1f2937;">Exclusive Designer Three Piece</h4>
          <p style="margin: 0 0 12px 0; color: #e2136e; font-size: 18px; font-weight: bold;">মূল্য: ৳1450</p>
          <a href="https://bunon.shop/shop" style="display: inline-block; background-color: #1f2937; color: white !important; padding: 8px 18px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: bold;">বিস্তারিত দেখুন</a>
        </div>
      </div>
    </div>
    <p style="text-align: center;">আজই ভিজিট করুন আমাদের ওয়েবসাইট এবং উপভোগ করুন প্রিমিয়াম শপিং অভিজ্ঞতা।</p>
  `;
  await mailTransporter.sendMail({
    from: '"Bunon Fabrics" <admin@bunonfabrics.com>',
    to: email,
    subject: `বুনন ফেব্রিক্স: আজকের বিশেষ ধামাকা কালেকশন! 🛍️`,
    html: wrapHtmlBody('আজকের হট কালেকশন সমূহ!', promoBody, email)
  });
  console.log('✅ Daily Newsletter sent.');
  
  console.log('All emails sent successfully! Check your inbox.');
}

runTests().catch(console.error);
