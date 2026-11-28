import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { SeoHead } from '../components/SeoHead';
import ProductCard from '../components/products/ProductCard';
import { getProducts, getCategories, Product } from '../lib/woocommerce';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Grid2x2, 
  Grid3x3, 
  SlidersHorizontal, 
  ChevronDown, 
  ChevronRight, 
  Home as HomeIcon,
  X,
  Check,
  ArrowUpDown,
  Loader2,
  PackageOpen
} from 'lucide-react';
import { useSearchParams, Link } from 'react-router-dom';

const PRODUCTS_PER_PAGE = 12;

// fixedCategory: used by the /product-category/:slug SEO route. When set the
// page is scoped to that category and the sidebar/mobile filter is suppressed so
// the landing URL never drifts into a ?cat= query string.
export default function Shop({ fixedCategory }: { fixedCategory?: string } = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [visibleCount, setVisibleCount] = useState(PRODUCTS_PER_PAGE);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const observerTarget = useRef<HTMLDivElement>(null);

  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [sortBy, setSortBy] = useState<'recommended' | 'price-low' | 'price-high' | 'rating'>('recommended');
  const [gridLayout, setGridLayout] = useState<'grid-3' | 'grid-2'>('grid-3');

  const activeCategory = fixedCategory || searchParams.get('cat') || 'All';
  const searchQuery = searchParams.get('search') || '';

  useEffect(() => {
    async function loadData() {
      const cachedProducts = sessionStorage.getItem('bunon_shop_products');
      const cachedCategories = sessionStorage.getItem('bunon_shop_categories');

      if (cachedProducts && cachedCategories) {
        setProducts(JSON.parse(cachedProducts));
        setCategories(JSON.parse(cachedCategories));
        setLoading(false);
      } else {
        setLoading(true);
      }

      try {
        const [prodData, catData] = await Promise.all([
          getProducts(),
          getCategories()
        ]);
        
        if (prodData && prodData.length > 0) {
          setProducts(prodData);
          sessionStorage.setItem('bunon_shop_products', JSON.stringify(prodData));
        } else if (!cachedProducts) {
          setProducts([]); // Only clear if we didn't have cache
        }
        
        if (catData && catData.length > 0) {
          setCategories(catData);
          sessionStorage.setItem('bunon_shop_categories', JSON.stringify(catData));
        } else if (!cachedCategories) {
          setCategories([]); // Only clear if we didn't have cache
        }
        
      } catch (error) {
        console.error("Shop data load error:", error);
      } finally {
        setLoading(false);
      }
      
      if (!cachedProducts) window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    loadData();
  }, []);

  useEffect(() => {
    setVisibleCount(PRODUCTS_PER_PAGE);
  }, [activeCategory, sortBy, searchQuery]);

  const filteredAndSortedProducts = useMemo(() => {
    let result = products.filter(product => {
      let categoryMatch = false;
      if (activeCategory === 'All' || activeCategory === 'all') {
        categoryMatch = true;
      } else {
        const categoryStr = (product as any).category;
        if (categoryStr && typeof categoryStr === 'string' && categoryStr.toLowerCase() === activeCategory.toLowerCase()) {
          categoryMatch = true;
        }
        const categoriesArr = (product as any).categories;
        if (categoriesArr && Array.isArray(categoriesArr)) {
          if (categoriesArr.some(c => (c.slug && c.slug.toLowerCase() === activeCategory.toLowerCase()) || (c.name && c.name.toLowerCase() === activeCategory.toLowerCase()))) {
            categoryMatch = true;
          }
        }
      }

      if (!categoryMatch) return false;

      if (searchQuery) {
        const lowerQuery = searchQuery.toLowerCase();
        const nameMatch = product.name?.toLowerCase().includes(lowerQuery);
        const tagMatch = product.tags?.some((t: any) => typeof t === 'string' ? t.toLowerCase().includes(lowerQuery) : t.name?.toLowerCase().includes(lowerQuery));
        const catMatch = product.categories?.some((c: any) => c.name?.toLowerCase().includes(lowerQuery));
        if (!nameMatch && !tagMatch && !catMatch) return false;
      }

      return true;
    });

    if (sortBy === 'price-low') {
      result = [...result].sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
    } else if (sortBy === 'price-high') {
      result = [...result].sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
    } else if (sortBy === 'rating') {
      const getRating = (p: any) => p.rating || 5;
      result = [...result].sort((a, b) => getRating(b) - getRating(a));
    }

    return result;
  }, [activeCategory, products, sortBy]);

  const visibleProducts = useMemo(() => {
    return filteredAndSortedProducts.slice(0, visibleCount);
  }, [filteredAndSortedProducts, visibleCount]);

  const hasMore = visibleCount < filteredAndSortedProducts.length;

  const handleObserver = useCallback((entries: IntersectionObserverEntry[]) => {
    const target = entries[0];
    if (target.isIntersecting && hasMore && !loading && !isFetchingMore) {
      setIsFetchingMore(true);
      setTimeout(() => {
        setVisibleCount((prev) => prev + PRODUCTS_PER_PAGE);
        setIsFetchingMore(false);
      }, 400); 
    }
  }, [hasMore, loading, isFetchingMore]);

  useEffect(() => {
    const observer = new IntersectionObserver(handleObserver, {
      root: null,
      rootMargin: '200px',
      threshold: 0.1,
    });
    
    if (observerTarget.current) observer.observe(observerTarget.current);
    const shopJsonLd = [{
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Bunon Fabrics Shop',
      url: 'https://bunon.shop/shop',
      description: 'Browse the full collection of Bunon Fabrics sarees, textiles, and ready-made products'
    }];

    
    return () => {
      if (observerTarget.current) observer.unobserve(observerTarget.current);
    };
  }, [handleObserver]);

  const sortLabelMap = {
    'recommended': 'Recommended',
    'price-low': 'Price: Low to High',
    'price-high': 'Price: High to Low',
    'rating': 'Popularity'
  };

  const GridSkeleton = () => (
    <div className={`grid gap-x-6 gap-y-10 ${
      gridLayout === 'grid-3' 
        ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4' 
        : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3'
    }`}>
      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <div key={i} className="flex flex-col gap-4">
          <div className="aspect-[3/4] w-full bg-slate-100 dark:bg-zinc-800/60 rounded-xl animate-pulse" />
          <div className="space-y-2">
            <div className="h-3 w-3/4 bg-slate-100 dark:bg-zinc-800/60 rounded animate-pulse" />
            <div className="h-3 w-1/4 bg-slate-100 dark:bg-zinc-800/60 rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <SeoHead
      title="Shop All Products | Bunon Fabrics"
      description="Browse the full collection of Bunon Fabrics sarees, textiles, and ready-made products"
      ogImage="https://bunon.shop/image/Bestselling-Saree-banner-1-mobie-768x912.jpg"
      ogType="website"
      canonicalUrl="https://bunon.shop/shop"
      jsonLd={shopJsonLd}
    />
    <div className="min-h-screen bg-white dark:bg-zinc-950 pb-24 text-slate-900 dark:text-zinc-100 selection:bg-[#0C1E4E] selection:text-white">
      
      {/* 🌟 Ultra-Minimalist Header */}
      <header className="pt-16 pb-12 text-center">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <motion.h1 
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: "easeOut" }}
            className="text-4xl md:text-5xl font-bold text-[#0C1E4E] dark:text-white tracking-tight"
          >
            BUNON FABRICS
          </motion.h1>
          <motion.nav 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-6 text-[11px] sm:text-xs text-slate-400 font-semibold flex items-center justify-center gap-2.5 uppercase tracking-[0.2em]"
          >
            <Link className="hover:text-[#0C1E4E] dark:hover:text-white transition-colors" to="/">Home</Link>
            <ChevronRight className="w-3 h-3 text-slate-300" />
            <span className="text-slate-800 dark:text-zinc-300">Collection</span>
          </motion.nav>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row gap-12">
          
          {/* 🌟 Text-Based Clean Sidebar (No Boxes) */}
          <aside className="hidden lg:block w-[240px] shrink-0">
            <div className="sticky top-24 pr-6">
              <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-zinc-500 mb-8 border-b border-slate-100 dark:border-zinc-800/60 pb-4">
                Categories
              </h3>
              <ul className="flex flex-col gap-4">
                <li>
                  <button 
                    onClick={() => setSearchParams({})}
                    className={`text-sm tracking-wide transition-all duration-300 relative group flex items-center w-full ${
                      activeCategory === 'All' 
                        ? 'text-[#0C1E4E] dark:text-white font-bold' 
                        : 'text-slate-500 dark:text-zinc-400 hover:text-[#0C1E4E] dark:hover:text-white font-medium'
                    }`}
                  >
                    {activeCategory === 'All' && <span className="absolute -left-4 w-1.5 h-1.5 rounded-full bg-[#A61C2C]" />}
                    All Pieces
                  </button>
                </li>
                
                {categories.map((cat) => (
                  <li key={cat.id}>
                    <button 
                      onClick={() => setSearchParams({ cat: cat.slug })}
                      className={`text-sm tracking-wide transition-all duration-300 relative group flex items-center w-full ${
                        activeCategory === cat.slug 
                          ? 'text-[#0C1E4E] dark:text-white font-bold' 
                          : 'text-slate-500 dark:text-zinc-400 hover:text-[#0C1E4E] dark:hover:text-white font-medium'
                      }`}
                    >
                      {activeCategory === cat.slug && <span className="absolute -left-4 w-1.5 h-1.5 rounded-full bg-[#A61C2C]" />}
                      {cat.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          <main className="flex-1 min-w-0">
            
            {/* 🌟 Clean In-flow Toolbar (No Sticky, No Background) */}
            <div className="flex items-center justify-between pb-6 border-b border-slate-100 dark:border-zinc-800/60 mb-8">
              
              <div className="flex items-center gap-4">
                {/* Mobile Filter Trigger */}
                <button 
                  onClick={() => setIsMobileFilterOpen(true)}
                  className="lg:hidden flex items-center gap-2 text-sm font-semibold text-[#0C1E4E] dark:text-white uppercase tracking-wider"
                >
                  <SlidersHorizontal className="w-4 h-4" /> Filter
                </button>

                <p className="hidden md:block text-xs font-semibold text-slate-400 uppercase tracking-widest">
                  Showing {visibleProducts.length} of {filteredAndSortedProducts.length}
                </p>
              </div>

              <div className="flex items-center gap-6">
                {/* Grid Toggles (Minimal) */}
                <div className="hidden sm:flex items-center gap-3 text-slate-300 dark:text-zinc-600">
                  <button onClick={() => setGridLayout('grid-3')} className={`hover:text-[#0C1E4E] dark:hover:text-white transition-colors ${gridLayout === 'grid-3' ? 'text-[#0C1E4E] dark:text-white' : ''}`}>
                    <Grid3x3 className="w-4.5 h-4.5" />
                  </button>
                  <button onClick={() => setGridLayout('grid-2')} className={`hover:text-[#0C1E4E] dark:hover:text-white transition-colors ${gridLayout === 'grid-2' ? 'text-[#0C1E4E] dark:text-white' : ''}`}>
                    <Grid2x2 className="w-4.5 h-4.5" />
                  </button>
                </div>

                {/* Minimalist Sort Dropdown */}
                <div className="relative">
                  <button 
                    onClick={() => setIsSortOpen(!isSortOpen)}
                    className="flex items-center gap-2 text-xs font-semibold text-[#0C1E4E] dark:text-white uppercase tracking-wider hover:text-slate-500 transition-colors"
                  >
                    <span className="hidden sm:inline">Sort: {sortLabelMap[sortBy]}</span>
                    <span className="sm:hidden">Sort</span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${isSortOpen ? 'rotate-180' : ''}`} />
                  </button>

                  <AnimatePresence>
                    {isSortOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsSortOpen(false)} />
                        <motion.div 
                          initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }} transition={{ duration: 0.2 }}
                          className="absolute right-0 top-8 z-50 w-48 bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 shadow-xl p-4 flex flex-col gap-3"
                        >
                          {Object.keys(sortLabelMap).map((key) => (
                            <button
                              key={key}
                              onClick={() => { setSortBy(key as any); setIsSortOpen(false); }}
                              className={`text-left text-xs font-medium tracking-wide transition-colors ${
                                sortBy === key ? 'text-[#A61C2C]' : 'text-slate-500 hover:text-[#0C1E4E] dark:hover:text-white'
                              }`}
                            >
                              {sortLabelMap[key as keyof typeof sortLabelMap]}
                            </button>
                          ))}
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {/* 🌟 Elegant Grid Rendering */}
            {loading ? (
              <GridSkeleton />
            ) : filteredAndSortedProducts.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="py-32 text-center flex flex-col items-center justify-center"
              >
                <PackageOpen className="w-12 h-12 text-slate-200 dark:text-zinc-800 mb-6" strokeWidth={1} />
                <h3 className="text-xl font-light text-slate-800 dark:text-zinc-200 mb-3 tracking-wide">No pieces found</h3>
                <p className="text-sm text-slate-400 dark:text-zinc-500 mb-8 max-w-sm font-light">Explore our curated collections to find your perfect style.</p>
                <button 
                  onClick={() => setSearchParams({})} 
                  className="px-8 py-3.5 bg-transparent border border-[#0C1E4E] dark:border-white text-[#0C1E4E] dark:text-white text-xs font-bold uppercase tracking-widest hover:bg-[#0C1E4E] hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
                >
                  View All
                </button>
              </motion.div>
            ) : (
              <div className="flex flex-col h-full">
                <div className={`grid gap-x-6 gap-y-12 ${
                  gridLayout === 'grid-3' 
                    ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4' 
                    : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3'
                }`}>
                  <AnimatePresence mode="popLayout">
                    {visibleProducts.map((product, index) => (
                      <motion.div
                        layout
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.5, delay: (index % 12) * 0.03, ease: "easeOut" }}
                        key={product.id}
                        className="w-full"
                      >
                        <ProductCard product={product} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                {hasMore && (
                  <div ref={observerTarget} className="w-full py-20 flex justify-center items-center mt-auto">
                    {isFetchingMore ? (
                      <div className="w-5 h-5 border-2 border-slate-300 border-t-[#0C1E4E] rounded-full animate-spin" />
                    ) : (
                      <div className="h-10" />
                    )}
                  </div>
                )}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* 🌟 Minimal Mobile Drawer */}
      <AnimatePresence>
        {isMobileFilterOpen && (
          <div className="fixed inset-0 z-[100] lg:hidden flex items-end justify-center" role="dialog" aria-modal="true">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 backdrop-blur-sm" 
              onClick={() => setIsMobileFilterOpen(false)} 
            />
            <motion.div 
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", bounce: 0, duration: 0.5 }}
              className="relative w-full max-w-md bg-white dark:bg-zinc-950 p-8 z-10 flex flex-col max-h-[85vh] rounded-t-3xl"
            >
              <div className="flex items-center justify-between pb-8">
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-[#0C1E4E] dark:text-white">
                  Filter Catalog
                </h3>
                <button onClick={() => setIsMobileFilterOpen(false)} className="text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="overflow-y-auto flex flex-col gap-6 custom-scrollbar pb-6">
                <button 
                  onClick={() => { setSearchParams({}); setIsMobileFilterOpen(false); }}
                  className={`text-left text-sm tracking-wide transition-all ${
                    activeCategory === 'All' ? 'text-[#0C1E4E] dark:text-white font-bold' : 'text-slate-500 font-medium'
                  }`}
                >
                  All Pieces
                </button>
                
                {categories.map((cat) => (
                  <button 
                    key={cat.id}
                    onClick={() => { setSearchParams({ cat: cat.slug }); setIsMobileFilterOpen(false); }}
                    className={`text-left text-sm tracking-wide transition-all ${
                      activeCategory === cat.slug ? 'text-[#0C1E4E] dark:text-white font-bold' : 'text-slate-500 font-medium'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
</>  );
}
