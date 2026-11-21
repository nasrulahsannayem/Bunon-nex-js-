/**
 * Icon set for the inbox — real inline SVG instead of emoji.
 *
 * Emoji looked inconsistent next to the outline icons used everywhere else
 * and rendered differently per platform; these are deterministic, inherit
 * currentColor, and can be sized/stroked to match the rest of the UI.
 *
 * Channel marks are simplified, legally-safe glyphs, not Meta's trademarks.
 */
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;

/**
 * Accept `size` (the convention used by lucide, already used at every call
 * site in InboxPage) and derive width/height from it, while still honouring
 * an explicit width/height if one is passed.
 */
type IconProps = P & { size?: number };

const base = ({ size, width, height, ...p }: IconProps) => ({
  width: width ?? size ?? 16,
  height: height ?? size ?? 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...p,
});

/* ── channels ─────────────────────────────────────────────────────────── */

export const FacebookIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);

export const InstagramIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="2" y="2" width="20" height="20" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export const WhatsAppIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    <path d="M8.5 9.5c0 3 2.5 5.5 5.5 5.5" />
  </svg>
);

export const TikTokIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M16 3c.4 2.1 1.8 3.5 4 3.8v3.1c-1.5 0-2.9-.4-4-1.2v6.4a5.6 5.6 0 1 1-5.6-5.6c.3 0 .6 0 .9.1v3.2a2.4 2.4 0 1 0 1.7 2.3V3z" />
  </svg>
);

export const MessengerIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 21l2.2-5.2A8.5 8.5 0 1 1 21 11.5z" />
    <path d="M8 10.5h8M8 14h5" />
  </svg>
);

export function ChannelIcon({ platform, ...p }: IconProps & { platform?: string }) {
  const k = String(platform || '').toLowerCase();
  if (k === 'facebook') return <FacebookIcon {...p} />;
  if (k === 'instagram') return <InstagramIcon {...p} />;
  if (k === 'whatsapp') return <WhatsAppIcon {...p} />;
  if (k === 'tiktok') return <TikTokIcon {...p} />;
  if (k === 'messenger') return <MessengerIcon {...p} />;
  return <MessengerIcon {...p} />;
}

/** Small solid status dot — replaces the 🟢 emoji. */
export const OnlineDot = (p: IconProps) => (
  <svg width={8} height={8} viewBox="0 0 8 8" aria-hidden {...p}>
    <circle cx="4" cy="4" r="4" fill="currentColor" />
  </svg>
);

/* ── commerce / product ───────────────────────────────────────────────── */

/** Replaces the 💰 emoji on product cards. */
export const PriceTagIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M20.6 13.4 12 22l-9-9V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" />
    <circle cx="7.5" cy="7.5" r="1.5" />
  </svg>
);

/** Replaces the 📦 / attachment emoji. */
export const PackageIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <path d="m3.3 7 8.7 5 8.7-5M12 22V12" />
  </svg>
);

/** Replaces the 🚚 emoji (delivery status). */
export const TruckIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M10 17V5H2v12h3M20 17h-2M14 17h1M7 17h3" />
    <path d="M14 8h4l3 3v6h-2M7 17h1" />
    <circle cx="6.5" cy="17.5" r="2" /><circle cx="17.5" cy="17.5" r="2" />
  </svg>
);

/** Replaces the 📸 emoji (image-only message). */
export const ImageIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="m21 15-5-5L5 21" />
  </svg>
);

/* ── inbox chrome ─────────────────────────────────────────────────────── */

export const InboxIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.5 5.5 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.5A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.5z" />
  </svg>
);

export const NoteIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 4h16v12l-4 4H4z" />
    <path d="M20 16h-4v4" />
  </svg>
);

export const ClockIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);