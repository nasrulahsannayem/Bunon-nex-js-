import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Hero() {
  return (
    <section className="relative h-[85vh] w-full overflow-hidden bg-navy flex items-center justify-center">
      {/* Desktop Background */}
      <motion.div 
        initial={{ scale: 1.1 }}
        animate={{ scale: 1 }}
        transition={{ duration: 10, ease: 'easeOut' }}
        className="absolute inset-0 hidden md:block"
      >
        <img 
          src="https://bunonfabrics.com/wp-content/uploads/2025/06/Bestselling-Saree-banner-1pc.jpg" 
          className="w-full h-full object-cover opacity-60"
          alt="Banner"
        />
      </motion.div>

      {/* Mobile Video Background */}
      <div className="absolute inset-0 md:hidden overflow-hidden">
        <video 
          autoPlay 
          loop 
          muted 
          playsInline 
          className="w-full h-full object-cover opacity-50"
          poster="https://bunonfabrics.com/wp-content/uploads/2025/06/Bestselling-Saree-banner-1-mobie.jpg"
        >
          <source 
            src="https://bunonfabrics.com/wp-content/uploads/2026/04/snaptik_7543269370093456658_v3-1.mp4" 
            type="video/mp4" 
          />
        </video>
      </div>

      {/* Overlay Gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/30 to-transparent" />

      {/* Content */}
      <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
        <motion.span 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="text-gold text-xs font-bold uppercase tracking-[0.4em] mb-6 block"
        >
          The Art of Handloom
        </motion.span>
        <motion.h1 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="text-5xl md:text-8xl font-serif text-white mb-10 leading-[1.1]"
        >
          Woven with <span className="italic font-light text-gold opacity-80">Love</span>, <br />
          Crafted for Royalty.
        </motion.h1>
        <motion.div
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ delay: 0.9 }}
           className="flex flex-col sm:flex-row items-center justify-center gap-6"
        >
          <Link 
            to="/shop" 
            className="group bg-white text-navy px-12 py-5 rounded-full font-bold uppercase tracking-widest text-[10px] transition-all hover:bg-gold hover:text-white shadow-2xl flex items-center gap-2"
          >
            Discover Collection
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link 
            to="/shop" 
            className="text-white/80 hover:text-white text-[10px] font-bold uppercase tracking-widest underline decoration-white/20 underline-offset-8 transition-all"
          >
            View Heritage Lookbook
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
