import { motion, AnimatePresence } from 'motion/react';
import { X, ShoppingBag, ArrowRight, Zap } from 'lucide-react';
import { Product } from '@/src/lib/woocommerce';
import { useCart } from '@/src/lib/store';
import { useNavigate } from 'react-router-dom';

interface ProductModalProps {
  product: Product | null;
  onClose: () => void;
}

export default function ProductModal({ product, onClose }: ProductModalProps) {
  const { addItem, buyNow } = useCart();
  const navigate = useNavigate();

  if (!product) return null;

  const handleBuyNow = () => {
    buyNow(product);
    onClose();
    navigate('/checkout');
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-stone-900/60 backdrop-blur-md"
        />
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-5xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row h-full max-h-[800px]"
        >
          {/* Close Button */}
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 z-10 p-2 bg-white/80 backdrop-blur-sm rounded-full hover:bg-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Image */}
          <div className="w-full md:w-1/2 h-[40vh] md:h-full bg-stone-100">
            <img 
              src={product.images[0]?.src} 
              alt={product.name}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>

          {/* Details */}
          <div className="w-full md:w-1/2 p-8 md:p-16 flex flex-col overflow-y-auto">
            <div className="mb-8">
              <span className="text-xs font-bold uppercase tracking-[0.3em] text-stone-400 mb-4 block">
                {product.categories.map(c => c.name).join(' • ')}
              </span>
              <h2 className="text-3xl md:text-5xl font-serif font-light mb-6 leading-tight tracking-tight text-stone-900">
                {product.name}
              </h2>
              <div className="flex items-center gap-4 mb-8">
                <span className="text-2xl font-semibold text-stone-900">৳{product.price}</span>
                {product.regular_price && (
                  <span className="text-lg text-stone-400 line-through">৳{product.regular_price}</span>
                )}
              </div>
              <div className="w-12 h-[1px] bg-stone-200" />
            </div>

            <div className="flex-1 space-y-8">
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-4">Description</h4>
                <p className="text-stone-600 leading-relaxed text-lg font-light">
                  {product.description}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 pt-8">
                <button 
                  onClick={handleBuyNow}
                  className="flex-1 bg-brand-black text-white py-5 rounded-full font-bold uppercase tracking-widest text-[10px] flex items-center justify-center gap-4 hover:bg-brand-accent hover:text-brand-black transition-all shadow-2xl"
                >
                  <Zap className="w-5 h-5 fill-current" /> Buy it Now
                </button>
                <button 
                  onClick={() => {
                    addItem(product);
                    onClose();
                  }}
                  className="flex-1 border border-black/10 text-brand-black py-5 rounded-full font-semibold uppercase tracking-widest text-[10px] flex items-center justify-center gap-3 hover:bg-brand-gray transition-all shadow-sm"
                >
                  <ShoppingBag className="w-5 h-5" />
                  Bag it
                </button>
              </div>
            </div>

            <div className="mt-12 pt-8 border-t border-stone-100 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-stone-400">
               <div className="flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-green-500" />
                 In Stock & Ready to Ship
               </div>
               <span>SKU: AR-{product.id}-001</span>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
