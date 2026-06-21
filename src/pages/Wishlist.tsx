import { useWishlist } from '@/src/lib/store';
import ProductCard from '../components/products/ProductCard';
import { Heart, ShoppingBag } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';

export default function Wishlist() {
  const { items } = useWishlist();

  if (items.length === 0) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-100 mb-6">
            <Heart className="w-10 h-10 text-gray-400" />
          </div>
          <h1 className="text-2xl font-display font-bold text-gray-900 mb-4">Your wishlist is empty</h1>
          <p className="text-gray-500 mb-8 max-w-sm mx-auto">
            Save your favorite sarees and accessories to view them later.
          </p>
          <Link 
            to="/shop" 
            className="inline-flex items-center gap-2 h-12 px-8 rounded-full bg-brand-primary text-white font-bold hover:bg-red-700 transition-colors"
          >
            <ShoppingBag className="w-5 h-5" />
            <span>Go to Shop</span>
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-center justify-between mb-8 border-b border-black/5 pb-6">
        <h1 className="text-3xl font-display font-bold text-gray-900">
          My Wishlist <span className="text-gray-400 text-lg ml-2 font-sans font-normal">({items.length} items)</span>
        </h1>
        <Link 
          to="/shop" 
          className="text-sm font-bold text-brand-primary hover:underline"
        >
          Continue Shopping
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-8">
        {items.map((product) => (
          <motion.div 
            key={product.id}
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
          >
            <ProductCard product={product} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
