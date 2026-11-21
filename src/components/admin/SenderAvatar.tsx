/**
 * Sender identity chip for the conversation thread: avatar when the channel
 * gave us one, otherwise the Bengali initial.
 *
 * Facebook will not return a customer profile without the
 * `pages_read_engagement` permission on the connected token, so most FB
 * senders legitimately have no photo. Showing a grey lettered circle instead
 * of a broken image keeps the thread readable and looks intentional rather
 * than broken.
 *
 * Every avatar URL also goes through the app's image proxy: FB CDN links are
 * signed and expire, and WhatsApp media lives on a sibling vhost, neither of
 * which the browser will load directly.
 */

import { useEffect, useState } from 'react';

type Props = {
  name?: string | null;
  avatarUrl?: string | null;
  platform?: string;
  size?: number;
  className?: string;
};

/** Same-origin route so signed/cross-host URLs still load. */
function viaProxy(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === 'dash.bunonfabrics.com') {
      return '/api/image-proxy?url=' + encodeURIComponent(url);
    }
  } catch { return url; }
  return url;
}

/** First grapheme of the name, so a Bengali name shows a Bengali letter. */
function initial(name?: string | null): string {
  const n = (name || '').trim();
  if (!n) return '?';
  const cp = Array.from(n)[0];
  return cp ? cp.toUpperCase() : '?';
}

/** Stable colour per identity so the same person keeps the same tint. */
function hueFor(name?: string | null, platform?: string): number {
  const key = (name || '') + '|' + (platform || '');
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360;
  return h;
}

const RING: Record<string, string> = {
  facebook: 'ring-blue-200',
  instagram: 'ring-pink-200',
  whatsapp: 'ring-emerald-200',
  tiktok: 'ring-slate-300',
};

export function SenderAvatar({ name, avatarUrl, platform, size = 32, className = '' }: Props) {
  const [src, setSrc] = useState<string | null>(avatarUrl ? viaProxy(avatarUrl) : null);
  const [broke, setBroke] = useState(false);

  useEffect(() => {
    setSrc(avatarUrl ? viaProxy(avatarUrl) : null);
    setBroke(false);
  }, [avatarUrl]);

  const dim = { width: size, height: size };

  if (src && !broke) {
    return (
      <img
        src={src}
        alt={name || 'প্রোফাইল'}
        style={dim}
        loading="lazy"
        decoding="async"
        onError={() => setBroke(true)}
        className={`shrink-0 rounded-full object-cover ring-1 ${RING[platform || ''] || 'ring-slate-200'} ${className}`}
      />
    );
  }

  // fallback: the first letter on a colour derived from the name
  const hue = hueFor(name, platform);
  return (
    <span
      style={{
        ...dim,
        background: `hsl(${hue} 62% 92%)`,
        color: `hsl(${hue} 55% 30%)`,
        fontSize: Math.max(11, Math.round(size * 0.42)),
      }}
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full font-bold ring-1 ${RING[platform || ''] || 'ring-slate-200'} ${className}`}
    >
      {initial(name)}
    </span>
  );
}