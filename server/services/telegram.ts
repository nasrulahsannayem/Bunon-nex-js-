// @ts-ignore - CJS default interop resolved by esbuild at bundle time
import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHANNEL_ID = process.env.TELEGRAM_RECRUITMENT_CHANNEL_ID;

let bot: TelegramBot | null = null;

function getBot(): TelegramBot {
  if (!bot) {
    if (!BOT_TOKEN) {
      throw new Error('TELEGRAM_BOT_TOKEN is not set in environment');
    }
    bot = new TelegramBot(BOT_TOKEN, { polling: false });
  }
  return bot;
}

export interface LeadData {
  fullName: string;
  phone: string;
  age: string;
  area: string;
  experience: string;
  fullTime: string;
  url?: string;
  appId?: string;
  submittedAt?: string;
}

export async function sendLeadToTelegram(lead: LeadData): Promise<boolean> {
  try {
    const b = getBot();
    
    const message = [
      '🔔 *নতুন আবেদন received*',
      '',
      `*Application ID:* \`${lead.appId || 'N/A'}\``,
      `*নাম:* ${lead.fullName}`,
      `*মোবাইল:* ${lead.phone}`,
      `*বয়স:* ${lead.age} বছর`,
      `*এলাকা:* ${lead.area}`,
      `*অভিজ্ঞতা:* ${lead.experience}`,
      `*Full-Time:* ${lead.fullTime === 'yes' ? 'হ্যাঁ' : 'না'}`,
      lead.url ? `*সোর্স:* ${lead.url}` : '',
      `*সময়:* ${lead.submittedAt || new Date().toISOString()}`,
    ].filter(Boolean).join('\n');

    const chatId = CHANNEL_ID || '-1003800514507';
    
    await b.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });
    
    console.log('[Telegram] Lead notification sent to channel:', chatId);
    return true;
  } catch (error: any) {
    console.error('[Telegram ERROR] Failed to send lead:', error.message);
    return false;
  }
}

export function logLeadToFile(lead: LeadData): void {
  try {
    const logDir = path.join(process.cwd(), 'server', 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    const logFile = path.join(logDir, 'recruitment_leads.json');
    const logs: LeadData[] = fs.existsSync(logFile)
      ? JSON.parse(fs.readFileSync(logFile, 'utf-8'))
      : [];
    
    logs.push({
      ...lead,
      submittedAt: lead.submittedAt || new Date().toISOString(),
    });
    
    fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
  } catch (error) {
    console.error('[Lead Log] Error writing to file:', error);
  }
}
