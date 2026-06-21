import { useState } from 'react';
import { Search, SlidersHorizontal, ArrowUpDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface FilterBarProps {
  onSearch: (query: string) => void;
  onFilter: (category: string) => void;
  activeCategory: string;
  categories: string[];
}

export default function FilterBar({ onSearch, onFilter, activeCategory, categories }: FilterBarProps) {
  const [searchValue, setSearchValue] = useState('');

  const handleSearchChange = (val: string) => {
    setSearchValue(val);
    onSearch(val);
  };

  const allCategories = ['All', ...categories];

  return (
    <div className="sticky top-14 sm:top-20 z-[100] glass px-4 sm:px-8 py-4 sm:py-6 flex flex-col md:flex-row items-center justify-between gap-6 transition-all duration-700 mx-4 sm:mx-8 rounded-[2rem] border shadow-2xl">
      
      {/* Scrollable Categories Rail */}
      <div className="flex items-center gap-3 overflow-x-auto no-scrollbar w-full md:w-auto py-1 mask-linear-fade">
        {allCategories.map((cat) => (
          <button
            key={cat}
            onClick={() => onFilter(cat)}
            className={`whitespace-nowrap px-8 py-3 rounded-2xl text-[9px] font-bold uppercase tracking-[0.3em] transition-all duration-300 relative group ${
              activeCategory === cat 
                ? 'bg-brand-black text-white shadow-xl' 
                : 'bg-brand-gray text-brand-muted hover:text-brand-black hover:bg-brand-black/5'
            }`}
          >
            {cat}
            <AnimatePresence>
              {activeCategory === cat && (
                <motion.span 
                  layoutId="bubble"
                  className="absolute inset-0 bg-brand-black rounded-2xl -z-10"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}
            </AnimatePresence>
          </button>
        ))}
      </div>

      {/* Advanced Interaction Layer */}
      <div className="flex items-center gap-4 w-full md:w-auto">
        <div className="relative flex-1 md:w-80 group">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted group-focus-within:text-brand-black transition-colors" />
          <input 
            type="text"
            value={searchValue}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Index Collection..." 
            className="w-full bg-brand-gray/50 border border-transparent rounded-2xl pl-14 pr-6 py-4 text-[10px] font-bold uppercase tracking-widest focus:ring-4 focus:ring-brand-black/5 focus:bg-white focus:border-brand-black/10 transition-all placeholder:text-brand-muted"
          />
        </div>
        
        <button className="flex items-center gap-3 px-8 py-4 bg-brand-gray/50 rounded-2xl border border-transparent hover:bg-white hover:border-brand-black/10 transition-all group shadow-sm active:scale-95">
          <ArrowUpDown className="w-4 h-4 text-brand-muted group-hover:text-brand-black transition-colors" />
          <span className="hidden sm:block text-[9px] font-bold uppercase tracking-[0.2em] text-brand-muted group-hover:text-brand-black">Relevance</span>
        </button>
      </div>
    </div>
  );
}
