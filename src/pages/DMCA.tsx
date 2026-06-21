import { Shield } from 'lucide-react';
import { useState } from 'react';

export default function DMCA() {
  const [copied, setCopied] = useState(false);

  const copyInfo = () => {
    const info = `Bunon Fabrics DMCA Info\nLicense: TRAD/DSCC/000158/2024\nTrademark: 08D9EBF9\nEmail: bunonfabric@gmail.com\nJurisdiction: Bangladesh & Global`;
    navigator.clipboard.writeText(info).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="bg-gray-50 pb-24 pt-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        
        {/* Header */}
        <div className="text-center mb-12 border-b border-gray-200 pb-10">
           <div className="flex justify-center mb-4">
             <Shield className="w-16 h-16 text-brand-navy" />
           </div>
           <h1 className="text-3xl sm:text-4xl font-display font-bold text-brand-navy mb-4">
             Official DMCA Declaration
           </h1>
           <p className="text-gray-500 font-medium inline-block bg-white px-6 py-2 rounded-full border border-gray-200 shadow-sm">
             Protected Intellectual Property of Bunon Fabrics
           </p>
        </div>

        {/* Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
           
           <div className="bg-white p-8 rounded-2xl shadow-md border-t-4 border-t-red-600 border border-gray-100 relative overflow-hidden group hover:-translate-y-1 transition-transform">
              <div className="absolute top-0 right-0 w-24 h-24 bg-red-50 rounded-bl-[100px] -z-10 group-hover:scale-110 transition-transform"></div>
              <h2 className="text-xl font-bold text-brand-navy mb-6 flex justify-between items-center border-b border-gray-100 pb-4">
                <span>🇧🇩 বাংলা সংস্করণ</span>
              </h2>
              <ul className="space-y-4 text-gray-700 mb-6">
                 <li>প্রতিষ্ঠান: <strong className="text-brand-navy">Bunon Fabrics</strong></li>
                 <li className="flex items-center flex-wrap gap-2">
                   ট্রেড লাইসেন্স: <code className="bg-gray-100 px-2 py-1 rounded text-sm text-brand-primary font-mono">TRAD/DSCC/000158/2024</code>
                   <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-100 text-green-700 text-[10px] uppercase font-bold tracking-wider">
                     <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span> Active
                   </span>
                 </li>
                 <li className="flex items-center flex-wrap gap-2">
                   ট্রেডমার্ক: <code className="bg-gray-100 px-2 py-1 rounded text-sm text-brand-primary font-mono">08D9EBF9</code>
                   <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-blue-100 text-blue-700 text-[10px] uppercase font-bold tracking-wider">
                     <Shield className="w-3 h-3" /> Verified
                   </span>
                 </li>
                 <li>মালিক: <strong>Md. Nasrul Ahsan</strong></li>
                 <li>কার্যক্ষেত্র: বাংলাদেশ ও বৈশ্বিক</li>
              </ul>
              <div className="bg-red-50 text-red-800 p-4 rounded-xl text-sm border-l-4 border-red-600 font-medium">
                ⚠️ বুননের সব কনটেন্ট কপিরাইট আইনের অধীনে সুরক্ষিত। অনুমতি ছাড়া ব্যবহার করলে কঠোর আইনানুগ ব্যবস্থা নেওয়া হবে।
              </div>
           </div>

           <div className="bg-white p-8 rounded-2xl shadow-md border-t-4 border-t-brand-navy border border-gray-100 relative overflow-hidden group hover:-translate-y-1 transition-transform">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-bl-[100px] -z-10 group-hover:scale-110 transition-transform"></div>
              <h2 className="text-xl font-bold text-brand-navy mb-6 flex justify-between items-center border-b border-gray-100 pb-4">
                <span>🌍 English Version</span>
              </h2>
              <ul className="space-y-4 text-gray-700 mb-6">
                 <li>Business: <strong className="text-brand-navy">Bunon Fabrics</strong></li>
                 <li className="flex items-center flex-wrap gap-2">
                   Trade License: <code className="bg-gray-100 px-2 py-1 rounded text-sm text-brand-primary font-mono">TRAD/DSCC/000158/2024</code>
                   <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-100 text-green-700 text-[10px] uppercase font-bold tracking-wider">
                     <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span> Active
                   </span>
                 </li>
                 <li className="flex items-center flex-wrap gap-2">
                   Trademark: <code className="bg-gray-100 px-2 py-1 rounded text-sm text-brand-primary font-mono">08D9EBF9</code>
                   <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-blue-100 text-blue-700 text-[10px] uppercase font-bold tracking-wider">
                     <Shield className="w-3 h-3" /> Verified
                   </span>
                 </li>
                 <li>Owner: <strong>Md. Nasrul Ahsan</strong></li>
                 <li>Jurisdiction: Bangladesh & Global</li>
              </ul>
              <div className="bg-blue-50 text-blue-800 p-4 rounded-xl text-sm border-l-4 border-brand-navy font-medium">
                🛡️ All creative assets are protected under international copyright law. Unauthorized use will result in legal action.
              </div>
           </div>

           <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 md:col-span-2 text-center">
              <h2 className="text-xl font-bold text-brand-navy mb-4">📧 Legal Contact & Reports</h2>
              <p className="text-gray-500 mb-6">For copyright concerns or takedown requests, contact our legal team:</p>
              <a href="mailto:bunonfabric@gmail.com" className="text-2xl font-bold text-brand-primary hover:text-brand-navy transition-colors underline underline-offset-4 decoration-brand-primary/30">bunonfabric@gmail.com</a>
              
              <div className="mt-10 pt-8 border-t border-gray-100 flex flex-wrap justify-center gap-4">
                 <button 
                  onClick={copyInfo}
                  className={`px-6 py-3 rounded-xl font-semibold transition-all ${copied ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                 >
                   {copied ? 'Copied to Clipboard!' : 'Copy DMCA Info'}
                 </button>
                 <a href="mailto:bunonfabric@gmail.com?subject=DMCA%20Violation%20Report" className="px-6 py-3 rounded-xl font-semibold bg-red-600 text-white hover:bg-red-700 transition-all shadow-md shadow-red-600/20">
                   Report Violation
                 </a>
              </div>
           </div>

        </div>

      </div>
    </div>
  );
}
