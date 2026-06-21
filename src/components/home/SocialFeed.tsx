import { Instagram, Plus } from 'lucide-react';

export default function SocialFeed() {
  const images = [
    "https://bunonfabrics.com/wp-content/uploads/2025/02/IMG-20250224-WA0007.jpg",
    "https://bunonfabrics.com/wp-content/uploads/2025/02/676afc30-c94c-407d-984d-e19845b088ec.jpeg",
    "https://bunonfabrics.com/wp-content/uploads/2025/03/IMG-20250301-WA0005.jpg",
    "https://bunonfabrics.com/wp-content/uploads/2025/04/475526699_18022258898644312_3512043635408462093_n.webp",
    "https://bunonfabrics.com/wp-content/uploads/2025/06/product-jpeg-1000x1000-1.jpg"
  ];

  return (
    <section className="py-24 bg-white overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 mb-16 text-center">
        <span className="text-ruby text-xs font-bold uppercase tracking-[0.3em] mb-4 block">Curated Gallery</span>
        <h2 className="text-4xl font-serif text-navy">Spotted in Bunon</h2>
      </div>

      <div className="flex gap-4 px-4 overflow-x-auto no-scrollbar pb-10">
        {images.map((img, idx) => (
          <div key={idx} className="relative group flex-shrink-0 w-72 aspect-square rounded-[2rem] overflow-hidden bg-stone-100 shadow-xl">
            <img src={img} alt="Social" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
            <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <div className="bg-white text-navy px-6 py-3 rounded-full flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest shadow-xl transform translate-y-4 group-hover:translate-y-0 transition-transform">
                <Plus className="w-4 h-4" />
                Shop Now
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
