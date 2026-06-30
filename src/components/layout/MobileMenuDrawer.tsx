import { motion, AnimatePresence } from 'framer-motion';
import { X, Store, Package, PhoneCall, MessageCircle, Info, ShieldCheck, HelpCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface MobileMenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MobileMenuDrawer({ isOpen, onClose }: MobileMenuDrawerProps) {
  const navigate = useNavigate();

  const handleNavigation = (path: string) => {
    onClose();
    navigate(path);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[50] md:hidden"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 left-0 w-[280px] sm:w-[320px] bg-white z-[51] shadow-2xl flex flex-col md:hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Menu</h2>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-gray-200 transition-colors text-gray-500 hover:text-gray-900"
              >
                <X className="w-5 h-5" strokeWidth={2.5} />
              </button>
            </div>

            {/* Content (Scrollable) */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
              
              {/* Store Navigation */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-2">Store</p>
                <button onClick={() => handleNavigation('/shop')} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-brand-primary/5 hover:text-brand-primary transition-colors text-gray-700 text-left">
                  <Store className="w-5 h-5 text-brand-primary" />
                  <span className="font-semibold">Shop All Products</span>
                </button>
                <button onClick={() => handleNavigation('/track')} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-brand-primary/5 hover:text-brand-primary transition-colors text-gray-700 text-left">
                  <Package className="w-5 h-5 text-blue-500" />
                  <span className="font-semibold">Track Your Order</span>
                </button>
              </div>

              <div className="h-px bg-gray-100 my-4 w-full"></div>

              {/* Support */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-2">Support</p>
                <a href="tel:09611900606" className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-green-50 hover:text-green-600 transition-colors text-gray-700">
                  <PhoneCall className="w-5 h-5 text-green-500" />
                  <span className="font-semibold">Call Hotline</span>
                </a>
                <a href="https://wa.me/8801700000000" target="_blank" rel="noreferrer" className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#25D366]/10 hover:text-[#25D366] transition-colors text-gray-700">
                  <MessageCircle className="w-5 h-5 text-[#25D366]" />
                  <span className="font-semibold">WhatsApp Chat</span>
                </a>
              </div>

              <div className="h-px bg-gray-100 my-4 w-full"></div>

              {/* Information */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-2">Information</p>
                <button onClick={() => handleNavigation('/about')} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-100 transition-colors text-gray-600 text-left">
                  <Info className="w-5 h-5 text-gray-400" />
                  <span className="font-medium text-sm">About Us</span>
                </button>
                <button onClick={() => handleNavigation('/privacy')} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-100 transition-colors text-gray-600 text-left">
                  <ShieldCheck className="w-5 h-5 text-gray-400" />
                  <span className="font-medium text-sm">Privacy Policy</span>
                </button>
                <button onClick={() => handleNavigation('/terms')} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-100 transition-colors text-gray-600 text-left">
                  <HelpCircle className="w-5 h-5 text-gray-400" />
                  <span className="font-medium text-sm">Terms & Conditions</span>
                </button>
              </div>

            </div>

            {/* Footer */}
            <div className="p-6 bg-gray-50 border-t border-gray-100">
              <p className="text-xs text-center text-gray-500 font-medium">&copy; {new Date().getFullYear()} Bunon Shop.</p>
              <p className="text-[10px] text-center text-gray-400 mt-1">All rights reserved.</p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
