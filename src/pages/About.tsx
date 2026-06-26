import { motion } from 'motion/react';
import { Target, Star, ShieldCheck, Heart } from 'lucide-react';

export default function About() {
  return (
    <div className="bg-gray-50 pb-20">
      
      {/* Hero Section */}
      <section className="relative w-full h-[50vh] min-h-[400px] bg-brand-navy flex items-center justify-center text-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-navy via-brand-navy/90 to-brand-primary/20 z-0" />
        
        {/* Animated Background Elements */}
        <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
          <div className="absolute -top-20 -left-20 w-64 h-64 bg-brand-primary rounded-full mix-blend-multiply filter blur-3xl animate-blob" />
          <div className="absolute top-40 -right-20 w-72 h-72 bg-brand-gold rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000" />
          <div className="absolute -bottom-20 left-40 w-80 h-80 bg-red-800 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-4000" />
        </div>

        <div className="relative z-10 px-4 max-w-3xl mx-auto w-full">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
            <span className="inline-block text-[13px] font-semibold uppercase tracking-[3px] text-brand-gold mb-4">
              Premium Brand
            </span>
            <h1 className="text-white text-4xl sm:text-5xl md:text-6xl font-display font-medium leading-[1.1] mb-6">
              About <i className="text-brand-gold font-normal italic">Bunon Fabrics</i>
            </h1>
            <p className="text-white/80 text-lg md:text-xl font-light">
              Crafting Heritage, Delivering Excellence.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Main Content */}
      <section className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-16 -mt-10 relative z-20">
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col md:flex-row border border-gray-100">
           
           <div className="w-full md:w-1/2 p-8 md:p-12 lg:p-16 flex flex-col justify-center">
              <span className="text-brand-primary text-xs font-semibold uppercase tracking-[2px] mb-4">Our Story</span>
              <h2 className="text-3xl sm:text-4xl text-brand-navy font-display font-semibold mb-6">পরম্পরার সাথে আধুনিকতার মেলবন্ধন</h2>
              
              <div className="space-y-4 text-gray-600 text-[15px] leading-relaxed mb-8">
                <p>আমাদের প্রতিষ্ঠান <strong className="text-brand-navy">Bunon Fabrics</strong> (বুনন ফেব্রিক্স) দেশের অন্যতম জনপ্রিয় শাড়ি ব্র্যান্ড। আমরা বাংলাদেশে উচ্চমানের এবং নান্দনিক শাড়ি সরবরাহের মাধ্যমে গ্রাহকদের আস্থা অর্জন করেছি। প্রতিটি শাড়ি আমরা বুনে তুলি ভালোবাসা, নৈপুণ্য এবং গুণগত মান বজায় রেখে।</p>
                <p>আধুনিক ফ্যাশনের সাথে ঐতিহ্যের মেলবন্ধন ঘটানোই আমাদের মূল উদ্দেশ্য। নিজেদের কারখানায় খুবই যত্ন সহকারে তৈরী হয় আমাদের শাড়ি।</p>
              </div>
              
              <div className="bg-brand-primary/5 border-l-4 border-brand-primary p-6 rounded-r-xl">
                 <h3 className="text-xl font-display font-semibold text-brand-navy mb-2">"পছন্দ আপনার, পৌঁছে দেওয়ার দায়িত্ব আমাদের!"</h3>
                 <p className="text-sm text-gray-500 italic">ছোট্ট এক গ্রাম হোক কিংবা শহরের কোলাহল— বাংলাদেশের ৬৪ জেলার প্রতিটি কোণায় আপনার ভালোবাসা পৌঁছে দিচ্ছে বুনন ফেব্রিক্স।</p>
                 <p className="mt-3 font-semibold text-sm text-brand-navy">২ লক্ষ+ গ্রাহকের ভালবাসায় তৈরি, বিশ্বাসে গড়া — বুনন ফেব্রিক্স</p>
              </div>
           </div>

           <div className="w-full md:w-1/2 bg-gray-50 p-8 md:p-12 lg:p-16 border-t md:border-t-0 md:border-l border-gray-100">
              <img src="/assets/images/original-logo-with-black-background.png" alt="Bunon Fabrics Logo" className="w-[120px] rounded-xl shadow-md mb-8" />
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                 <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <Target className="w-8 h-8 text-brand-gold mb-4" />
                    <h4 className="font-semibold text-brand-navy mb-2">আমাদের মিশন</h4>
                    <ul className="text-sm text-gray-500 space-y-2">
                       <li>• বিশ্বমানের কাপড় সরবরাহ।</li>
                       <li>• ঐতিহ্য ও আধুনিকতার সমন্বয়।</li>
                       <li>• সর্বোত্তম কাস্টমার সার্ভিস।</li>
                    </ul>
                 </div>
                 
                 <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <Star className="w-8 h-8 text-brand-gold mb-4" />
                    <h4 className="font-semibold text-brand-navy mb-2">বিশেষত্ব</h4>
                    <ul className="text-sm text-gray-500 space-y-2">
                       <li>• কারিগরি দক্ষতা।</li>
                       <li>• প্রতিযোগিতামূলক দাম।</li>
                       <li>• আভিজাত্যের প্রতীক।</li>
                    </ul>
                 </div>
              </div>

              <div className="mt-6 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                 <ShieldCheck className="w-8 h-8 text-brand-gold mb-4" />
                 <h4 className="font-semibold text-brand-navy mb-2">প্রতিশ্রুতি</h4>
                 <p className="text-sm text-gray-500 leading-relaxed">আমরা প্রতিশ্রুতিবদ্ধ—আপনাকে সর্বোচ্চ মানসম্পন্ন পণ্য ও সেরা গ্রাহক সেবা প্রদানের জন্য। আপনার আস্থার প্রতিফলন ঘটানোই আমাদের মূল চালিকাশক্তি।</p>
              </div>
           </div>

        </div>
      </section>

      {/* Leadership Section */}
      <section className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-12">
         <div className="text-center mb-10">
            <h2 className="text-3xl text-brand-navy font-semibold font-display">Leadership</h2>
         </div>
         
         <div className="max-w-md mx-auto bg-white rounded-3xl shadow-md overflow-hidden border border-gray-100 transform transition-transform hover:-translate-y-2">
            <div className="aspect-[4/3] overflow-hidden">
               <img src="https://nasrulahsan.com/wp-content/uploads/2025/10/Nasrul-ahsan-nayem-2-scaled.jpg" alt="Nasrul Ahsan Nayem" className="w-full h-full object-cover" />
            </div>
            <div className="p-8 text-center bg-white relative">
               <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-12 h-12 bg-brand-gold rounded-full flex items-center justify-center border-4 border-white">
                 <Heart className="w-5 h-5 text-white" />
               </div>
               <h3 className="text-2xl font-bold text-brand-navy mb-1 tracking-tight">Nasrul Ahsan Nayem</h3>
               <p className="text-brand-primary font-medium text-sm mb-4">Founder & CEO</p>
               <p className="text-gray-500 text-sm leading-relaxed mb-6">Scaling heritage and making authentic Bengali handloom accessible globally.</p>
               <a href="https://www.linkedin.com/in/nasrul-ahsan-nayem/" target="_blank" rel="noreferrer" className="inline-flex items-center justify-center px-6 py-2 border border-gray-200 rounded-full text-sm font-semibold text-brand-navy hover:bg-gray-50 transition-colors">
                  View LinkedIn Profile
               </a>
            </div>
         </div>
      </section>

    </div>
  );
}
