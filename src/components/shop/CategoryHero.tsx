// components/shop/CategoryHero.tsx

import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ChevronRight, House } from 'lucide-react';

export default function CategoryHero({
  title,
  products,
}: {
  title: string;
  products: any[];
}) {
  const heroImage =
    products.length > 0
      ? products[0]?.images?.[0]?.src ||
        '/image/default-banner.jpg'
      : '/image/default-banner.jpg';

  return (
    <section className="relative overflow-hidden rounded-[28px] mb-10 mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">

      {/* Banner */}
      <div className="relative h-[180px] md:h-[260px] rounded-[28px] overflow-hidden">

        {/* Background Image */}
        <div
          className="absolute inset-0 bg-cover bg-center scale-105"
          style={{
            backgroundImage: `url(${heroImage})`,
          }}
        />

        {/* Dark Overlay */}
        <div className="absolute inset-0 bg-black/45" />

        {/* Soft Gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-black/20" />

        {/* Content */}
        <div className="relative max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-7 md:py-10 text-center h-full flex flex-col items-center justify-center">

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
          >

            {/* Title */}
            <motion.h1
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-2xl md:text-5xl font-bold tracking-tight text-white"
            >
              {title}
            </motion.h1>

            {/* Breadcrumb */}
            <motion.nav
              aria-label="Breadcrumb"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="mt-3 text-xs flex items-center justify-center gap-1.5 text-white/75"
            >

              <Link
                to="/"
                className="inline-flex items-center gap-1 hover:text-white transition-colors"
              >
                <House size={11} />
                <span>Home</span>
              </Link>

              <ChevronRight size={11} />

              <Link
                to="/categories"
                className="hover:text-white transition-colors"
              >
                Categories
              </Link>

              <ChevronRight size={11} />

              <span className="text-white">
                {title}
              </span>

            </motion.nav>

          </motion.div>
        </div>
      </div>
    </section>
  );
}
