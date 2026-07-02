import { sendPushNotification } from './server/services/notification';

async function runTest() {
  console.log('🚀 Starting Web Push Notification Test...');
  const title = 'বুনন ফেব্রিক্স টেস্ট পুশ ⚡';
  const body = 'অভিনন্দন! আপনার ব্রাউজারে বুনন ফেব্রিক্স-এর পুশ নোটিফিকেশন সফলভাবে কাজ করছে।';
  const payload = {
    url: 'https://bunon.shop/shop'
  };

  try {
    await sendPushNotification(title, body, payload);
    console.log('✅ Test push broadcast command triggered successfully!');
  } catch (err: any) {
    console.error('❌ Failed to run test push:', err.message);
  }
}

runTest().then(() => {
  // Allow brief time for async broadcasts to log before exiting
  setTimeout(() => process.exit(0), 4000);
});
