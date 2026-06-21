import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function AppBanner() {
  const [isVisible, setIsVisible] = useState(true);
  const [showBanner, setShowBanner] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const location = useLocation();

  // 🚀 Scroll Auto-Hide Logic
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      if (currentScrollY > lastScrollY && currentScrollY > 50) {
        // নিচে স্ক্রল করলে ব্যানার হাইড হবে
        setShowBanner(false);
      } else {
        // উপরে স্ক্রল করলে ব্যানার শো করবে
        setShowBanner(true);
      }
      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  // হোম পেজ না হলে বা (X) বাটনে চাপলে ব্যানার রেন্ডার হবে না
  if (!isVisible || location.pathname !== '/') return null;

return (
    <div 
      className={`bg-white text-gray-900 px-3 py-2 flex md:hidden items-center justify-between sticky z-[10000] shadow-[0_4px_15px_rgba(0,0,0,0.05)] border-b border-gray-100 font-sans transition-all duration-300 ease-in-out ${
        showBanner ? 'top-0 opacity-100' : '-top-full opacity-0'
      }`}
    >
      <div className="flex items-center gap-2.5 w-full">
        
        {/* Close (X) Button */}
        <button 
          onClick={() => setIsVisible(false)}
          className="text-gray-400 hover:text-gray-600 p-0.5 transition-colors flex-shrink-0"
          aria-label="Close banner"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        
        {/* App Logo */}
        <img 
          src="https://bunonfabrics.com/wp-content/uploads/2025/02/original-logo-with-black-background.png" 
          alt="Bunon App" 
          className="w-10 h-10 min-w-[40px] rounded-lg object-contain bg-black border border-gray-100 shadow-sm flex-shrink-0"
          onError={(e) => {
            (e.target as HTMLImageElement).src = 'https://ui-avatars.com/api/?name=Bunon+App&background=000&color=fff&rounded=true&bold=true';
          }}
        />
        
        {/* Text Content & Ratings - Slimmer Layout */}
        <div className="flex flex-col justify-center flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
             <span className="text-[12px] sm:text-[14px] font-extrabold text-gray-900 leading-none">
               Try the App
             </span>
             <span className="bg-[#fbbf24] text-black text-[9px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider leading-none">
               Save More
             </span>
          </div>
          
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[10px] text-gray-500 font-medium leading-none">
              4.9
            </span>
            <div className="flex gap-[1px] text-[#fbbf24]">
              {[1, 2, 3, 4, 5].map((star) => (
                <svg key={star} xmlns="http://www.w3.org/2000/svg" width="9" height="9" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              ))}
            </div>
            <span className="text-[9px] text-gray-400 font-medium">
              (10k+)
            </span>
          </div>
        </div>

        {/* INSTALL Button */}
        <a 
          href="https://bunon.shop/bunonfabrics.apk"
          className="bg-black hover:bg-gray-800 text-white text-[11px] sm:text-[12px] font-bold px-4 py-1.5 rounded-full shadow-md transition-all uppercase tracking-wide flex-shrink-0"
        >
          Install
        </a>

      </div>
    </div>
  );
}
