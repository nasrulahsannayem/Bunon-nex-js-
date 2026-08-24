import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

/* ============================================================
 * bunon.shop/p/sare — Bunon Saree landing clone
 * Design tokens cloned from live bunonfabrics.com (Elementor):
 *   font: HindSiliguri (Bengali) + Nunito
 *   primary: #FE0010 (red) | navy gradient: linear-gradient(300deg,#0008AF 0%,#07003F 100%)
 *   button: bg #FE0010, radius 3px, white, 16px/600
 *   carousel: radius 12px, 4px white border, gold pagination #FFD700
 * Checkout reuses Bunon flow: POST /api/orders/save_to_wp.php
 * ============================================================ */

const WA_NUMBER = '8801618775368';
const COUNTDOWN_1_HOURS = 48;
const COUNTDOWN_2_HOURS = 24;

const PRODUCT_CAROUSEL = [
  'https://bunonfabrics.com/wp-content/uploads/2025/09/bunfabrics-hafsilk-jamdani105-1.jpg',
  'https://bunonfabrics.com/wp-content/uploads/2025/09/bunfabrics-hafsilk-jamdani105-2.jpg',
  'https://bunonfabrics.com/wp-content/uploads/2025/09/bunfabrics-hafsilk-jamdani105-3.jpg',
  'https://bunonfabrics.com/wp-content/uploads/2025/09/bunfabrics-hafsilk-jamdani105-4.jpg',
  'https://bunonfabrics.com/wp-content/uploads/2025/09/bunfabrics-hafsilk-jamdani105-5.jpg',
  'https://bunonfabrics.com/wp-content/uploads/2025/09/bunfabrics-hafsilk-jamdani105-6.jpg',
  'https://bunonfabrics.com/wp-content/uploads/2025/09/bunfabrics-hafsilk-jamdani105-7.jpg',
];

const REVIEW_CAROUSEL = [
  'https://bunonfabrics.com/wp-content/uploads/2025/05/Frame.png',
  'https://bunonfabrics.com/wp-content/uploads/2025/05/Frame-1.png',
  'https://bunonfabrics.com/wp-content/uploads/2025/05/Vector-3.png',
  'https://bunonfabrics.com/wp-content/uploads/2025/04/492128445_577989221971756_9097319478841283651_n.jpg',
  'https://bunonfabrics.com/wp-content/uploads/2025/05/Frame-29.png',
  'https://bunonfabrics.com/wp-content/uploads/2025/05/Layer_1.png',
];

const PRODUCT = {
  id: 'saree-hafsilk-jamdani-105',
  name: 'হাফ সিল্ক জামদানি শাড়ি',
  price: 1450,
  thumbnail: 'https://bunonfabrics.com/wp-content/uploads/2025/09/bunfabrics-hafsilk-jamdani105-1.jpg',
};

const BENGALI_FONT = "'HindSiliguri', 'Noto Sans Bengali', sans-serif";
const NAVY_GRADIENT = 'linear-gradient(300deg, #0008AF 0%, #07003F 100%)';
const PRIMARY = '#FE0010';

