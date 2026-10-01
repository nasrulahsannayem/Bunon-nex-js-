import { productDbPool } from '../db';

// Central secret resolver: bunon_settings value wins, process.env fallback.
// Never logs or returns masked sentinels ('***').
// Bengali note: Settings UI থেকে কী থাকলে সেটাই ব্যবহৃত হবে, না থাকলে .env।
const KEY_TO_ENV: Record<string, string[]> = {
  hoorin_api_key: ['HOORIN_API_KEY'],
  steadfast_api_key: ['STEADFAST_API_KEY'],
  steadfast_secret_key: ['STEADFAST_SECRET_KEY'],
  steadfast_webhook_token: ['STEADFAST_WEBHOOK_TOKEN'],
  steadfast_webhook_secret: ['STEADFAST_WEBHOOK_SECRET', 'STEADFAST_WEBHOOK_TOKEN'],
  pathao_client_id: ['PATHAO_CLIENT_ID'],
  pathao_client_secret: ['PATHAO_CLIENT_SECRET'],
  pathao_access_token: ['PATHAO_ACCESS_TOKEN'],
  redx_api_token: ['REDX_API_TOKEN'],
  meta_pixel_id: ['VITE_META_PIXEL_ID', 'META_PIXEL_ID'],
  meta_capi_token: ['META_CAPI_TOKEN', 'META_CONVERSION_API_TOKEN'],
  meta_page_id: ['META_PAGE_ID'],
  meta_app_id: ['META_APP_ID'],
  meta_app_secret: ['META_APP_SECRET'],
  meta_oauth_redirect_uri: ['META_OAUTH_REDIRECT_URI'],
  bkash_username: ['BKASH_USERNAME'],
  bkash_password: ['BKASH_PASSWORD'],
  bkash_app_key: ['BKASH_APP_KEY'],
  bkash_app_secret: ['BKASH_APP_SECRET'],
};

const clean = (v: unknown): string =>
  typeof v === 'string' ? v.trim().replace(/"/g, '') : '';

export async function getSecret(key: string, extraEnv?: string[]): Promise<string> {
  try {
    const [rows]: any = await productDbPool.execute(
      'SELECT setting_value FROM bunon_settings WHERE setting_key = ? LIMIT 1',
      [key]
    );
    const v = clean(rows?.[0]?.setting_value);
    if (v && v !== '***') return v;
  } catch { /* table may not exist yet — fall through to env */ }
  const names = [...(extraEnv ?? []), ...(KEY_TO_ENV[key] ?? [])];
  for (const n of names) {
    const v = clean(process.env[n]);
    if (v) return v;
  }
  return '';
}

export function getSecretSync(key: string, extraEnv?: string[]): string {
  const names = [...(extraEnv ?? []), ...(KEY_TO_ENV[key] ?? [])];
  for (const n of names) {
    const v = clean(process.env[n]);
    if (v) return v;
  }
  return '';
}

export default getSecret;
