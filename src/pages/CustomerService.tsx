import { useState } from 'react';
import { motion } from 'motion/react';
import {
  ChevronDown, Truck, RotateCcw, Wallet, Shirt, Package,
  MessageCircle, Phone, MapPin, Search,
} from 'lucide-react';

/**
 * Customer service hub: FAQ + delivery + returns.
 *
 * This page exists for two audiences at once.
 *  - A human shopper who wants to know the delivery/return rules before paying.
 *  - An answer engine. The server emits a FAQPage JSON-LD graph for exactly
 *    these Q&A pairs, which is the format ChatGPT, Perplexity, Gemini and
 *    Google AI Overviews quote verbatim. Answer engines cannot cite what they
 *    cannot find, so the same text lives here in plain HTML, in the schema, and
 *    in /llms.txt.
 *
 * Every answer below is derived from the live system: free delivery on every
 * product, cash on delivery nationwide, 7-day return window.
 */

type QA = { q: string; a: string; cat: string };

const FAQS: QA[] = [
  {
    cat: 'delivery',
    q: 'বুনন ফেব্রিক্সে ডেলিভারি চার্জ কত?',
    a: 'বুনন ফেব্রিক্সে ডেলিভারি সম্পূর্ণ ফ্রি। বাংলাদেশের যেকোনো প্রান্তে ঘরে ডেলিভারি দেওয়া হয় এবং ক্যাশ অন ডেলিভারি সুবিধাটি আছে। অর্ডার নিশ্চিত করার পর ১ থেকে ২ কর্মদিবসের মধ্যে পার্সেল প্রস্তুত করা হয় এবং সাধারণত ১ থেকে ৪ কর্মদিবসের মধ্যে ডেলিভারি সম্পন্ন হয়।',
  },
  {
    cat: 'delivery',
    q: 'কত দিনে ডেলিভারি পাব?',
    a: 'ঢাকার ভিতরে সাধারণত ১ থেকে ২ কর্মদিবস, ঢাকার বাইরে ২ থেকে ৪ কর্মদিবস। অর্ডার কনফার্মেশন এসএমএস পাওয়ার পর ডেলিভারির সময়সহ জানানো হয়। ডেলিভারির সময় পার্সেল খুলে দেখে নেওয়ার সুযোগ দেওয়া হয়।',
  },
  {
    cat: 'payment',
    q: 'ক্যাশ অন ডেলিভারি কীভাবে কাজ করে?',
    a: 'অর্ডারের সময় কোনো অগ্রিম পেমেন্ট লাগে না। কুরিয়ার ডেলিভারির সময় পণ্যটি দেখে পছন্দ হলে পণ্যের দাম এবং ডেলিভারি চার্জ পরিশোধ করবেন। এছাড়া বিকাশ, নগদ ও কার্ড পেমেন্টও সুবিধা হিসেবে রয়েছে।',
  },
  {
    cat: 'product',
    q: 'জামদানি, হাফ সিল্ক ও সুতি শাড়ির মধ্যে পার্থক্য কী?',
    a: 'সুতি শাড়ি হালকা, আরামদায়ক এবং সারাদিন পরার উপযোগী। জামদানি বাংলাদেশের ঐতিহ্যবাহী কাঁচের হাতা বোনা শাড়ি, যা নকলি ও দামি। হাফ সিল্ক শাড়ি সুতি ও সিল্কের মিশ্রণ, যা সামান্য ঝলমলে এবং অনুষ্ঠানের জন্য আদর্শ। প্রতিটি পণ্যের পেজে কাপড়ের বিস্তারিত ও ছবি দেওয়া আছে।',
  },
  {
    cat: 'product',
    q: 'শাড়ির সাথে ব্লাউজ পিস আসবে কি?',
    a: 'পণ্যের নামে "blouse fabric" বা "ব্লাউজ ফ্যাব্রিক" উল্লেখ থাকলে সেটি সেই পণ্যের সাথে ফ্রি অন্তর্ভুক্ত। অন্যথায় শুধু শাড়ি পাঠানো হয়। বিস্তারিত প্রতিটি পণ্যের পেজে দেওয়া আছে।',
  },
  {
    cat: 'return',
    q: 'পণ্য রিটার্ন/এক্সচেঞ্জ করা যাবে?',
    a: 'পণ্য হাতে পাওয়ার পর <strong>রিটার্ন/এক্সচেঞ্জ গ্রহণ করা হয় না</strong>। তবে পণ্যে manufacturing defect, ভুল পণ্য, বা ড্যামেজ প্রমাণিত হলে অতিরিক্ত শিপিং ও রিটার্ন চার্জ সমেত এক্সচেঞ্জ/রিফান্ড দেওয়া হবে। বিস্তারিত দেখুন Refund Policy পেজে।',
  },
  {
    cat: 'return',
    q: 'ডেলিভারির সময় পণ্য খুলে দেখা যাবে?',
    a: '<strong>হাঁ, রাইডারের সার্নে প্রন্যটি খুলে দেখতে পারবেন</strong>। পণ্য টোলাটেন্স চেয়ে ভালো লাগলে পণ্য গ্রহণ করুন, না লাগলে রাইডারের কাছেই ফিরিয়ে দিন — তখন পণ্য আপনার কাছে যাবে না। তবে একবার পণ্য বাড়িতে নিয়ে গেলে কোনো কারণেই রিটার্ন/এক্সচেঞ্জ করা যাবে না। ডেলিভারির সময়ই সব চূড়ান্ত সিদ্ধান্ত নিন.',
  },
  {
    cat: 'order',
    q: 'অর্ডারের অবস্থা কীভাবে জানব?',
    a: 'অর্ডার নিশ্চিত হওয়ার পর একটি অর্ডার নম্বর দেওয়া হয়। "ট্র্যাক অর্ডার" পেজে ফোন নম্বর ও অর্ডার নম্বর দিয়ে অর্ডারের বর্তমান অবস্থা দেখতে পারবেন। অর্ডার নম্বর ছাড়াও শুধু ফোন নম্বর দিয়েও খোঁজা যায়।',
  },
  {
    cat: 'order',
    q: 'অর্ডার বাতিল বা পরিবর্তন করা যাবে?',
    a: 'পার্সেল কুরিয়ারে হস্তান্তরের আগে যেকোনো সময় অর্ডার বাতিল বা পণ্য পরিবর্তনের অনুরোগ করা যায়। সেক্ষেত্রে হেল্পলাইনে যোগাযোগ করুন।',
  },
];