/* ---------- Marquee bar (top, fixed, red/pink tones per WP) ---------- */
function MarqueeBar() {
  const items = [
    '🚚 ফ্রি হোম ডেলিভারি 🛍️ Limited Stock Available!',
    '✨ হাফসিল্ক কাপড় | ১২.৫ হাত | ব্লাউজ পিস ফ্রি!',
    '🎁 এখনই অর্ডার করুন !',
    '💎 পছন্দ আপনার, পৌঁছে দেওয়ার দায়িত্ব আমাদের!',
    `🌍 প্রবাস থেকেও অর্ডার করুন WhatsApp: +${WA_NUMBER}`,
  ];
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', zIndex: 9999, overflow: 'hidden', background: NAVY_GRADIENT, padding: '10px 0', fontFamily: BENGALI_FONT, boxShadow: '0 6px 16px rgba(0,0,0,0.25)' }}>
      <style>{`
        @keyframes scrollLoop { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .bunon-marquee-inner { display: flex; width: max-content; white-space: nowrap; animation: scrollLoop 25s linear infinite; }
        .bunon-marquee-text { color: #fff; font-size: 20px; font-weight: 700; padding-right: 60px; text-shadow: 0 0 10px rgba(254,0,16,0.8); }
        @media (max-width: 768px) { .bunon-marquee-text { font-size: 17px; padding-right: 40px; } }
        @media (max-width: 480px) { .bunon-marquee-text { font-size: 16px; padding-right: 30px; } }
      `}</style>
      <div className="bunon-marquee-inner">
        {[...items, ...items].map((t, i) => (
          <span className="bunon-marquee-text" key={i}>{t}</span>
        ))}
      </div>
    </div>
  );
}

