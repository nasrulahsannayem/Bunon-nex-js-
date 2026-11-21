import fetch from 'node-fetch';

/**
 * Send a Telegram message to the admin channel when a payment succeeds.
 * Uses the bot token and chat id defined in the .env file.
 */
export async function tgPaymentNotify(orderId: number, method: string, amount: number, customerName?: string, phone?: string): Promise<boolean> {
  const botToken = process.env.PAYMENT_BOT_TOKEN || '';
  const chatId = process.env.PAYMENT_NOTIFY_CHAT_ID || '';
  if (!botToken || !chatId) {
    console.error('Telegram payment notify config missing');
    return false;
  }

  const text = `✅ *Payment Received*
Order ID: ${orderId}
Method: ${method}
Amount: ${amount}
Customer: ${customerName ?? 'N/A'}
Phone: ${phone ?? 'N/A'}`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
    const json = await res.json();
    if (!json.ok) {
      console.error('Telegram sendMessage failed', json);
      return false;
    }
    return true;
  } catch (e) {
    console.error('Telegram notification error', e);
    return false;
  }
}
