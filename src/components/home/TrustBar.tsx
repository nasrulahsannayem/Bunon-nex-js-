import { Truck, ShieldCheck, Phone, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';

export default function TrustBar() {
  const trustItems = [
    {
      icon: Truck,
      title: 'Fast Delivery',
      desc: 'Nationwide 72h'
    },
    {
      icon: Sparkles,
      title: '100% Authentic',
      desc: 'Artisan Crafted'
    },
    {
      icon: ShieldCheck,
      title: 'Secure Payment',
      desc: 'bKash Verified'
    },
    {
      icon: Phone,
      title: 'Active Support',
      desc: '09611900606'
    }
  ];

  return (
    <div className="bg-white py-12 border-b border-black/5 relative z-20 -mt-10 rounded-t-[3rem] premium-shadow">
      <div className="max-w-[1400px] mx-auto px-6 sm:px-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 md:gap-4">
          {trustItems.map((item, idx) => (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              key={idx} 
              className="flex flex-col items-center text-center group"
            >
              <div className="w-16 h-16 bg-brand-gray rounded-[1.25rem] flex items-center justify-center text-brand-navy mb-5 transition-all duration-500 group-hover:bg-brand-ruby group-hover:text-white group-hover:-translate-y-2 group-hover:shadow-xl group-hover:shadow-brand-ruby/20">
                <item.icon className="w-7 h-7 stroke-[2]" />
              </div>
              <h4 className="text-[10px] font-black text-brand-navy mb-2 uppercase tracking-[0.2em]">{item.title}</h4>
              <p className="text-[10px] text-brand-navy/30 font-bold uppercase tracking-widest">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
