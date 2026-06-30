import { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getProduct, getProducts, Product, trackPixel } from '../lib/woocommerce';
import { useCart } from '../lib/store'; // Removed useWishlist
import { motion, AnimatePresence } from 'motion/react';
import { ShoppingBag, ArrowRight, ShieldCheck, Truck, RotateCcw, Phone, Zap } from 'lucide-react'; // Removed Heart
import ProductCard from '../components/products/ProductCard';

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addItem, buyNow, setIsOpen } = useCart();
  const [product, setProduct] = useState<Product | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [activeImage, setActiveImage] = useState(0);
  const sliderRef = useRef<HTMLDivElement>(null);
  
  const [selectedVariation, setSelectedVariation] = useState<any>(null);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.documentElement.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [id]);

  useEffect(() => {
    async function loadProduct() {
      if (!id) return;
      setLoading(true);
      const p = await getProduct(id);
      setProduct(p);
      if (p) {
        trackPixel('ViewContent', {
          content_name: p.name,
          content_category: p.categories[0]?.name,
          content_ids: [String(p.id)],
          content_type: 'product',
          contents: [{ id: String(p.id), quantity: 1 }],
          value: Number(p.price),
          currency: 'BDT'
        });
        if (p.variations?.length > 0) {
          setSelectedVariation(p.variations[0]);
        }
        
        const catSlug = p.categories[0]?.slug || 'All';
        const allProds = await getProducts(catSlug);
        setRelatedProducts(allProds.filter(prod => prod.id !== p.id).slice(0, 4));
      }
      setLoading(false);
    }
    loadProduct();
  }, [id]);

  const handleAddToCart = () => {
    if (!product) return;
    addItem(product, selectedVariation, 1);
    trackPixel('AddToCart', {
      content_name: product.name,
      content_category: product.categories[0]?.name,
      content_ids: [String(product.id)],
      content_type: 'product',
      contents: [{ id: String(product.id), quantity: 1 }],
      value: Number(selectedVariation?.price || product.price),
      currency: 'BDT'
    });
    setIsOpen(true);

    // 🕵️ INCOMPLETE AUTO CAPTURE FROM COOKIES ON ADD TO CART
    try {
      const getCookie = (name: string) => {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
        return null;
      };
      const savedPhone = getCookie('user_phone') || getCookie('billing_phone') || '';
      if (savedPhone && savedPhone.replace(/\D/g, '').length >= 11) {
        const savedName = decodeURIComponent(getCookie('user_name') || getCookie('billing_first_name') || 'Guest');
        const savedDistrict = decodeURIComponent(getCookie('billing_city') || '');
        const savedAddress = decodeURIComponent(getCookie('billing_address_1') || '');
        const fullAddress = savedDistrict ? `${savedAddress}, ${savedDistrict}` : savedAddress;
        
        const payload = {
          customer_name: savedName,
          phone: savedPhone.replace(/\D/g, ''),
          address: fullAddress,
          city: savedDistrict,
          cart_products: [{
            product_id: product.id,
            name: product.name,
            price: Number(selectedVariation?.price || product.price),
            quantity: 1,
            thumbnail: product.images?.[0]?.src || product.thumbnail || ''
          }]
        };
        fetch('/api/orders/save_to_wp.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).catch(() => {});
      }
    } catch (e) {}


  };

  const handleBuyNow = () => {
    if (!product) return;
    buyNow(product, selectedVariation, 1);
    trackPixel('InitiateCheckout', {
      content_name: product.name,
      value: Number(selectedVariation?.price || product.price),
      currency: 'BDT'
    });

    // 🕵️ INCOMPLETE AUTO CAPTURE FROM COOKIES ON BUY NOW
    try {
      const getCookie = (name: string) => {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
        return null;
      };
      const savedPhone = getCookie('user_phone') || getCookie('billing_phone') || '';
      if (savedPhone && savedPhone.replace(/\D/g, '').length >= 11) {
        const savedName = decodeURIComponent(getCookie('user_name') || getCookie('billing_first_name') || 'Guest');
        const savedDistrict = decodeURIComponent(getCookie('billing_city') || '');
        const savedAddress = decodeURIComponent(getCookie('billing_address_1') || '');
        const fullAddress = savedDistrict ? `${savedAddress}, ${savedDistrict}` : savedAddress;
        
        const payload = {
          customer_name: savedName,
          phone: savedPhone.replace(/\D/g, ''),
          address: fullAddress,
          city: savedDistrict,
          cart_products: [{
            product_id: product.id,
            name: product.name,
            price: Number(selectedVariation?.price || product.price),
            quantity: 1,
            thumbnail: product.images?.[0]?.src || product.thumbnail || ''
          }]
        };
        fetch('/api/orders/save_to_wp.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).catch(() => {});
      }
    } catch (e) {}



    navigate('/checkout');
  };

  const handleThumbnailClick = (idx: number) => {
    setActiveImage(idx);
    if (sliderRef.current) {
      const slideWidth = sliderRef.current.clientWidth;
      sliderRef.current.scrollTo({ left: slideWidth * idx, behavior: 'smooth' });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!product) return (
     <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Product not found.</p>
     </div>
  );

  const priceNum = Number(selectedVariation?.price || product.price);
  const regularNum = Number(selectedVariation?.regular_price || product.regular_price);
  const isSale = product.on_sale && regularNum > priceNum;
  const saveAmount = regularNum - priceNum;
  const savePercent = isSale ? Math.round((saveAmount / regularNum) * 100) : 0;
  
  const isOutOfStock = product.stock_status === 'outofstock';

  return (
    <div className="min-h-screen bg-gray-50 pt-6 sm:pt-10 pb-24 sm:pb-32">
      
      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-4 text-sm text-gray-500 flex items-center gap-1.5 flex-wrap">
          <Link className="hover:text-gray-900 transition-colors" to="/">Home</Link>
          <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
          <Link className="hover:text-gray-900 transition-colors" to="/shop">Shop</Link>
          <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-gray-900 font-medium truncate">{product.name}</span>
        </nav>

        <div className="bg-white rounded-2xl sm:rounded-3xl border border-black/5 shadow-sm overflow-hidden mb-8 p-4 sm:p-8">
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
             
             {/* Product Gallery */}
             <div className="block w-full overflow-hidden">
                
                {/* Main Image Slider */}
                <div 
                  ref={sliderRef}
                  className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide bg-gray-50 rounded-2xl border border-black/5 relative mb-4"
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    const scrollPosition = el.scrollLeft;
                    const width = el.clientWidth;
                    const newActive = Math.round(scrollPosition / width);
                    if(newActive !== activeImage) setActiveImage(newActive);
                  }}
                >
                  {product.images.map((img, idx) => (
                    <div key={idx} className="w-full flex-shrink-0 snap-center aspect-square relative">
                      <img 
                        src={img.src || '/assets/images/placeholder-300x300.webp'} 
                        className="w-full h-full object-cover" 
                        alt={`${product.name} - Image ${idx + 1}`}
                      />
                    </div>
                  ))}

                  {/* Badges */}
                  <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
                    {isSale && !isOutOfStock && (
                      <span className="inline-flex items-center rounded-full bg-brand-primary/90 text-white backdrop-blur-md border border-brand-primary px-3 py-1 text-[11px] uppercase tracking-wider font-bold shadow-md">
                        Save {savePercent}%
                      </span>
                    )}
                    {isOutOfStock && (
                      <span className="inline-flex items-center rounded-full bg-red-600/90 text-white backdrop-blur-md border border-red-600 px-3 py-1 text-[11px] uppercase tracking-wider font-bold shadow-md">
                        Out of Stock
                      </span>
                    )}
                  </div>
                </div>

                {/* All Devices Thumbnail Gallery (Scrollable on Mobile) */}
                {product.images.length > 1 && (
                  <div className="flex overflow-x-auto gap-2 sm:gap-3 scrollbar-hide pb-2">
                    {product.images.map((img, idx) => (
                      <button 
                        key={idx} 
                        onClick={() => handleThumbnailClick(idx)} 
                        className={`flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 aspect-square rounded-xl overflow-hidden border-2 transition-all ${activeImage === idx ? 'border-brand-primary shadow-sm' : 'border-transparent hover:border-gray-200'} bg-gray-50`}
                      >
                        <img src={img.src} className="w-full h-full object-cover" alt="" />
                      </button>
                    ))}
                  </div>
                )}
             </div>

             {/* Product Info */}
             <div className="flex flex-col space-y-6">
                <div>
                   <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 tracking-tight leading-tight mb-3">
                     {product.name}
                   </h1>
                   
                   <div className="flex items-end gap-3 flex-wrap mb-4">
                      <span className="text-3xl font-bold text-brand-primary tabular-nums">
                        ৳{priceNum.toLocaleString()}
                      </span>
                      {isSale && !isOutOfStock && (
                        <>
                          <span className="text-lg text-gray-400 line-through tabular-nums mb-1">
                            ৳{regularNum.toLocaleString()}
                          </span>
                          <span className="inline-flex items-center rounded-full mb-2 bg-green-50 text-green-600 border border-green-200 px-2 py-0.5 text-xs font-semibold">
                            Save ৳{saveAmount.toLocaleString()}
                          </span>
                        </>
                      )}
                   </div>

                   {/* Professional Short Description */}
                   {product.short_description && (
                     <div 
                       className="text-sm sm:text-base text-gray-500 leading-relaxed border-l-2 border-gray-200 pl-4 py-1"
                       dangerouslySetInnerHTML={{ __html: product.short_description }}
                     />
                   )}
                </div>

                {/* Variations */}
                {product.variations && product.variations.length > 0 && !isOutOfStock && (
                  <div className="space-y-3 pt-6 border-t border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-900">Select Variant:</h3>
                    <div className="flex flex-wrap gap-2">
                      {product.variations.map((v: any) => (
                        <button 
                          key={v.databaseId} 
                          onClick={() => setSelectedVariation(v)} 
                          className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${selectedVariation?.databaseId === v.databaseId ? 'bg-brand-primary/10 border-brand-primary text-brand-primary' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                        >
                          {v.name.replace(`${product.name} - `, '')}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Call To Actions (Side by Side on All Devices) */}
                <div className="flex gap-2 sm:gap-3 pt-6 mt-6 border-t border-gray-100">
                   {!isOutOfStock ? (
                     <>
                       <button 
                         onClick={handleAddToCart} 
                         className="flex-1 h-12 sm:h-14 flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl bg-[#2563EB] border border-[#1d4ed8] text-white text-[11px] sm:text-sm font-bold uppercase tracking-widest hover:bg-[#1d4ed8] active:scale-95 transition-all shadow-md shadow-blue-500/20"
                       >
                         <ShoppingBag className="w-4 h-4 sm:w-5 sm:h-5" /> Add to Cart
                       </button>
                       <button 
                         onClick={handleBuyNow} 
                         className="flex-1 h-12 sm:h-14 flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl bg-brand-primary text-white text-[11px] sm:text-sm font-bold uppercase tracking-widest shadow-md shadow-brand-primary/20 hover:brightness-110 active:scale-95 transition-all"
                       >
                         <Zap className="w-4 h-4 sm:w-5 sm:h-5 fill-current" /> Order Now
                       </button>
                     </>
                   ) : (
                     <div className="flex-1 h-12 sm:h-14 flex items-center justify-center rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs sm:text-base font-bold uppercase tracking-widest">
                       Currently Out of Stock
                     </div>
                   )}
                </div>

                {/* Features */}
                <div className="grid grid-cols-2 gap-3 pt-6 mt-auto">
                   <div className="flex items-center gap-2.5 bg-gray-50 px-3 py-2 rounded-lg border border-gray-100">
                      <Truck className="w-4 h-4 text-brand-primary" />
                      <span className="text-xs font-medium text-gray-700">Fast Delivery</span>
                   </div>
                   <div className="flex items-center gap-2.5 bg-gray-50 px-3 py-2 rounded-lg border border-gray-100">
                      <ShieldCheck className="w-4 h-4 text-brand-primary" />
                      <span className="text-xs font-medium text-gray-700">Secure Checkout</span>
                   </div>
                   <div className="flex items-center gap-2.5 bg-gray-50 px-3 py-2 rounded-lg border border-gray-100">
                      <RotateCcw className="w-4 h-4 text-brand-primary" />
                      <span className="text-xs font-medium text-gray-700">Easy Exchange</span>
                   </div>
                   <div className="flex items-center gap-2.5 bg-gray-50 px-3 py-2 rounded-lg border border-gray-100">
                      <Phone className="w-4 h-4 text-brand-primary" />
                      <span className="text-xs font-medium text-gray-700">24/7 Support</span>
                   </div>
                </div>
             </div>
           </div>
        </div>

        {/* Details Section */}
        {product.description && (
          <div className="bg-white rounded-2xl sm:rounded-3xl border border-black/5 shadow-sm p-6 sm:p-8 mb-12">
             <h2 className="text-xl font-bold text-gray-900 mb-6">Product Details</h2>
             <div 
               className="markdown-body prose prose-sm sm:prose-base max-w-none text-gray-600"
               dangerouslySetInnerHTML={{ __html: product.description }} 
             />
          </div>
        )}
        
        {/* Related Products */}
        {relatedProducts.length > 0 && (
          <div className="mt-8 mb-4">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">You Might Also Like</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              {relatedProducts.map(rp => (
                <div key={rp.id}>
                  <ProductCard product={rp} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 🚀 Mobile Sticky Bottom Action Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 flex items-center justify-between z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        <div className="flex flex-col">
          {isSale ? (
            <>
              <span className="text-lg font-bold text-brand-primary leading-none">৳{priceNum.toLocaleString()}</span>
              <span className="text-xs text-gray-400 line-through mt-0.5">৳{regularNum.toLocaleString()}</span>
            </>
          ) : (
            <span className="text-lg font-bold text-brand-primary leading-none">৳{priceNum.toLocaleString()}</span>
          )}
        </div>
        
        {!isOutOfStock ? (
          <button 
            onClick={handleBuyNow}
            className="flex-1 ml-4 h-11 flex items-center justify-center gap-2 rounded-xl bg-brand-primary text-white text-sm font-bold uppercase tracking-wider shadow-md shadow-brand-primary/20 hover:brightness-110 active:scale-95 transition-all"
          >
            <Zap className="w-4 h-4 fill-current" /> Order Now
          </button>
        ) : (
          <div className="flex-1 ml-4 h-11 flex items-center justify-center rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-bold uppercase tracking-wider">
            Out of Stock
          </div>
        )}
      </div>

    </div>
  );
}
