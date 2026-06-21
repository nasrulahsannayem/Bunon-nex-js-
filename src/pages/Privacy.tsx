export default function Privacy() {
  return (
    <div className="bg-gray-50 pb-24 pt-10">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        
        {/* Header */}
        <div className="text-center mb-12 border-b border-gray-200 pb-8">
           <h1 className="text-3xl sm:text-4xl font-display font-bold text-brand-primary mb-4">
             Privacy Policy
           </h1>
           <p className="text-gray-600 font-medium">
             Bunon Fabrics-এ আপনার ব্যক্তিগত তথ্যের গোপনীয়তা আমাদের অগ্রাধিকার। এই নীতিমালা ব্যাখ্যা করে আমরা কীভাবে আপনার তথ্য সংগ্রহ ও সুরক্ষা করি।
           </p>
        </div>

        {/* Content */}
        <div className="space-y-6">
           
           <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="text-xl font-bold text-brand-navy mb-4 border-l-4 border-brand-primary pl-3">১) আমরা কী ধরনের তথ্য সংগ্রহ করি</h3>
              <ul className="space-y-3 text-gray-600">
                 <li className="pl-5 relative before:content-['•'] before:absolute before:left-0 before:text-brand-primary"><strong>ব্যক্তিগত তথ্য:</strong> নাম, মোবাইল নম্বর, ইমেইল, ডেলিভারি ঠিকানা।</li>
                 <li className="pl-5 relative before:content-['•'] before:absolute before:left-0 before:text-brand-primary"><strong>অর্ডার তথ্য:</strong> পণ্য/সাইজ/কালার, অর্ডার হিস্ট্রি।</li>
                 <li className="pl-5 relative before:content-['•'] before:absolute before:left-0 before:text-brand-primary"><strong>পেমেন্ট তথ্য:</strong> পেমেন্ট স্ট্যাটাস/ট্রানজ্যাকশন রেফারেন্স।</li>
                 <li className="pl-5 relative before:content-['•'] before:absolute before:left-0 before:text-brand-primary"><strong>টেকনিক্যাল তথ্য:</strong> ডিভাইস টাইপ, কুকি/লগ ডাটা (সাইট উন্নয়নের জন্য)।</li>
              </ul>
           </div>

           <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="text-xl font-bold text-brand-navy mb-4 border-l-4 border-brand-primary pl-3">২) আপনার তথ্য কেন ব্যবহার করি</h3>
              <ul className="space-y-3 text-gray-600">
                 <li className="pl-5 relative before:content-['•'] before:absolute before:left-0 before:text-brand-primary">অর্ডার প্রসেসিং, কনফার্মেশন ও ডেলিভারির জন্য।</li>
                 <li className="pl-5 relative before:content-['•'] before:absolute before:left-0 before:text-brand-primary">কাস্টমার এক্সপেরিয়েন্স অপ্টিমাইজ করার জন্য।</li>
                 <li className="pl-5 relative before:content-['•'] before:absolute before:left-0 before:text-brand-primary">প্রতারণা শনাক্তকরণ ও নিরাপত্তা নিশ্চিত করতে।</li>
                 <li className="pl-5 relative before:content-['•'] before:absolute before:left-0 before:text-brand-primary">প্রয়োজন হলে অফার/আপডেট পাঠাতে (অপ্ট-আউট অপশন সহ)।</li>
              </ul>
           </div>

           <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="text-xl font-bold text-brand-navy mb-4 border-l-4 border-brand-primary pl-3">৩) তথ্য শেয়ারিং (Third Party)</h3>
              <p className="text-gray-600 mb-3">✅ আপনার সম্মতি ছাড়া আমরা তথ্য বিক্রি বা ভাড়া দিই না। তবে সার্ভিস দিতে সীমিত পরিসরে শেয়ার হতে পারে:</p>
              <ul className="space-y-2 text-gray-600">
                 <li className="pl-5 relative before:content-['•'] before:absolute before:left-0 before:text-brand-primary">কুরিয়ার/ডেলিভারি পার্টনার।</li>
                 <li className="pl-5 relative before:content-['•'] before:absolute before:left-0 before:text-brand-primary">পেমেন্ট গেটওয়ে/ব্যাংক।</li>
                 <li className="pl-5 relative before:content-['•'] before:absolute before:left-0 before:text-brand-primary">আইনগত বাধ্যবাধকতায় সংশ্লিষ্ট কর্তৃপক্ষ।</li>
              </ul>
           </div>

           <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="text-xl font-bold text-brand-navy mb-3 border-l-4 border-brand-primary pl-3">৪) কুকি (Cookies)</h3>
              <p className="text-gray-600 leading-relaxed">আমরা সাইট পারফরম্যান্স ও অভিজ্ঞতা ব্যক্তিগতকরণ করতে কুকি ব্যবহার করতে পারি। আপনি ব্রাউজার থেকে তা বন্ধ করতে পারেন।</p>
           </div>

           <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="text-xl font-bold text-brand-navy mb-3 border-l-4 border-brand-primary pl-3">৫) তথ্য সুরক্ষা ও সংরক্ষণ</h3>
              <p className="text-gray-600 leading-relaxed">আমরা তথ্যের সুরক্ষায় যথাযথ টেকনিক্যাল ব্যবস্থা গ্রহণ করি। আইনি বা সাপোর্টের প্রয়োজনে যতদিন দরকার, ততদিন তথ্য সংরক্ষণ করা হয়।</p>
           </div>
           
           <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="text-xl font-bold text-brand-navy mb-4 border-l-4 border-brand-primary pl-3">৬) আপনার অধিকার</h3>
              <ul className="space-y-3 text-gray-600">
                 <li className="pl-5 relative before:content-['•'] before:absolute before:left-0 before:text-brand-primary">তথ্য আপডেট/সংশোধন করার অধিকার।</li>
                 <li className="pl-5 relative before:content-['•'] before:absolute before:left-0 before:text-brand-primary">মার্কেটিং মেসেজ বন্ধ (Unsubscribe) করার অধিকার।</li>
                 <li className="pl-5 relative before:content-['•'] before:absolute before:left-0 before:text-brand-primary">নির্দিষ্ট ক্ষেত্রে তথ্য ডিলিট করার অনুরোধ।</li>
              </ul>
           </div>
           
           <div className="bg-brand-navy p-8 rounded-2xl shadow-sm text-white text-center mt-8">
              <h4 className="text-lg font-bold mb-4 text-brand-gold">যোগাযোগ</h4>
              <p className="mb-2">ইমেইল: <a href="mailto:bunonfabric@gmail.com" className="hover:text-brand-gold transition-colors">bunonfabric@gmail.com</a></p>
              <p>WhatsApp: <a href="tel:+8801618775368" className="hover:text-brand-gold transition-colors">+8801618775368</a></p>
           </div>

        </div>
      </div>
    </div>
  );
}