/* ---------- Countdown ---------- */
function Countdown({ hours }: { hours: number }) {
  const target = useRef(Date.now() + hours * 3600 * 1000);
  const [left, setLeft] = useState(target.current - Date.now());
  useEffect(() => {
    const t = setInterval(() => setLeft(target.current - Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const total = Math.max(0, Math.floor(left / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  const Box = ({ v, l }: { v: string; l: string }) => (
    <div style={{ background: PRIMARY, color: '#fff', borderRadius: 6, padding: '6px 12px', textAlign: 'center', minWidth: 56, fontFamily: BENGALI_FONT }}>
      <div style={{ fontSize: 26, fontWeight: 800 }}>{v}</div>
      <div style={{ fontSize: 11 }}>{l}</div>
    </div>
  );
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', marginTop: 16 }}>
      {d > 0 && <Box v={String(d)} l="দিন" />}
      <Box v={pad(h)} l="ঘণ্টা" />
      <Box v={pad(m)} l="মিনিট" />
      <Box v={pad(s)} l="সেকেন্ড" />
    </div>
  );
}

/* ---------- Carousel (WP swiper style: 12px radius, 4px white border, gold dots) ---------- */
function Carousel({ images, height = 420 }: { images: string[]; height?: number }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % images.length), 3000);
    return () => clearInterval(t);
  }, [images.length]);
  return (
    <div style={{ position: 'relative', maxWidth: 900, margin: '0 auto', overflow: 'hidden', borderRadius: 12, boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}>
      <style>{`
        .bunon-slide img { border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); border: 4px solid #fff; margin: 0 auto; max-width: 92%; height: auto; }
        .bunon-dot { width: 8px; height: 8px; background: #ffffff; opacity: 0.4; margin: 0 3px !important; border-radius: 50%; display: inline-block; cursor: pointer; }
        .bunon-dot.active { background: #FFD700; opacity: 1; }
      `}</style>
      <div style={{ display: 'flex', transition: 'transform 0.6s ease', transform: `translateX(-${idx * 100}%)` }}>
        {images.map((src, i) => (
          <div className="bunon-slide" key={i} style={{ flexShrink: 0, width: '100%' }}>
            <img src={src} alt="" style={{ width: '100%', height, objectFit: 'cover' }} loading="lazy" />
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', bottom: 12, left: 0, right: 0, display: 'flex', gap: 6, justifyContent: 'center' }}>
        {images.map((_, i) => (
          <span key={i} onClick={() => setIdx(i)} className={`bunon-dot ${i === idx ? 'active' : ''}`} />
        ))}
      </div>
    </div>
  );
}

/* ---------- CTA button (WP Elementor style: #FE0010, radius 3px) ---------- */
function Cta({ label, href, scroll }: { label: string; href?: string; scroll?: boolean }) {
  const navigate = useNavigate();
  const onClick = (e: React.MouseEvent) => {
    if (scroll) {
      e.preventDefault();
      document.getElementById('order-now')?.scrollIntoView({ behavior: 'smooth' });
    } else if (href && href.startsWith('http')) {
      window.open(href, '_blank');
    } else if (href && href.startsWith('/')) {
      e.preventDefault();
      navigate(href);
    }
  };
  return (
    <button onClick={onClick} style={{ background: PRIMARY, color: '#FFFFFF', border: 'none', borderRadius: 3, padding: '12px 28px', fontSize: 16, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 10px rgba(254,0,16,0.3)', fontFamily: BENGALI_FONT }}>
      {label}
    </button>
  );
}

/* ---------- Order form (reuses Bunon checkout POST) ---------- */
function OrderForm() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', address: '', phone: '' });
  const [loading, setLoading] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const cleanPhone = form.phone.replace(/\D/g, '');
    if (cleanPhone.length < 11) { alert('সঠিক মোবাইল নাম্বার দিন'); return; }
    const payload = {
      customer_name: form.name || 'Guest',
      phone: cleanPhone,
      address: form.address,
      city: '',
      email: '',
      cart_products: [{
        product_id: PRODUCT.id,
        name: PRODUCT.name,
        price: PRODUCT.price,
        quantity: 1,
        thumbnail: PRODUCT.thumbnail,
      }],
    };
    navigator.sendBeacon('/api/orders/save_to_wp.php', JSON.stringify(payload));
    setLoading(true);
    setTimeout(() => navigate('/order-received'), 600);
  };

  const inputStyle = { width: '100%', padding: '14px 16px', borderRadius: 3, border: '1px solid #d1d5db', fontSize: 16, fontFamily: BENGALI_FONT, marginBottom: 14 };
  return (
    <form id="order-now" onSubmit={submit} style={{ maxWidth: 520, margin: '0 auto', background: '#fff', padding: 28, borderRadius: 12, boxShadow: '0 10px 40px rgba(0,0,0,0.12)' }}>
      <h3 style={{ textAlign: 'center', color: PRIMARY, marginBottom: 18, fontFamily: BENGALI_FONT, fontSize: 20 }}>অর্ডার করতে নিচের ফর্মে আপনার নাম, পূর্ণ ঠিকানা এবং মোবাইল নাম্বার লিখুন।</h3>
      <input style={inputStyle} placeholder="আপনার নাম" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      <input style={inputStyle} placeholder="পূর্ণ ঠিকানা" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} required />
      <input style={inputStyle} placeholder="মোবাইল নাম্বার" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required inputMode="tel" />
      <button type="submit" disabled={loading} style={{ width: '100%', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 3, padding: '15px', fontSize: 18, fontWeight: 600, cursor: 'pointer', fontFamily: BENGALI_FONT }}>
        {loading ? 'অর্ডার হচ্ছে...' : 'এখনই অর্ডার করুন'}
      </button>
    </form>
  );
}

function H({ children, size = 30, color = PRIMARY }: { children: React.ReactNode; size?: number; color?: string }) {
  return <h2 style={{ fontSize: size, fontWeight: 600, color, textAlign: 'center', margin: '24px 0', fontFamily: BENGALI_FONT, lineHeight: 1.3 }}>{children}</h2>;
}

export default function LandingSare() {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const sectionPad = { padding: '40px 20px', maxWidth: 1100, margin: '0 auto' };

  return (
    <div style={{ fontFamily: BENGALI_FONT, background: '#F8F6F8', paddingTop: 52, overflowX: 'hidden' }}>
      <MarqueeBar />

      {/* Hero — navy gradient per WP */}
      <section style={{ ...sectionPad, textAlign: 'center', background: NAVY_GRADIENT, color: '#fff', borderRadius: 0 }}>
        <h1 style={{ fontSize: 34, fontWeight: 600, lineHeight: 1.25, color: '#fff' }}>
          হোম ডেলিভারি ফ্রি <span style={{ color: '#FFD700' }}>সীমিত সময়ের জন্য</span>
        </h1>
        <Countdown hours={COUNTDOWN_1_HOURS} />
        <H size={28} color="#fff">তিনি যাঁর জন্য আপনার সব - তাঁর জন্য স্পেশাল কিছু বেছে নিন আজই!</H>
        <img src="https://bunonfabrics.com/wp-content/uploads/2025/05/Frame.png" alt="" style={{ maxWidth: '100%', margin: '0 auto', display: 'block' }} />
      </section>

      {/* Product gallery */}
      <section style={{ ...sectionPad, textAlign: 'center' }}>
        <img src="https://bunonfabrics.com/wp-content/uploads/2025/05/Frame-1.png" alt="" style={{ maxWidth: 200, margin: '0 auto 16px' }} />
        <Carousel images={PRODUCT_CAROUSEL} />
        <div style={{ marginTop: 20 }}><Cta label="আপনার ব্যাক্তিগত ফুলকে আজই উপহার দিন" scroll /></div>
      </section>

      {/* Social proof */}
      <section style={{ ...sectionPad, textAlign: 'center', background: '#fff', borderRadius: 12, margin: '20px auto' }}>
        <p style={{ color: PRIMARY, fontWeight: 600 }}>🔔 সদ্য অর্ডার হয়েছে — প্রবাস থেকেও অর্ডার করুন!</p>
        <H size={28}>যা উপহার দেবেন, তা মনে থাকবে</H>
        <H size={28}>অনেকদিন</H>
      </section>

      {/* Emotional + videos */}
      <section style={{ ...sectionPad, textAlign: 'center' }}>
        <H>তাঁর আলমারিতে শাড়ি অনেক... কিন্তু এইটা হবে 'আপনার' গল্প বলা শাড়ি!</H>
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {['YfGj8L3Zk1w', 'TxCwl5uhuck', '4mFWSXj9x6k'].map((id) => (
            <div key={id} style={{ position: 'relative', paddingTop: '56.25%', borderRadius: 12, overflow: 'hidden', boxShadow: '0 6px 18px rgba(0,0,0,0.15)' }}>
              <iframe src={`https://www.youtube.com/embed/${id}`} title="video" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }} allowFullScreen />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 20 }}>
          <Cta label="এখনই উপহার দিতে ক্লিক করুন" href={`https://wa.me/${WA_NUMBER}`} />
          <Cta label="এখনই উপহার দিতে ক্লিক করুন" scroll />
        </div>
      </section>

      {/* Offer box */}
      <section style={{ ...sectionPad, textAlign: 'center', background: 'linear-gradient(135deg,#fff,#fde8ea)', borderRadius: 12, margin: '20px auto' }}>
        <H size={26} color="#b00">হাফ সিল্ক জামদানি শাড়িটির রেগুলার মূল্য ১৬৫০ টাকা</H>
        <H size={34} color={PRIMARY}>অফার মূল্য: ১৪৫০ টাকা</H>
        <img src="https://bunonfabrics.com/wp-content/uploads/2025/05/Vector-3.png" alt="" style={{ maxWidth: 160, margin: '10px auto' }} />
        <p style={{ color: '#180883', fontWeight: 600, maxWidth: 600, margin: '0 auto' }}>( এই অফারটি শুধুমাত্র আজকের দিনের জন্য! একদম ফ্রি , ব্লাউজ পিছ একদম ফ্রি হোম ডেলিভারি )</p>
        <div style={{ marginTop: 16 }}><Cta label="এখনই উপহার দিতে ক্লিক করুন" scroll /></div>
      </section>

      {/* Product detail shots */}
      <section style={{ ...sectionPad, textAlign: 'center' }}>
        <img src="https://bunonfabrics.com/wp-content/uploads/2025/05/Layer_1.png" alt="" style={{ maxWidth: 220, margin: '0 auto 12px' }} />
        <H size={28}>প্রিয়তমাকে চমকে দিতে চান? এই শাড়িই হবে</H>
        <H size={28}>আপনার ম্যাজিক!</H>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          {PRODUCT_CAROUSEL.map((src, i) => (
            <img key={i} src={src} alt="" style={{ width: '100%', borderRadius: 12, objectFit: 'cover', height: 260, border: '4px solid #fff', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }} loading="lazy" />
          ))}
        </div>
        <div style={{ marginTop: 20 }}><Cta label="এখনই উপহার দিতে ক্লিক করুন" scroll /></div>
      </section>

      {/* 2nd countdown + form */}
      <section style={{ ...sectionPad, textAlign: 'center' }}>
        <H size={26}>এই অফারটি শুধুমাত্র আজকের দিনের জন্য!</H>
        <Countdown hours={COUNTDOWN_2_HOURS} />
        <div style={{ marginTop: 24 }}>
          <OrderForm />
        </div>
      </section>

      {/* Why order */}
      <section style={{ ...sectionPad, textAlign: 'center' }}>
        <H>হাফ সিল্ক জামদানি শাড়ি যে কারনে অর্ডার করবেন</H>
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', marginTop: 16 }}>
          {[
            'হাফ সিল্ক জামদানী – ঐতিহ্যের ছোঁয়া',
            'মমতার আবরণ ১২.৫ হাত',
            '২লক্ষ+ সন্তষ্ট গ্রাহকের আস্থা',
            'সারা দেশে ফ্রি হোম ডেলিভারি',
            'মোলায়েম, আরামদায়ক ও কোয়ালিটি সম্পন্ন কাপড়',
            'প্রিমিয়াম কোয়ালিটি শাড়ি ১০০% কালার গ্যারান্টি',
            'বিশেষ অফার: ব্লাউজ পিস একদম ফ্রি!',
          ].map((t) => (
            <div key={t} style={{ background: NAVY_GRADIENT, color: '#fff', borderRadius: 8, padding: '16px 18px', fontWeight: 600, fontSize: 15, fontFamily: BENGALI_FONT }}>{t}</div>
          ))}
        </div>
        <img src="https://bunonfabrics.com/wp-content/uploads/2025/05/Frame-1.png" alt="" style={{ maxWidth: 180, margin: '20px auto 0' }} />
      </section>

      {/* Gift emotional + review carousel */}
      <section style={{ ...sectionPad, textAlign: 'center', background: '#fff', borderRadius: 12, margin: '20px auto' }}>
        <img src="https://bunonfabrics.com/wp-content/uploads/2025/04/492128445_577989221971756_9097319478841283651_n.jpg" alt="" style={{ maxWidth: 260, margin: '0 auto 16px', borderRadius: 12 }} />
        {['শাড়ি Gift একটা মেয়ের মনে সুখের অনুভূতি তৈরি করে', 'মেয়েটির চোখে পুরুষটাকে আরো স্পেশাল করে তোলে', 'ভালোবাসার সম্পর্ক আরো মজবুত হয়', 'এতে করে সম্পর্ক গুলো আরো অনেক বেশি মিষ্টি মধুর এবং দীর্ঘস্থায়ী হয়', 'শাড়ি শুধু একটি পোশাক নয়, এটি ভালোবাসার গল্প।'].map((t) => (
          <p key={t} style={{ color: '#180883', fontWeight: 600, fontSize: 17, margin: '8px 0', fontFamily: BENGALI_FONT }}>{t}</p>
        ))}
        <div style={{ marginTop: 20 }}>
          <Carousel images={REVIEW_CAROUSEL} height={360} />
        </div>
        <H size={26}>২লক্ষ+ সন্তষ্ট গ্রাহকের আস্থা</H>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 14 }}>
          <Cta label="গ্রাহকের রিভিউ" scroll />
          <Cta label="এখনই উপহার দিতে ক্লিক করুন" scroll />
        </div>
      </section>

      <div style={{ height: 40 }} />
    </div>
  );
}
