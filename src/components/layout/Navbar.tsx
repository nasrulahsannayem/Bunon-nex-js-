import { ShoppingCart, Search, Home as HomeIcon, Heart, X, Store, PhoneCall, User, Package, Menu } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart, useWishlist } from '@/src/lib/store';
import CartDrawer from '../cart/CartDrawer';
import MobileMenuDrawer from './MobileMenuDrawer';
import { searchProducts } from '../../lib/woocommerce'; // 🚀 FIXED: Correct relative path

export default function Navbar() {
  const { items: cartItems, setIsOpen } = useCart();
  const { items: wishlistItems } = useWishlist();
  const [isScrolled, setIsScrolled] = useState(false);
  
  // Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  
  const location = useLocation();
  const navigate = useNavigate();

  const userStr = localStorage.getItem('bunon_user');
  let isAdmin = false;
  try {
    if (userStr) {
      const user = JSON.parse(userStr);
      isAdmin = user.role === 'admin' || user.role === 'staff';
    }
  } catch (e) {}

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close search when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close mobile search and dropdown when route changes
  useEffect(() => {
    setIsMobileSearchOpen(false);
    setShowDropdown(false);
    setSearchQuery('');
  }, [location.pathname]);

  // 🚀 FIXED: Live Search Logic (Real WooCommerce API)
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length >= 2) {
        setIsSearching(true);
        setShowDropdown(true);
        try {
          const results = await searchProducts(searchQuery.trim());
          
          if (results && Array.isArray(results)) {
            setSearchResults(results.slice(0, 6)); // Limit to 6 results
          } else {
            setSearchResults([]);
          }
        } catch (error) {
          console.error("Search failed:", error);
          setSearchResults([]);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults([]);
        setShowDropdown(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setShowDropdown(false);
    setIsMobileSearchOpen(false);
    navigate(`/shop?search=${encodeURIComponent(searchQuery.trim())}`);
  };

  // 🚀 FIXED: Guaranteed Navigation before Dropdown unmounts
  const handleProductClick = (e: React.MouseEvent, url: string) => {
    e.preventDefault(); 
    navigate(url); 
    setShowDropdown(false); 
    setIsMobileSearchOpen(false);
  };

  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const wishlistCount = wishlistItems.length;

  return (
    <>
      <header 
        className={`sticky top-0 z-[100] transition-colors duration-200 relative ${
          isScrolled ? 'bg-white/95 backdrop-blur-md border-b border-black/10 shadow-sm' : 'bg-white border-b border-black/5'
        }`}
      >
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="flex justify-between items-center h-16 relative">
            
            {/* 🚀 FIXED: Logo Implementation */}
            <Link to="/" className="flex-shrink-0 flex items-center pr-8">
              <img 
                src="/image/shop logo.png" 
                alt="Bunon Fabrics" 
                className="h-8 sm:h-10 w-auto object-contain"
                onError={(e) => {
                  // Fallback in case of filename variations without space
                  e.currentTarget.src = '/image/shoplogo.png';
                }}
              />
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600">
              <Link to="/shop" className="text-brand-primary font-bold hover:opacity-90 transition-all">Shop</Link>
              <Link to="/shop?cat=saree" className="hover:text-brand-primary transition-colors">Saree</Link>
              <Link to="/shop?filter=best-selling" className="hover:text-brand-primary transition-colors">Best Selling</Link>
              <Link to="/shop?filter=free-shipping" className="hover:text-brand-primary transition-colors">Free Shipping</Link>
            </nav>

            {/* Desktop & Mobile Actions */}
            <div className="flex-1 flex justify-end items-center gap-2 relative">
              
              {/* Desktop Search */}
              <div className="hidden sm:flex relative" ref={searchRef}>
                <form 
                  onSubmit={handleSearchSubmit} 
                  className="flex items-center gap-2 h-9 px-3 rounded-full bg-gray-100 focus-within:bg-gray-50 focus-within:ring-1 focus-within:ring-brand-primary/50 text-gray-500 transition-all mr-2 text-sm w-full max-w-[240px]"
                >
                  <button type="submit" aria-label="Submit Search">
                    <Search className="w-4 h-4 text-gray-400 hover:text-brand-primary transition-colors" />
                  </button>
                  <input 
                    type="text"
                    placeholder="Search products/SKU..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => { if(searchQuery.length >= 2) setShowDropdown(true); }}
                    className="w-full bg-transparent text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none outline-none border-none p-0"
                  />
                  {searchQuery && (
                    <button type="button" onClick={() => {setSearchQuery(''); setShowDropdown(false);}} className="text-gray-400 hover:text-gray-600">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </form>

                {/* Desktop Live Search Dropdown */}
                <AnimatePresence>
                  {showDropdown && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute top-12 right-2 w-[340px] bg-white border border-gray-100 shadow-2xl rounded-xl overflow-hidden z-[60]"
                    >
                      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                         <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Search Results</span>
                         {isSearching && <span className="text-[10px] text-brand-primary animate-pulse font-medium">Searching...</span>}
                      </div>
                      
                      <div className="max-h-[320px] overflow-y-auto">
                        {searchResults.length > 0 ? (
                          searchResults.map((product) => (
                            <Link 
                              key={product.id} 
                              to={`/product/${product.id}`} // 🚀 mapped to product.id
                              onClick={(e) => handleProductClick(e, `/product/${product.id}`)}
                              className="flex items-center gap-3 p-3 hover:bg-brand-primary/5 transition-colors border-b border-gray-50 last:border-0"
                            >
                              <img 
                                src={product.images?.[0]?.src || '/placeholder.png'} // 🚀 mapped to real image
                                alt={product.name} 
                                className="w-12 h-12 object-cover rounded-md bg-gray-100 border border-black/5"
                              />
                              <div className="flex-1 min-w-0">
                                <h4 className="text-[13px] font-semibold text-gray-900 truncate leading-tight">{product.name}</h4>
                                <div className="text-[11px] text-gray-500 font-mono mt-1 flex items-center justify-between">
                                  <span>{product.sku ? `SKU: ${product.sku}` : ''}</span>
                                  <span className="text-brand-primary font-bold">৳{product.price}</span>
                                </div>
                              </div>
                            </Link>
                          ))
                        ) : !isSearching ? (
                          <div className="p-6 text-center text-xs text-gray-400">
                            No products found for "{searchQuery}"
                          </div>
                        ) : null}
                      </div>
                      {searchResults.length > 0 && (
                        <div className="p-2 border-t border-gray-100 text-center bg-gray-50">
                          <button 
                            onClick={handleSearchSubmit}
                            className="text-xs font-bold text-brand-primary hover:underline w-full py-1"
                          >
                            View all results →
                          </button>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Mobile Search Trigger */}
              <button 
                onClick={() => setIsMobileSearchOpen(!isMobileSearchOpen)}
                className="p-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors sm:hidden"
                aria-label="Toggle mobile search"
              >
                <Search className="w-5 h-5" />
              </button>
              
              <Link 
                to="/wishlist" 
                className="hidden sm:flex p-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors relative"
                aria-label="Wishlist"
              >
                <Heart className="w-5 h-5" />
                {wishlistCount > 0 && (
                  <span className="absolute top-1 right-1 bg-brand-primary text-white text-[10px] font-bold h-4 w-4 min-w-[16px] flex items-center justify-center rounded-full leading-none shadow-sm">
                    {wishlistCount}
                  </span>
                )}
              </Link>

              <div className="relative group">
                <Link 
                  to="/profile" 
                  className="flex p-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                  aria-label="Profile"
                >
                  <User className="w-5 h-5" />
                </Link>
                {/* Profile Dropdown Modal (Shows on Hover for Desktop) */}
                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                  <div className="p-2">
                    {localStorage.getItem('bunon_token') ? (
                      <>
                        <Link to="/profile" className="block px-4 py-2 text-sm text-gray-700 hover:bg-brand-primary/5 hover:text-brand-primary rounded-lg transition-colors">আমার প্রোফাইল</Link>
                        <Link to="/profile" className="block px-4 py-2 text-sm text-gray-700 hover:bg-brand-primary/5 hover:text-brand-primary rounded-lg transition-colors">আমার অর্ডার</Link>
                        <button 
                          onClick={() => {
                            localStorage.removeItem('bunon_token');
                            localStorage.removeItem('bunon_user');
                            window.location.href = '/';
                          }}
                          className="w-full text-left block px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          লগআউট
                        </button>
                      </>
                    ) : (
                      <>
                        <Link to="/login" className="block px-4 py-2 text-sm font-medium text-brand-primary hover:bg-brand-primary/5 rounded-lg transition-colors">লগইন করুন</Link>
                        <Link to="/login" state={{ isSignUp: true }} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors">নতুন অ্যাকাউন্ট</Link>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setIsOpen(true)}
                className="relative p-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                aria-label="Cart"
              >
                <ShoppingCart className="w-5 h-5" />
                {itemCount > 0 && (
                  <span className="absolute top-1 right-1 bg-gray-900 text-white text-[10px] font-bold h-4 w-4 min-w-[16px] flex items-center justify-center rounded-full leading-none shadow-sm">
                    {itemCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 🚀 FIXED: Mobile Animated Search Bar Expand Dropdown */}
        <AnimatePresence>
          {isMobileSearchOpen && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="sm:hidden absolute top-full left-0 right-0 w-full bg-white shadow-xl z-[150] border-b border-gray-200"
            >
              <div className="p-3">
                <form onSubmit={handleSearchSubmit} className="flex items-center bg-gray-100 rounded-xl px-3 h-11 w-full focus-within:ring-2 focus-within:ring-brand-primary/30">
                  <button type="submit" aria-label="Submit Search" className="p-1">
                    <Search className="w-4 h-4 text-gray-400 shrink-0 hover:text-brand-primary" />
                  </button>
                  <input 
                    type="text"
                    placeholder="Search products/SKU..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => { if(searchQuery.length >= 2) setShowDropdown(true); }}
                    className="w-full bg-transparent pl-2 text-sm text-gray-900 focus:outline-none outline-none border-none"
                    autoFocus
                  />
                  {searchQuery && (
                    <button 
                      type="button" 
                      onClick={() => { setIsMobileSearchOpen(false); setSearchQuery(''); setShowDropdown(false); }}
                      className="p-1 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </form>
              </div>

              {/* 🚀 FIXED: Mobile Live Search Results */}
              <AnimatePresence>
                {showDropdown && searchQuery.length >= 2 && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="w-full bg-white max-h-[50vh] overflow-y-auto pb-4"
                  >
                    {searchResults.length > 0 ? (
                      searchResults.map((product) => (
                        <Link 
                          key={product.id} 
                          to={`/product/${product.id}`} // 🚀 mapped to product.id
                          onClick={(e) => handleProductClick(e, `/product/${product.id}`)}
                          className="flex items-center gap-3 p-3 hover:bg-brand-primary/5 transition-colors border-t border-gray-50"
                        >
                          <img 
                            src={product.images?.[0]?.src || '/placeholder.png'} // 🚀 mapped to real image
                            alt={product.name} 
                            className="w-10 h-10 object-cover rounded-md bg-gray-100 border border-black/5"
                          />
                          <div className="flex-1 min-w-0">
                            <h4 className="text-[13px] font-semibold text-gray-900 truncate leading-tight">{product.name}</h4>
                            <div className="text-[11px] text-gray-500 font-mono mt-1 flex items-center justify-between">
                              <span className="text-brand-primary font-bold">৳{product.price}</span>
                            </div>
                          </div>
                        </Link>
                      ))
                    ) : !isSearching ? (
                      <div className="p-6 text-center text-xs text-gray-400">
                        No products found for "{searchQuery}"
                      </div>
                    ) : (
                      <div className="p-4 text-center text-xs text-brand-primary animate-pulse">Searching...</div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* 🚀 Modern Professional Mobile Bottom Navigation */}
      <AnimatePresence>
        {!location.pathname.startsWith('/checkout') && !location.pathname.startsWith('/product/') && (
          <div className="md:hidden fixed left-0 right-0 bottom-0 z-40 px-3 pt-2 pointer-events-none" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}>
            <nav aria-label="Primary" className="pointer-events-auto mx-auto max-w-md rounded-2xl border border-gray-200/50 bg-white/70 backdrop-blur-xl shadow-[0_10px_30px_-12px_rgba(0,0,0,0.35),0_4px_10px_-4px_rgba(0,0,0,0.18)] dark:bg-black/70 dark:border-white/10">
              <div className="grid grid-cols-5 h-[60px] text-gray-500">
                {/* Menu */}
                <button type="button" onClick={() => setIsMobileMenuOpen(true)} className="h-full w-full">
                  <span className="relative inline-flex flex-col items-center justify-center gap-0.5 h-full w-full transition-colors duration-200 hover:text-brand-primary">
                    <span className="relative">
                      <Menu className="w-5 h-5" strokeWidth={2} aria-hidden="true" />
                    </span>
                    <span className="text-xs font-medium leading-none">Menu</span>
                  </span>
                </button>
                {/* Home */}
                <Link to="/" className="h-full w-full">
                  <span className={`relative inline-flex flex-col items-center justify-center gap-0.5 h-full w-full transition-colors duration-200 ${location.pathname === '/' ? 'text-brand-primary' : 'hover:text-brand-primary'}`}>
                    <span className="relative">
                      <HomeIcon className="w-5 h-5" strokeWidth={2} aria-hidden="true" />
                    </span>
                    <span className="text-xs font-medium leading-none">Home</span>
                  </span>
                </Link>
                {/* Cart */}
                <button type="button" onClick={() => setIsOpen(true)} className="h-full w-full">
                  <span className="relative inline-flex flex-col items-center justify-center gap-0.5 h-full w-full transition-colors duration-200 hover:text-brand-primary">
                    <span className="relative">
                      <ShoppingCart className="w-5 h-5" strokeWidth={2} aria-hidden="true" />
                      {cartItems.length > 0 && (
                        <span aria-label={`${cartItems.length} items in cart`} className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] px-1 inline-flex items-center justify-center rounded-full text-[10px] font-bold bg-brand-primary text-white">
                          {cartItems.length}
                        </span>
                      )}
                    </span>
                    <span className="text-xs font-medium leading-none">Cart</span>
                  </span>
                </button>
                {/* Wishlist */}
                <Link to="/wishlist" className="h-full w-full">
                  <span className={`relative inline-flex flex-col items-center justify-center gap-0.5 h-full w-full transition-colors duration-200 ${location.pathname === '/wishlist' ? 'text-brand-primary' : 'hover:text-brand-primary'}`}>
                    <span className="relative">
                      <Heart className="w-5 h-5" strokeWidth={2} aria-hidden="true" />
                      {wishlistItems.length > 0 && (
                        <span className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] px-1 inline-flex items-center justify-center rounded-full text-[10px] font-bold bg-brand-primary text-white">
                          {wishlistItems.length}
                        </span>
                      )}
                    </span>
                    <span className="text-xs font-medium leading-none">Wishlist</span>
                  </span>
                </Link>
                {/* Profile */}
                <Link to="/profile" className="h-full w-full">
                  <span className={`relative inline-flex flex-col items-center justify-center gap-0.5 h-full w-full transition-colors duration-200 ${location.pathname === '/profile' ? 'text-brand-primary' : 'hover:text-brand-primary'}`}>
                    <span className="relative">
                      <User className="w-5 h-5" strokeWidth={2} aria-hidden="true" />
                    </span>
                    <span className="text-xs font-medium leading-none">Profile</span>
                  </span>
                </Link>
              </div>
            </nav>
          </div>
        )}
      </AnimatePresence>

      <CartDrawer />
      <MobileMenuDrawer isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
    </>
  );
}
