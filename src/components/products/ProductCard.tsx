import { Link, useNavigate } from 'react-router-dom';
import { ShoppingBag, Heart } from 'lucide-react';
import { Product } from '../../lib/woocommerce';
import { useCart, useWishlist } from '../../lib/store';

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const { addItem, buyNow, setIsOpen } = useCart();
  const { toggleItem, isInWishlist } = useWishlist();
  const navigate = useNavigate();

  // স্ট্যাটাস চেক (woocommerce এর ডাটা অনুযায়ী 'outofstock' বা 'out_of_stock' হতে পারে)
  const isOutOfStock = product.stock_status === 'outofstock' || product.stock_status === 'out_of_stock';

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOutOfStock) return;
    addItem(product);
    setIsOpen(true);
    
    // 🕵️ INCOMPLETE AUTO CAPTURE FROM COOKIES
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
            price: Number(product.price),
            quantity: 1
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

  const handleToggleWishlist = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleItem(product);
  };

  const isFavorite = isInWishlist(product.id);
  const priceNum = Number(product.price);
  const regularNum = Number(product.regular_price);
  const isSale = product.on_sale && regularNum > priceNum;
  const saveAmount = regularNum - priceNum;
  const savePercent = isSale ? Math.round((saveAmount / regularNum) * 100) : 0;

  return (
    <div className="group relative h-full flex flex-col overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm hover:shadow-md transition-[box-shadow,border-color] duration-200 ease-out hover:border-brand-primary/30">
      
      <div className="relative w-full overflow-hidden bg-gray-50 aspect-square">
        <Link to={`/product/${product.id}`} className="absolute inset-0 block z-0">
          <img 
            src={product.images[0]?.src || 'https://bunonfabrics.com/wp-content/uploads/woocommerce-placeholder-300x300.webp'} 
            alt={product.name} 
            className="absolute inset-0 w-full h-full object-cover transition-all duration-700 group-hover:scale-[1.03]"
            loading="lazy"
          />
        </Link>

        {/* Labels/Badges (Dynamic Tags) */}
        <div className="absolute top-2 left-2 flex flex-col items-start gap-1 z-10">
          {/* Out of Stock Label */}
          {isOutOfStock && (
            <span className="inline-flex items-center rounded-full bg-red-600 text-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest">
              Sold Out
            </span>
          )}
          
          {/* Dynamic Tags from WooCommerce */}
          {product.tags && product.tags.slice(0, 2).map((tag: any) => (
            <span key={tag.id} className="inline-flex items-center rounded-full bg-white/90 text-gray-900 px-2 py-0.5 text-[10px] font-semibold uppercase">
              {tag.name}
            </span>
          ))}
        </div>

        {isSale && !isOutOfStock && (
          <span className="absolute top-2 right-2 z-10 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
            Save {savePercent}%
          </span>
        )}

        <button 
          type="button" 
          onClick={handleToggleWishlist}
          className={`absolute bottom-2 right-2 z-10 inline-flex items-center justify-center w-8 h-8 rounded-full border shadow-sm transition-all duration-200 ${
            isFavorite ? 'bg-brand-primary border-brand-primary text-white' : 'bg-white border-black/5 text-gray-700'
          }`}
        >
          <Heart className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
        </button>
      </div>

      <div className="flex flex-col gap-1 p-3.5 pt-2.5 flex-1">
        <Link to={`/product/${product.id}`}>
          <h3 className="text-[13px] font-semibold leading-tight line-clamp-2 text-gray-900 hover:text-brand-primary">
            {product.name}
          </h3>
        </Link>
        
        {/* Price Section */}
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <span className="text-[16px] font-bold text-brand-primary">
            {product.displayPrice || `৳${priceNum.toLocaleString()}`}
          </span>
        </div>
        
        <div className="grow min-h-[5px]" />
        
        {/* Cart Button with Conditional Rendering */}
        <button 
          type="button" 
          disabled={isOutOfStock}
          onClick={handleAddToCart}
          className={`inline-flex items-center justify-center gap-1.5 h-8 w-full rounded-md text-xs font-semibold transition-all duration-200 ${
            isOutOfStock 
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-none' 
              : 'bg-transparent text-brand-primary border border-brand-primary/40 hover:bg-brand-primary hover:text-white'
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          <span>{isOutOfStock ? 'Out of Stock' : 'Add to cart'}</span>
        </button>
      </div>
    </div>
  );
}
