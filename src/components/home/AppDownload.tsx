import { Download, Smartphone } from 'lucide-react';

export default function AppDownload() {
  return (
    <section className="py-24 bg-navy relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 relative z-10">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center text-gold mb-8">
            <Smartphone className="w-8 h-8" />
          </div>
          <h2 className="text-4xl font-serif text-white mb-6">Experience Faster Shopping</h2>
          <p className="text-stone-400 max-w-md mb-10 text-lg">
            Download our official Android app for a seamless tracking and browsing experience.
          </p>
          <a 
            href="/bunonfabrics.apk" 
            download
            className="group relative inline-flex items-center gap-4 bg-white text-navy px-10 py-5 rounded-full font-bold uppercase tracking-widest text-xs transition-all hover:bg-gold hover:text-white"
          >
            <Download className="w-5 h-5 group-hover:animate-bounce" />
            Download For Android
          </a>
        </div>
      </div>

      {/* Decorative Ornaments */}
      <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-ruby/10 rounded-full blur-3xl opacity-50" />
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-gold/10 rounded-full blur-3xl opacity-50" />
    </section>
  );
}
