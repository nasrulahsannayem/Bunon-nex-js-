import { useCart } from '../../lib/store';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShoppingBag, Plus, Minus, Trash2, ArrowRight, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function CartDrawer() {
  const { items, isOpen, setIsOpen, updateQuantity, removeItem, total } = useCart();
  const navigate = useNavigate();

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  // [SAFETY FALLBACK]: If global total returns 0 but items exist, calculate dynamically on the fly
  const displayTotal = total > 0 ? total : items.reduce((sum, item) => {
    const numericPrice = Number(String(item.price).replace(/[^0-9.-]+/g, '')) || 0;
    return sum + (numericPrice * item.quantity);
  }, 0);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-brand-navy/60 backdrop-blur-md z-[200]"
          />
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white z-[210] flex flex-col shadow-[-20px_0_50px_rgba(0,0,0,0.1)]"
          >
            <div className="p-8 border-b border-black/5 flex justify-between items-center bg-white sticky top-0 z-20">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-brand-navy/5 rounded-xl">
                  <ShoppingBag className="w-5 h-5 text-brand-navy" />
                </div>
                <div>
                   <h2 className="text-xl font-display font-medium">Shopping Bag</h2>
                   <p className="text-[10px] font-black uppercase tracking-widest text-brand-navy/40">
                     {itemCount} Piece{itemCount !== 1 ? 's' : ''} Selected
                   </p>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-3 hover:bg-brand-gray rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar bg-brand-gray/30">
              {items.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-6">
                  <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-sm">
                     <ShoppingBag className="w-8 h-8 text-brand-navy/10" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-display">Bag is Empty</h3>
                    <p className="text-[10px] text-brand-navy/40 font-medium">Your heritage collection awaits.</p>
                  </div>
                  <button 
                    onClick={() => {
                      setIsOpen(false);
                      navigate('/shop');
                    }}
                    className="bg-brand-navy text-white text-[10px] font-black uppercase tracking-widest px-8 py-4 rounded-xl hover:bg-brand-ruby transition-all"
                  >
                    Start Selection
                  </button>
                </div>
              ) : (
                items.map((item) => {
                  const cartItemId = item.selectedVariation ? `${item.id}-${item.selectedVariation.databaseId}` : item.id;
                  return (
                    <motion.div 
                      layout
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      key={cartItemId} 
                      className="flex gap-6 group"
                    >
                      <div className="w-24 h-32 bg-white rounded-2xl overflow-hidden shrink-0 shadow-sm border border-black/5 group-hover:border-brand-ruby transition-colors">
                        <img src={item.images[0]?.src} alt={item.name} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 flex flex-col justify-between py-1">
                        <div>
                          <h3 className="text-sm text-brand-navy leading-snug mb-1 font-bold line-clamp-2 uppercase tracking-tight">{item.name}</h3>
                          {item.selectedVariation && (
                            <span className="text-[9px] font-black text-brand-gold uppercase tracking-widest block mb-2">
                              {item.selectedVariation.name.replace(`${item.name} - `, '')}
                            </span>
                          )}
                          <div className="flex items-center gap-3">
                             <span className="text-sm font-bold text-brand-navy">৳{Number(String(item.price).replace(/[^0-9.-]+/g, '')).toLocaleString()}</span>
                          </div>
                          
                          <div className="flex items-center mt-4">
                            <div className="flex items-center bg-white rounded-xl px-2 py-1 border border-black/5">
                              <button onClick={() => updateQuantity(cartItemId, -1)} className="p-1.5 hover:text-brand-ruby transition-colors">
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="text-xs w-8 text-center font-bold px-1">{item.quantity}</span>
                              <button onClick={() => updateQuantity(cartItemId, 1)} className="p-1.5 hover:text-brand-ruby transition-colors">
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                        <button 
                          onClick={() => removeItem(cartItemId)}
                          className="text-brand-navy/30 hover:text-brand-ruby transition-colors w-fit flex items-center gap-2 mt-2 group/remove"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span className="text-[9px] font-black uppercase tracking-widest">Remove Piece</span>
                        </button>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>

            {items.length > 0 && (
              <div className="p-8 bg-white border-t border-black/5 space-y-6">
                <div className="flex justify-between items-center text-brand-navy">
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40">Subtotal Collection</span>
                  {/* Fixed to use displayTotal */}
                  <span className="text-xl font-bold font-mono">৳{displayTotal.toLocaleString()}</span>
                </div>
                <button 
                  onClick={() => {
                    setIsOpen(false);
                    navigate('/checkout');
                  }}
                  className="w-full bg-brand-navy text-white py-5 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-2xl hover:bg-brand-ruby transition-all flex items-center justify-center gap-4 active:scale-95"
                >
                  Proceed to Checkout <ArrowRight className="w-4 h-4" />
                </button>
                <div className="flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-widest text-brand-navy/30">
                   <ShieldCheck className="w-3 h-3" />
                   <span>Authenticated Handloom Selection</span>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
