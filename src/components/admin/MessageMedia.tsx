/**
 * Message media rendering for the conversation thread.
 *
 * The screenshots showed image messages as bubbles containing the literal
 * word "image". Cause: the thread only ever rendered `m.body`, and an image
 * message has an empty body — its content lives in `media_url`, a column that
 * did not exist until migration 0003.
 *
 * This component renders each type properly and, crucially, fails soft: a
 * provider CDN URL expires (Facebook's are signed and short-lived), so a dead
 * link must degrade to a labelled placeholder rather than a broken image icon.
 */

import { useEffect, useRef, useState } from 'react';
import { Download, FileText, Mic, PlayCircle, RotateCw, Sticker, Video } from 'lucide-react';

/**
 * WhatsApp media is stored on a sibling vhost (dash.bunonfabrics.com), and the
 * browser refuses a cross-origin fetch from this app — the request fails and
 * the bubble stays empty. The app already has a caching /image-proxy route, so
 * send same-host media through it. Facebook's CDN is already cross-origin but
 * sends permissive CORS, so those URLs are used directly.
 */
function proxied(url: string): string {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (u.hostname === 'dash.bunonfabrics.com') {
      return '/api/image-proxy?url=' + encodeURIComponent(url);
    }
  } catch {
    return url;
  }
  return url;
}

interface Props {
  msg: any;
  /** true for the customer's (left) bubbles, so the bubble tints match */
  inbound?: boolean;
}

function kindOf(t: string): 'image' | 'video' | 'audio' | 'file' | 'sticker' | null {
  switch (t) {
    case 'image': return 'image';
    case 'video': return 'video';
    case 'reel': return 'video';
    case 'audio': return 'audio';
    case 'voice': return 'audio';
    case 'document': return 'file';
    case 'sticker': return 'sticker';
    default: return null;
  }
}

export function MessageMedia({ msg, inbound }: Props) {
  const kind = kindOf(msg.message_type);
  const url: string | null = msg.media_url || null;
  if (!kind) return null;

  if (!url) {
    return <MediaPlaceholder kind={kind} type={msg.message_type} />;
  }

  switch (kind) {
    case 'image':
    case 'sticker':
      return <ImageBubble src={proxied(url)} type={msg.message_type} alt="ছবি" />;
    case 'video':
      return <VideoBubble src={proxied(url)} poster={proxied(url)} />;
    case 'audio':
      return <AudioBubble src={url} />;
    default:
      return <FileBubble url={proxied(url)} type={msg.message_type} />;
  }
}

/** Expired or missing CDN link: say so, and offer a retry. */
function MediaPlaceholder({ kind, type }: { kind: string; type: string }) {
  const Icon = kind === 'audio' ? Mic : kind === 'video' ? Video : kind === 'file' ? FileText : Sticker;
  return (
    <div className="mt-1 flex max-w-[260px] items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
      <Icon size={14} className="shrink-0 text-slate-400" />
      <span>
        {BN[type] || BN[kind] || 'মিডিয়া'}
        <span className="block text-[10px] text-slate-400">লিংকটি আর পাওয়া যাচ্ছে না</span>
      </span>
    </div>
  );
}

const BN: Record<string, string> = {
  image: 'ছবি', video: 'ভিডিও', reel: 'রিল', audio: 'অডিও',
  voice: 'ভয়েস নোট', document: 'ফাইল', sticker: 'স্টিকার', unknown: 'মিডিয়া',
};

function ImageBubble({ src, alt, type }: { src: string; alt: string; type: string }) {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  // Derived from the DOM, not from a state flag: a re-render must not be able
  // to hide an image the browser has already decoded.
  const [, force] = useState(0);
  const [ratio, setRatio] = useState<number | null>(null);

  useEffect(() => { setFailed(false); }, [src]);

  // on mount, a cached image may already be complete before React attaches
  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    if (el.complete && el.naturalWidth > 0) {
      setRatio(el.naturalWidth / el.naturalHeight || null);
      force((n) => n + 1);
    }
  }, [src]);

  if (failed) return <MediaPlaceholder kind="image" type={type} />;

  const isLoaded = (imgRef.current?.complete ?? false) && (imgRef.current?.naturalWidth ?? 0) > 0;

  return (
    <div className="relative mt-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
      {!isLoaded && (
        <div className="absolute inset-0 flex min-h-[120px] items-center justify-center">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-500" />
        </div>
      )}
      <img
        // key on src so the node is reused across re-renders and the decoded
        // bitmap is not thrown away
        key={src}
        ref={imgRef}
        src={src}
        alt={alt}
        decoding="async"
        loading="eager"
        onLoad={(e) => {
          const el = e.currentTarget;
          setRatio(el.naturalWidth / el.naturalHeight || null);
          force((n) => n + 1);
        }}
        onError={() => setFailed(true)}
        style={ratio ? { aspectRatio: String(ratio) } : undefined}
        className={`block h-auto max-h-[420px] w-full object-cover transition-opacity duration-200 ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div className="flex items-center justify-between border-t border-slate-100 bg-white px-2 py-1">
        <span className="text-[10px] text-slate-500">{BN[type] || 'ছবি'}</span>
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          title="ডাউনলোড"
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <Download size={12} />
        </a>
      </div>
    </div>
  );
}

function VideoBubble({ src, poster }: { src: string; poster?: string | null }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <MediaPlaceholder kind="video" type="video" />;
  return (
    <video
      src={src}
      poster={poster || undefined}
      controls
      preload="metadata"
      onError={() => setFailed(true)}
      className="mt-1 max-h-[420px] w-full max-w-[320px] rounded-xl border border-slate-200 bg-black object-contain"
    />
  );
}

function AudioBubble({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <MediaPlaceholder kind="audio" type="audio" />;
  return (
    <div className="mt-1 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
        <Mic size={13} />
      </span>
      <audio
        src={src}
        controls
        preload="metadata"
        onError={() => setFailed(true)}
        className="h-8 w-full max-w-[240px]"
      />
    </div>
  );
}

function FileBubble({ url, type }: { url: string; type: string }) {
  const name = url.split('/').pop()?.split('?')[0] || 'ফাইল';
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="mt-1 flex max-w-[300px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
        <FileText size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-slate-800">{name}</span>
        <span className="block text-[10px] text-slate-500">{BN[type] || 'ফাইল'}</span>
      </span>
      <Download size={14} className="shrink-0 text-slate-400" />
    </a>
  );
}