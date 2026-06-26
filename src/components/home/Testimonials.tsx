import { motion } from 'motion/react';
import { Star, Quote } from 'lucide-react';

const testimonials = [
  {
    name: "Ayesha R.",
    location: "Dhaka",
    text: "The Rupnandini saree made me feel like royalty. The craftsmanship is unbelievable!",
    avatar: "/assets/images/IMG-20250224-WA0007.jpg"
  },
  {
    name: "Nazia K.",
    location: "Chattogram",
    text: "I gifted a Bunon saree to my mother. Her tears said everything. It was perfect.",
    avatar: "/assets/images/676afc30-c94c-407d-984d-e19845b088ec.jpeg"
  },
  {
    name: "Sara T.",
    location: "Sylhet",
    text: "Bunon isn’t just a brand. It’s heritage wrapped in elegance. I'm in love!",
    avatar: "/assets/images/IMG-20250301-WA0005.jpg"
  },
  {
    name: "Jannat A.",
    location: "Narayanganj",
    text: "Got my order in 2 days! Packaging was stunning. My husband was speechless.",
    avatar: "/assets/images/475526699_18022258898644312_3512043635408462093_n.webp"
  }
];

export default function Testimonials() {
  return (
    <section className="py-24 bg-surface overflow-hidden">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-16">
          <span className="text-ruby text-[10px] font-bold uppercase tracking-[0.4em] mb-4 block">Our Patrons</span>
          <h2 className="text-4xl md:text-5xl font-serif text-navy">Real Stories from Bunon Lovers</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {testimonials.map((t, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="bg-white p-8 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.03)] border border-stone-50 relative group hover:-translate-y-2 transition-all duration-500"
            >
              <Quote className="absolute top-6 right-8 w-8 h-8 text-gold/10 group-hover:text-gold/20 transition-colors" />
              
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-gold/20">
                  <img src={t.avatar} alt={t.name} className="w-full h-full object-cover" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-navy">{t.name}</h4>
                  <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest">{t.location}</p>
                </div>
              </div>

              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, j) => (
                  <Star key={j} className="w-3 h-3 fill-gold text-gold" />
                ))}
              </div>

              <p className="text-sm text-stone-500 leading-relaxed italic font-light">
                "{t.text}"
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
