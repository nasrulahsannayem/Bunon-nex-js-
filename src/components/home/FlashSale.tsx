import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function FlashSale() {
  const [timeLeft, setTimeLeft] = useState({
    hours: 24,
    minutes: 0,
    seconds: 0
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev.seconds > 0) return { ...prev, seconds: prev.seconds - 1 };
        if (prev.minutes > 0) return { ...prev, minutes: prev.minutes - 1, seconds: 59 };
        if (prev.hours > 0) return { ...prev, hours: prev.hours - 1, minutes: 59, seconds: 59 };
        return { hours: 24, minutes: 0, seconds: 0 };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 py-20">
      <div className="bg-navy rounded-[2.5rem] overflow-hidden relative flex flex-col lg:flex-row items-center shadow-2xl">
        {/* Image */}
        <div className="w-full lg:w-1/2 h-80 lg:h-[500px] overflow-hidden">
          <img 
            src="https://bunonfabrics.com/wp-content/uploads/2025/10/bunon-saree-banner-4.webp" 
            alt="Flash Sale" 
            className="w-full h-full object-cover grayscale transition-all duration-700 hover:grayscale-0 scale-105 hover:scale-100"
          />
        </div>

        {/* Content */}
        <div className="w-full lg:w-1/2 p-8 lg:p-16 relative z-10">
          <span className="text-gold text-xs font-bold uppercase tracking-[0.3em] mb-4 block">Limited Time Offer</span>
          <h2 className="text-4xl lg:text-5xl font-serif text-white mb-6 leading-tight">
            The Bridal <span className="italic font-light opacity-80 underline decoration-gold underline-offset-8">Edit</span>
          </h2>
          <p className="text-stone-400 text-lg mb-10 max-w-md">
            Flat 30% Off on exclusive handloom bridesmaid collections. Tradition woven with modernity.
          </p>

          <div className="flex gap-4 mb-12">
            {[
              { val: timeLeft.hours, label: 'Hrs' },
              { val: timeLeft.minutes, label: 'Mins' },
              { val: timeLeft.seconds, label: 'Secs' }
            ].map((t, idx) => (
              <div key={idx} className="bg-white/5 border border-white/10 backdrop-blur-md rounded-2xl p-4 min-w-[80px] text-center">
                <span className="text-3xl font-bold text-white block leading-none mb-1 font-sans">
                  {t.val.toString().padStart(2, '0')}
                </span>
                <span className="text-[10px] text-gold font-bold uppercase tracking-widest">{t.label}</span>
              </div>
            ))}
          </div>

          <Link 
            to="/shop" 
            className="inline-flex items-center gap-3 bg-ruby hover:bg-ruby-dark text-white px-8 py-4 rounded-full font-bold uppercase tracking-widest text-xs transition-all shadow-[0_10px_25px_rgba(230,0,35,0.4)] hover:-translate-y-1"
          >
            Shop The Sale
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Abstract Background Element */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-ruby/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
      </div>
    </div>
  );
}