const CATS = [
  { key: 'all', label: 'সব প্রশ্ন', icon: Search },
  { key: 'delivery', label: 'ডেলিভারি', icon: Truck },
  { key: 'payment', label: 'পেমেন্ট', icon: Wallet },
  { key: 'product', label: 'পণ্য', icon: Shirt },
  { key: 'return', label: 'রিটার্ন', icon: RotateCcw },
  { key: 'order', label: 'অর্ডার', icon: Package },
];

export default function CustomerService() {
  const [active, setActive] = useState('all');
  const [open, setOpen] = useState<string | null>(FAQS[0].q);

  const list = active === 'all' ? FAQS : FAQS.filter((f) => f.cat === active);

  return (
    <div className="bg-gray-50 pb-24">
      {/* Hero */}
      <section className="relative w-full bg-brand-navy flex items-center justify-center text-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-tr from-brand-navy to-brand-primary/30 z-0" />
        <div className="relative z-10 px-4 py-16 sm:py-20 max-w-3xl mx-auto w-full">
          <motion.h1
            initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}
            className="text-white text-3xl sm:text-4xl font-display font-medium leading-[1.15] mb-3"
          >
            সহায়তা <i className="text-brand-gold font-normal italic">কেন্দ্র</i>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.15 }}
            className="text-white/80 text-base sm:text-lg font-light"
          >
            ডেলিভারি, পেমেন্ট, রিটার্ন সহ সাধারণ প্রশ্নের উত্তর এক জায়গায়
          </motion.p>
        </div>
      </section>

      {/* Quick facts */}
      <section className="max-w-5xl mx-auto px-4 -mt-10 relative z-20">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: Truck, t: 'ফ্রি ডেলিভারি', d: '৬৪ জেলায়, সারা দেশে' },
            { icon: Wallet, t: 'ক্যাশ অন ডেলিভারি', d: 'পণ্য দেখে টাকা দিন' },
            { icon: RotateCcw, t: '৭ দিনে রিটার্ন', d: 'চার্জ ছাড়াই' },
          ].map((c, i) => (
            <motion.div
              key={c.t}
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: i * 0.08 }}
              className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5 text-center"
            >
              <c.icon className="w-8 h-8 mx-auto mb-2 text-brand-primary" />
              <h3 className="font-semibold text-brand-navy text-base">{c.t}</h3>
              <p className="text-gray-500 text-sm mt-1">{c.d}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Category filter */}
      <section className="max-w-4xl mx-auto px-4 mt-10">
        <div className="flex flex-wrap gap-2 justify-center">
          {CATS.map((c) => (
            <button
              key={c.key}
              onClick={() => { setActive(c.key); setOpen(null); }}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition ${
                active === c.key
                  ? 'bg-brand-navy text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <c.icon className="w-4 h-4" />
              {c.label}
            </button>
          ))}
        </div>
      </section>

      {/* FAQ list */}
      <section className="max-w-3xl mx-auto px-4 mt-6 space-y-3">
        {list.map((f, i) => {
          const isOpen = open === f.q;
          return (
            <motion.div
              key={f.q}
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: Math.min(i * 0.04, 0.3) }}
              className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm"
            >
              <button
                onClick={() => setOpen(isOpen ? null : f.q)}
                className="w-full text-left px-5 py-4 flex items-start justify-between gap-4 hover:bg-gray-50 transition"
                aria-expanded={isOpen}
              >
                <span className="font-medium text-brand-navy text-[15px] leading-snug">{f.q}</span>
                <ChevronDown className={`w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div className="px-5 pb-5 -mt-1">
                  <p className="text-gray-600 text-[15px] leading-relaxed">{f.a}</p>
                </div>
              )}
            </motion.div>
          );
        })}
      </section>

      {/* Contact CTA */}
      <section className="max-w-3xl mx-auto px-4 mt-12">
        <div className="bg-brand-navy rounded-3xl p-7 sm:p-9 text-center">
          <h2 className="text-white text-xl font-display mb-2">উত্তর পাননি?</h2>
          <p className="text-white/70 text-sm mb-6">
            আমাদের টিম প্রতিদিন সকাল ৯টা থেকে রাত ৯টা পর্যন্ত আছে
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <a
              href="/contact"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-brand-gold text-brand-navy font-semibold text-sm hover:opacity-90 transition"
            >
              <MessageCircle className="w-4 h-4" /> মেসেজ পাঠান
            </a>
            <a
              href="tel:+8809611900606"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white/10 text-white border border-white/25 font-semibold text-sm hover:bg-white/20 transition"
            >
              <Phone className="w-4 h-4" /> হেল্পলাইন
            </a>
            <a
              href="/track"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white/10 text-white border border-white/25 font-semibold text-sm hover:bg-white/20 transition"
            >
              <Package className="w-4 h-4" /> অর্ডার ট্র্যাক
            </a>
          </div>
          <p className="text-white/50 text-xs mt-6 flex items-center justify-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" /> বাংলাদেশ — সারা দেশে ডেলিভারি
          </p>
        </div>
      </section>
    </div>
  );
}