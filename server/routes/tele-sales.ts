import express from 'express';

const router = express.Router();

router.post('/tele-sales', async (req, res) => {
    try {
        const { fullName, phone, age, area, experience, fullTime, appId } = req.body;
        
        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const TELEGRAM_CHAT_ID = process.env.TELEGRAM_RECRUITMENT_CHANNEL_ID; 

        if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
            console.error("Missing Telegram config in .env file. Please check TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID");
            return res.status(500).json({ error: "Telegram config missing" });
        }

        const message = `🚀 *New Tele-Sales Application!*\n\n` +
                        `*App ID:* \`${appId}\`\n` +
                        `*Name:* ${fullName}\n` +
                        `*Phone:* ${phone}\n` +
                        `*Age:* ${age}\n` +
                        `*Area:* ${area}\n` +
                        `*Experience:* ${experience}\n` +
                        `*Full-Time:* ${fullTime === 'yes' ? '✅ Yes' : '❌ No'}`;

        const tgUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        const tgRes = await fetch(tgUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'Markdown'
            })
        });

        const tgData = await tgRes.json();
        
        if (!tgRes.ok) {
            console.error("Telegram API Failed:", tgData);
            throw new Error("Telegram API Error");
        }

        res.json({ success: true, appId });
    } catch (error) {
        console.error("Recruitment Webhook Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

export default router;
