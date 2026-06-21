export default function RefundPolicy() {
  return (
    <div className="bg-gray-50 pb-24 pt-10">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        
        {/* Header */}
        <div className="text-center mb-12 border-b border-gray-200 pb-8">
           <h1 className="text-3xl sm:text-4xl font-display font-bold text-brand-gold mb-4">
             Refund & Returns Policy
           </h1>
           <p className="text-gray-600 font-medium">
             Bunon Fabrics-এ আমাদের লক্ষ্য একটাই: আপনার সন্তুষ্টি সর্বোচ্চ। তবে ডেলিভারি সম্পন্ন হওয়া পণ্যের ক্ষেত্রে সাধারণভাবে রিটার্ন গ্রহণ করা হয় না। শুধুমাত্র পণ্যে বাস্তব সমস্যা বা ত্রুটি থাকলে আমরা এক্সচেঞ্জ বা রিফান্ড প্রদান করি।
           </p>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
           
           <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 md:col-span-2 hover:-translate-y-1 transition-transform">
              <h3 className="text-xl font-bold text-brand-navy mb-4 flex items-center gap-2">✅ রিটার্ন/এক্সচেঞ্জ কবে প্রযোজ্য</h3>
              <ul className="space-y-3 text-gray-600">
                 <li className="pl-6 relative before:content-['•'] before:absolute before:left-0 before:text-brand-gold before:text-xl before:-top-1">পণ্য ত্রুটিপূর্ণ হলে (Manufacturing defect)।</li>
                 <li className="pl-6 relative before:content-['•'] before:absolute before:left-0 before:text-brand-gold before:text-xl before:-top-1">পণ্যে দাগ, কাটা, ছেঁড়া বা ভুল পণ্য পাঠানো হলে।</li>
                 <li className="pl-6 relative before:content-['•'] before:absolute before:left-0 before:text-brand-gold before:text-xl before:-top-1">পণ্য ড্যামেজড অবস্থায় ডেলিভারি হলে।</li>
              </ul>
              <div className="mt-6 bg-[#FFFBEB] border-l-4 border-brand-gold p-4 rounded-r-lg text-sm text-[#92400E] italic">
                 <strong>নোট:</strong> হ্যান্ডলুম, হাফ সিল্ক বা জামদানি ধরনের পণ্যে হালকা রঙের পার্থক্য বা সামান্য তাঁতের ন্যাচারাল ভ্যারিয়েশন থাকতে পারে, যা সাধারণত "ডিফেক্ট" হিসেবে গণ্য হবে না।
              </div>
           </div>

           <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:-translate-y-1 transition-transform">
              <h3 className="text-xl font-bold text-brand-navy mb-3">⏳ জানাতে হবে ২৪ ঘণ্টার মধ্যে</h3>
              <p className="text-gray-600 leading-relaxed">
                 সমস্যা পেলে ডেলিভারি পাওয়ার <strong>২৪ ঘণ্টার মধ্যে</strong> আমাদের জানাতে হবে। ২৪ ঘণ্টা পার হলে অভিযোগ গ্রহণ নাও করা হতে পারে।
              </p>
           </div>

           <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:-translate-y-1 transition-transform">
              <h3 className="text-xl font-bold text-brand-navy mb-3">🎥 প্রমাণ (Photo/Video)</h3>
              <ul className="space-y-2 text-gray-600 mb-4">
                 <li className="pl-5 relative before:content-['•'] before:absolute before:left-0 before:text-brand-gold">পণ্যের স্পষ্ট ছবি (Close-up + Full view)।</li>
                 <li className="pl-5 relative before:content-['•'] before:absolute before:left-0 before:text-brand-gold">প্রয়োজন হলে ভিডিও (Unboxing)।</li>
              </ul>
              <p className="text-xs text-brand-primary font-medium">💡 টিপ: ডেলিভারি পাওয়ার পরই ২০-৩০ সেকেন্ডের “unboxing video” করলে সবচেয়ে দ্রুত সমাধান হয়।</p>
           </div>

           <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:-translate-y-1 transition-transform">
              <h3 className="text-xl font-bold text-brand-navy mb-3">📦 পণ্যের অবস্থা</h3>
              <ul className="space-y-2 text-gray-600">
                 <li className="pl-5 relative before:content-['•'] before:absolute before:left-0 before:text-brand-gold">অব্যবহৃত (Unused) হতে হবে।</li>
                 <li className="pl-5 relative before:content-['•'] before:absolute before:left-0 before:text-brand-gold">অক্ষত (Undamaged) হতে হবে।</li>
                 <li className="pl-5 relative before:content-['•'] before:absolute before:left-0 before:text-brand-gold">মূল প্যাকেজিংসহ থাকতে হবে।</li>
              </ul>
           </div>

           <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:-translate-y-1 transition-transform">
              <h3 className="text-xl font-bold text-brand-navy mb-3">💵 Refund Policy</h3>
              <ul className="space-y-2 text-gray-600">
                 <li className="pl-5 relative before:content-['•'] before:absolute before:left-0 before:text-brand-gold">আমরা অভিযোগ যাচাই করে অনুমোদন করবো।</li>
                 <li className="pl-5 relative before:content-['•'] before:absolute before:left-0 before:text-brand-gold">যাচাই শেষে ৭–১০ কার্যদিবসের মধ্যে রিফান্ড।</li>
                 <li className="pl-5 relative before:content-['•'] before:absolute before:left-0 before:text-brand-gold">পেমেন্ট মেথড অনুযায়ী রিফান্ড দেয়া হবে।</li>
              </ul>
           </div>

           <div className="bg-teal-50 p-8 rounded-2xl shadow-sm border border-teal-100 md:col-span-2 hover:-translate-y-1 transition-transform">
              <h3 className="text-xl font-bold text-teal-800 mb-3">🚚 Shipping Cost (শিপিং খরচ)</h3>
              <p className="text-teal-700 leading-relaxed">
                 যদি পণ্য সত্যিই ত্রুটিপূর্ণ, ভুল বা ড্যামেজড প্রমাণিত হয়, সেক্ষেত্রে শিপিং খরচ সম্পূর্ণভাবে <strong>Bunon Fabrics</strong> বহন করবে।
              </p>
           </div>

        </div>

      </div>
    </div>
  );
}
