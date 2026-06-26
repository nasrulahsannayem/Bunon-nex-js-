import { useEffect, useState } from 'react';
import ProductCard from '../components/products/ProductCard';
import { getProducts, Product } from '../lib/woocommerce'; 
import { motion } from 'motion/react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Sparkles, ArrowRight, Truck, ShieldCheck, Headphones, RotateCcw, ShoppingCart, Star, Crown, Clock, HeartHandshake
} from 'lucide-react';
import { useCart } from '../lib/store'; 

// --- Skeleton Loaders for Millisecond Rendering ---
const ProductSkeleton = () => (
  <div className="w-full flex flex-col gap-2 p-2">
    <div className="w-full aspect-[3/4] bg-gray-200 animate-pulse rounded-2xl" />
    <div className="h-4 bg-gray-200 animate-pulse rounded w-full mt-2" />
    <div className="h-4 bg-gray-200 animate-pulse rounded w-2/3" />
  </div>
);

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [recentlyViewed, setRecentlyViewed] = useState<Product[]>([]);
  const navigate = useNavigate();
  
  // Cart State Fix
  const cartState = useCart() as any;
  const cartItems = cartState.items || cartState.cart || [];
  const cartItemCount = cartItems.reduce((total: number, item: any) => total + (item.quantity || 1), 0);

  // Dynamic Countdown State for Flash Sale
  const [countdown, setCountdown] = useState({ hours: 48, minutes: 15, seconds: 30 });

  // === 🚀 আপনার লোকাল সার্ভারের ইমেজ দিয়ে ক্যাটাগরি ===
  const hardcodedCategories = [
    { name: 'Best Selling', slug: 'beast-saling-sare', image: '/image/Bestselling-Saree-banner-1-mobie-768x912.jpg' },
    { name: 'Couple Dress', slug: 'couple-dress', image: '/image/couple%20dress.webp' },
    { name: 'Women Dress', slug: 'women-dress', image: '/image/women-dress.jpg' },
    { name: 'Night Dress', slug: 'womens-night-dress', image: '/image/womens-night-dress.jpg' },
    { name: 'Jewelry', slug: 'jewelry', image: '/image/jewelry-card-banners-set_1284-6731.jpg' },
    { name: 'Saree', slug: 'saree', image: '/image/saree.jpg' }
  ];

  // 🚀 Shop by Fabric Chips
  const fabrics = ['Jamdani', 'Half Silk', 'Pure Cotton', 'Katan', 'Linen'];

  useEffect(() => {
    async function loadData() {
      try {
        const prodData = await getProducts();
        if (prodData && prodData.length > 0) {
          setProducts(prodData);
        }

        // Recently Viewed Logic
        if (typeof window !== 'undefined') {
          const storedViews = localStorage.getItem('bunon_recently_viewed');
          if (storedViews && prodData) {
            const ids = JSON.parse(storedViews);
            const viewed = prodData.filter((p: Product) => ids.includes(p.id));
            setRecentlyViewed(viewed);
          }
        }
      } catch (error) {
        console.error("Home data load error:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
    window.scrollTo(0, 0);
  }, []);

  // Countdown logic
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev.seconds > 0) return { ...prev, seconds: prev.seconds - 1 };
        if (prev.minutes > 0) return { ...prev, minutes: prev.minutes - 1, seconds: 59 };
        if (prev.hours > 0) return { ...prev, hours: prev.hours - 1, minutes: 59, seconds: 59 };
        return { hours: 48, minutes: 0, seconds: 0 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const testimonials = [
    { name: 'Ayesha R., Dhaka', text: 'The Rupnandini saree made me feel like royalty. The craftsmanship is unbelievable!', img: '/assets/images/IMG-20250224-WA0007.jpg' },
    { name: 'Nazia K., Chattogram', text: 'I gifted a Bunon saree to my mother. Her tears said everything. It was perfect.', img: '/assets/images/676afc30-c94c-407d-984d-e19845b088ec.jpeg' },
    { name: 'Sara T., Sylhet', text: 'Bunon isn’t just a brand. It’s heritage wrapped in elegance. I\'m in love!', img: '/assets/images/IMG-20250301-WA0005.jpg' },
    { name: 'Jannat A., Narayanganj', text: 'Got my order in 2 days! Packaging was stunning. My husband was speechless.', img: '/assets/images/475526699_18022258898644312_3512043635408462093_n.webp' },
  ];

  // 🚀 ১. Best Selling Saree: মাদার ক্যাটাগরি "saree" দিয়ে রিয়েল ফিল্টারিং
 const bestSarees = [...products]
  .filter(
    p =>
      p.categories?.some(c =>
        c.slug.toLowerCase().includes('saree')
      ) &&
      p.stock_status === 'instock'
  )
  .sort(
    (a, b) => (b.total_sales || 0) - (a.total_sales || 0)
  )
  .slice(0, 8);

  // 🚀 ২. New Arrivals: ডেট অনুযায়ী অথবা লেটেস্ট প্রোডাক্ট
  const newArrivals = [...products]
  .filter(p => p.stock_status === 'instock')
  .sort(
    (a, b) =>
      new Date(b.date_created).getTime() -
      new Date(a.date_created).getTime()
  )
  .slice(0, 4);

  // 🚀 ৩. Deal of the Week: প্রতি ২৪ ঘণ্টা অন্তর অটোমেটিক প্রোডাক্ট চেঞ্জ হবে (সর্টিং সহ)
  const saleProducts = [...products]
    .filter(
      p =>
        p.on_sale &&
        p.stock_status === 'instock' && // শুধু স্টক থাকা প্রোডাক্টগুলো আসবে
        p.categories?.some(c => c.slug.toLowerCase().includes('saree'))
    )
    .sort((a, b) => (b.total_sales || 0) - (a.total_sales || 0));

  // প্রতিদিনের জন্য ইউনিক ইনডেক্স তৈরি করা (প্রতি ২৪ ঘণ্টা পর পর দিনটি বাড়বে)
  const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24));

  // প্রোডাক্ট লিস্ট থেকে প্রতিদিন একটি করে প্রোডাক্ট সিলেক্ট হবে
  const dealOfTheWeek = saleProducts.length > 0 
    ? saleProducts[dayIndex % saleProducts.length] 
    : null;

  return (
    <div className="bg-gray-50 pb-20 overflow-x-hidden relative">
      <style>{`.no-scrollbar::-webkit-scrollbar { display: none; } .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}</style>

      {/* Marquee */}
      <div className="bg-brand-primary text-white py-2 text-[11px] font-semibold tracking-widest uppercase overflow-hidden whitespace-nowrap relative z-50">
        <div className="inline-block animate-marquee pl-[100%] hover:pause">
          ✨ EXCLUSIVE JAMDANI & SILK HERITAGE ✨ FREE NATIONWIDE DELIVERY ON ORDERS OVER ৳5000 ✨ 100% AUTHENTIC HANDLOOM CRAFTSMANSHIP ✨ HOTLINE: 09611900606 ✨
        </div>
      </div>

      {/* Hero Section */}
      <section className="relative w-full h-[75vh] min-h-[500px] bg-black flex items-center justify-center text-center overflow-hidden">
        <img src="/assets/images/Bestselling-Saree-banner-1pc.jpg" className="absolute inset-0 w-full h-full object-cover opacity-85 hidden md:block" alt="Bunon Luxury Saree" fetchpriority="high" />
        <video className="absolute inset-0 w-full h-full object-cover opacity-85 md:hidden pointer-events-none" autoPlay loop muted playsInline poster="/image/Bestselling-Saree-banner-1-mobie-768x912.jpg">
          <source src="/assets/videos/snaptik_7543269370093456658_v3-1.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-[#080f28]/80 z-10" />
        <div className="relative z-20 px-4 max-w-3xl mx-auto w-full">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-[11px] sm:text-[13px] font-semibold uppercase tracking-[3px] text-brand-gold mb-6">
              <Sparkles className="w-3.5 h-3.5" /> The Art of Handloom
            </span>
            <h1 className="text-white text-4xl sm:text-6xl md:text-7xl font-display font-medium leading-[1.1] mb-8">
              Woven with <i className="text-brand-gold font-normal italic">Love</i>,<br/>Crafted for Royalty.
            </h1>
            <Link to="/shop" className="inline-flex items-center gap-3 px-8 sm:px-11 py-4 bg-white text-brand-navy rounded-full font-semibold uppercase tracking-[1.5px] text-[12px] sm:text-[13px] hover:bg-brand-gold hover:text-white transition-all transform hover:-translate-y-1 shadow-2xl group">
              Discover Collection <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Trust Info */}
      <section className="bg-white py-6 md:py-8 border-b border-gray-200 relative z-30 -mt-6 rounded-t-3xl shadow-[0_-10px_30px_rgba(0,0,0,0.08)]">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8 grid grid-cols-2 md:grid-cols-4 gap-6">
            {[ { icon: Truck, title: 'Fast Delivery', desc: 'Global Shipping' }, { icon: RotateCcw, title: '100% Authentic', desc: 'Master Weavers' }, { icon: ShieldCheck, title: 'Secure Payment', desc: 'Encrypted Data' }, { icon: Headphones, title: '24/7 Support', desc: 'Expert Help' } ].map((prop, idx) => (
              <div key={idx} className="flex flex-col items-center text-center gap-2 group">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-[#f4ebd9] text-brand-gold rounded-full flex items-center justify-center group-hover:bg-brand-gold group-hover:text-white group-hover:scale-110 transition-all">
                  <prop.icon className="w-5 h-5 md:w-6 md:h-6" />
                </div>
                <div><h4 className="text-xs md:text-sm font-semibold text-brand-navy">{prop.title}</h4><p className="text-[10px] md:text-xs text-gray-500">{prop.desc}</p></div>
              </div>
            ))}
        </div>
      </section>

      {/* Shop by Category */}
      <section className="py-12 sm:py-16">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8">
          <div className="flex flex-col items-center text-center mb-8">
            <span className="text-brand-primary text-[10px] sm:text-xs font-semibold uppercase tracking-[2px] mb-2">Curated Selection</span>
            <h2 className="text-3xl md:text-4xl text-brand-navy font-semibold font-display">Top Categories</h2>
          </div>
          <div className="flex gap-5 sm:gap-10 overflow-x-auto pb-6 -mx-4 px-4 sm:mx-0 sm:px-0 sm:justify-center no-scrollbar items-start">
            {hardcodedCategories.map((cat, idx) => (
              <Link key={idx} to={`/shop?cat=${cat.slug}`} className="flex-shrink-0 w-[85px] sm:w-[110px] flex flex-col items-center gap-3 group">
                <div className="w-[85px] h-[85px] sm:w-[110px] sm:h-[110px] rounded-full p-[3px] bg-gradient-to-tr from-brand-gold via-[#ffdf8c] to-brand-gold group-hover:scale-105 transition-all flex items-center justify-center">
                  <div className="w-full h-full rounded-full bg-white p-[3px] overflow-hidden">
                    <img src={cat.image} alt={cat.name} className="w-full h-full rounded-full object-cover group-hover:scale-110 transition-transform duration-500" loading="lazy" />
                  </div>
                </div>
                <span className="text-[11px] sm:text-[12px] font-semibold text-brand-navy text-center group-hover:text-brand-gold transition-colors">{cat.name}</span>
              </Link>
            ))}
          </div>
          
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            {fabrics.map((fabric, idx) => (
              <Link key={idx} to={`/shop?search=${fabric}`} className="px-4 py-1.5 rounded-full border border-gray-200 text-xs font-semibold text-gray-600 hover:border-brand-gold hover:text-brand-gold hover:bg-[#fcf8f2] transition-colors">
                {fabric}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Signature Collection (Best Selling Sarees - Filtered by WooCommerce Category) */}
      <section className="py-14 sm:py-20 bg-[#faf6f0] border-y border-brand-gold/20">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center md:items-end mb-10 gap-4">
            <div className="text-center md:text-left">
              <span className="text-brand-primary text-[10px] sm:text-xs font-bold uppercase tracking-[3px] flex items-center justify-center md:justify-start gap-2 mb-2">
                <Crown className="w-4 h-4 text-brand-gold" /> Signature Collection
              </span>
              <h2 className="text-3xl md:text-4xl lg:text-5xl text-brand-navy font-semibold font-display">Best Selling Sarees</h2>
            </div>
            <Link to="/shop?cat=saree" className="hidden md:flex items-center gap-2 px-6 py-3 bg-brand-navy text-white rounded-full font-semibold hover:bg-brand-primary transition-colors text-xs tracking-wider shadow-md">
              View All Sarees <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
             {loading ? Array.from({ length: 8 }).map((_, i) => <ProductSkeleton key={i} />) : bestSarees.map((product) => (
               <div key={product.id} className="bg-white rounded-2xl p-1 shadow-sm hover:shadow-xl transition-shadow border border-brand-gold/10">
                 <ProductCard product={product} />
               </div>
             ))}
          </div>
        </div>
      </section>

      {/* Deal of the Week */}
      {!loading && dealOfTheWeek && (
        <section className="py-16 bg-white">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-8">
            <div className="bg-brand-navy rounded-[2rem] overflow-hidden flex flex-col md:flex-row items-center shadow-2xl border border-brand-gold/20">
              <div className="w-full md:w-1/2 p-8 md:p-16 flex flex-col justify-center items-start relative z-10">
                <span className="text-brand-primary bg-white px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-[2px] mb-4 shadow-sm flex items-center gap-2">
                  <Clock className="w-3 h-3" /> Deal of the Week
                </span>
                <h2 className="text-3xl md:text-5xl text-white font-display mb-4 leading-tight">{dealOfTheWeek.name}</h2>
                <div className="flex items-center gap-3 mb-6">
                  {dealOfTheWeek.on_sale && <span className="text-gray-400 line-through text-lg">৳{dealOfTheWeek.regular_price}</span>}
                  <span className="text-3xl font-bold text-brand-gold">৳{dealOfTheWeek.price}</span>
                </div>
                <div className="w-full mb-8">
                  <div className="flex justify-between text-xs text-gray-300 mb-2"><span>Sold: 84%</span><span>Only 6 left!</span></div>
                  <div className="w-full bg-white/20 rounded-full h-2 overflow-hidden"><div className="bg-brand-primary h-full rounded-full" style={{ width: '84%' }}></div></div>
                </div>
                <Link to={`/product/${dealOfTheWeek.slug}`} className="inline-flex items-center gap-2 px-8 py-4 bg-brand-gold text-brand-navy rounded-full font-bold uppercase tracking-widest text-xs hover:bg-white transition-colors">
                  Grab This Deal <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
              <div className="w-full md:w-1/2 h-[300px] md:h-full relative bg-white">
                <img src={dealOfTheWeek.thumbnail} alt={dealOfTheWeek.name} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-r from-brand-navy to-transparent opacity-50 md:hidden" />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Bunon Heritage Story */}
      <section className="py-16 bg-[#f9f9f9]">
        <div className="max-w-[1000px] mx-auto px-4 sm:px-8 text-center">
          <HeartHandshake className="w-12 h-12 text-brand-gold mx-auto mb-6 opacity-80" />
          <h2 className="text-3xl md:text-4xl text-brand-navy font-semibold font-display mb-6">The Soul of Bunon</h2>
          <p className="text-gray-600 leading-relaxed md:text-lg mb-8 font-light">
            Every thread woven into a Bunon saree carries the legacy of our master artisans. We don't just sell clothes; we preserve the rich heritage of Bengal's handloom industry. By choosing Bunon, you are empowering local weaving communities and wearing a piece of history.
          </p>
          <img src="/image/Bestselling-Saree-banner-1-mobie-768x912.jpg" className="w-full max-w-[600px] mx-auto h-[250px] object-cover rounded-3xl shadow-lg grayscale-[20%] hover:grayscale-0 transition-all duration-700" alt="Bunon Heritage" />
        </div>
      </section>

      {/* New Arrivals */}
      <section className="py-10 bg-white border-b border-gray-100">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8">
          <div className="flex justify-between items-end mb-8">
            <div>
              <span className="text-brand-primary text-[10px] sm:text-xs font-semibold uppercase tracking-[2px] mb-2 block">Just Landed</span>
              <h2 className="text-3xl md:text-4xl text-brand-navy font-semibold font-display">The New Arrivals</h2>
            </div>
            <Link to="/shop" className="text-[11px] sm:text-[13px] font-semibold text-brand-navy uppercase tracking-[1px] flex items-center gap-1 border-b border-brand-navy pb-0.5 hover:text-brand-primary hover:border-brand-primary transition-all">
              View All <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-8 -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-3 lg:grid-cols-4 sm:overflow-visible no-scrollbar">
             {loading ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="w-[65vw] max-w-[280px] sm:w-full flex-shrink-0"><ProductSkeleton /></div>) : newArrivals.map((product) => (
                <div key={product.id} className="w-[65vw] max-w-[280px] sm:w-full flex-shrink-0 hover:shadow-lg transition-shadow rounded-2xl">
                  <ProductCard product={product} />
                </div>
             ))}
          </div>
        </div>
      </section>

      {/* Promo Banner */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-12">
        <Link to="/shop" className="block rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all group relative">
          <img src="/assets/images/bunon-saree-banner-6.webp" alt="Promo" className="w-full h-auto group-hover:scale-[1.02] transition-transform duration-700" loading="lazy" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-brand-navy/10 transition-colors mix-blend-multiply" />
        </Link>
      </div>

      {/* Recently Viewed */}
      {!loading && recentlyViewed.length > 0 && (
        <section className="py-12 bg-gray-50 border-t border-gray-200">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-8">
            <h3 className="text-xl md:text-2xl text-brand-navy font-semibold font-display mb-6">Inspired By Your Browsing</h3>
            <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 no-scrollbar">
              {recentlyViewed.map(product => (
                <div key={product.id} className="w-[160px] sm:w-[220px] flex-shrink-0 bg-white rounded-xl shadow-sm hover:shadow-md p-2">
                  <ProductCard product={product} />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Newsletter */}
      <section className="py-16">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8">
           <div className="bg-brand-navy rounded-[2rem] p-8 sm:p-20 text-center relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 right-0 w-64 h-64 bg-brand-primary/20 rounded-full blur-[80px]" />
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-brand-gold/20 rounded-full blur-[80px]" />
              
              <div className="relative z-10 max-w-2xl mx-auto">
                 <h2 className="text-3xl sm:text-4xl md:text-5xl text-white font-display mb-4">Join the Bunon Family</h2>
                 <p className="text-white/80 mb-8 text-sm sm:text-base">Subscribe to receive updates, access to exclusive deals, and more.</p>
                 <form className="flex flex-col sm:flex-row gap-3 sm:gap-0 sm:bg-white/10 sm:p-1.5 sm:rounded-full sm:backdrop-blur-md border border-white/10">
                    <input type="email" placeholder="Enter your email address" className="flex-1 bg-white/10 sm:bg-transparent border border-white/20 sm:border-none px-6 py-4 rounded-full sm:rounded-none text-white focus:outline-none placeholder:text-white/50 text-sm" required />
                    <button type="button" className="px-8 py-4 bg-brand-gold text-brand-navy font-semibold uppercase tracking-widest text-[12px] sm:text-sm rounded-full hover:bg-white transition-colors shadow-md">Subscribe</button>
                 </form>
              </div>
           </div>
        </div>
      </section>

      {/* Reviews */}
      <section className="py-16 bg-white border-t border-gray-100">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8">
          <div className="flex flex-col items-center text-center mb-12">
            <span className="text-brand-primary text-[10px] sm:text-xs font-semibold uppercase tracking-[2px] mb-2">Reviews</span>
            <h2 className="text-3xl md:text-4xl text-brand-navy font-semibold font-display">Stories from Bunon Lovers</h2>
          </div>
          
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
             {testimonials.map((t, idx) => (
               <div key={idx} className="bg-gray-50 border border-gray-100 p-6 sm:p-8 rounded-2xl text-center hover:bg-white hover:shadow-[0_15px_30px_rgba(0,0,0,0.06)] hover:-translate-y-1 transition-all duration-300">
                 <img src={t.img} alt={t.name} className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-4 border-white shadow-md mx-auto mb-4" loading="lazy" />
                 <div className="flex justify-center text-brand-gold text-sm sm:text-lg mb-4 tracking-widest">
                   <Star className="w-4 h-4 fill-brand-gold text-brand-gold" />
                   <Star className="w-4 h-4 fill-brand-gold text-brand-gold" />
                   <Star className="w-4 h-4 fill-brand-gold text-brand-gold" />
                   <Star className="w-4 h-4 fill-brand-gold text-brand-gold" />
                   <Star className="w-4 h-4 fill-brand-gold text-brand-gold" />
                 </div>
                 <p className="text-gray-600 italic text-[13px] sm:text-[15px] mb-5 leading-relaxed font-light">"{t.text}"</p>
                 <span className="text-brand-navy font-bold text-[11px] sm:text-[13px] uppercase tracking-widest mt-auto">- {t.name}</span>
               </div>
             ))}
          </div>
        </div>
      </section>

      {/* Floating Cart Button - VISIBLE ONLY IF CART HAS ITEMS */}
      {cartItemCount > 0 && (
        <motion.div 
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="fixed bottom-6 right-6 z-[999] flex flex-col items-center"
        >
          <Link to="/checkout" className="w-14 h-14 bg-brand-primary text-white rounded-full flex items-center justify-center shadow-[0_10px_25px_rgba(230,0,35,0.4)] hover:bg-[#b3001b] hover:scale-110 transition-all cursor-pointer relative group">
            <ShoppingCart className="w-6 h-6" />
            <span className="absolute -top-1 -right-1 bg-brand-gold text-brand-navy text-[11px] font-bold w-6 h-6 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
              {cartItemCount}
            </span>
            <span className="absolute right-16 px-3 py-1.5 bg-black text-white text-xs font-semibold rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
              View Cart
            </span>
          </Link>
        </motion.div>
      )}

    </div>
  );
}
