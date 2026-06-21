import { Link } from 'react-router-dom';
import { Facebook, Mail, Phone, MapPin, Heart, Youtube, Truck, ShieldCheck, Music2 } from 'lucide-react';

export default function Footer() {
  return (
    <footer id="main-footer" className="bg-white pt-20 pb-24 lg:pb-20 overflow-hidden relative border-t border-black/5">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 mb-16">
          {/* Brand */}
          <div className="md:col-span-4 space-y-6">
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
              Bunon Fabrics
            </h2>
            <p className="text-sm text-gray-500 leading-relaxed max-w-sm">
              The complete operating system for your e-commerce business. High-quality products and excellent service guaranteed.
            </p>
            <div className="flex gap-4">
              <a href="https://www.facebook.com/bunon.fabrics1" target="_blank" rel="noreferrer" className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-50 text-gray-500 hover:bg-brand-primary hover:text-white transition-all">
                <Facebook className="w-4 h-4" />
              </a>
              <a href="https://youtube.com/@bunon.fabrics" target="_blank" rel="noreferrer" className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-50 text-gray-500 hover:bg-brand-primary hover:text-white transition-all">
                <Youtube className="w-4 h-4" />
              </a>
              <a href="https://www.tiktok.com/@bunon.fabrics" target="_blank" rel="noreferrer" className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-50 text-gray-500 hover:bg-brand-primary hover:text-white transition-all">
                <Music2 className="w-4 h-4" />
              </a>
              <a href="mailto:bunonfabric@gmail.com" className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-50 text-gray-500 hover:bg-brand-primary hover:text-white transition-all">
                <Mail className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Nav groups */}
          <div className="md:col-span-2 space-y-6">
            <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Quick Links</h4>
            <ul className="space-y-3">
              <li><Link to="/about" className="text-sm font-medium text-gray-500 hover:text-brand-primary transition-colors">About Us</Link></li>
              <li><Link to="/shop" className="text-sm font-medium text-gray-500 hover:text-brand-primary transition-colors">Shop</Link></li>
              <li><Link to="/contact" className="text-sm font-medium text-gray-500 hover:text-brand-primary transition-colors">Contact Us</Link></li>
            </ul>
          </div>
          <div className="md:col-span-2 space-y-6">
            <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Legal</h4>
            <ul className="space-y-3">
              <li><Link to="/refund-policy" className="text-sm font-medium text-gray-500 hover:text-brand-primary transition-colors">Refund & Returns</Link></li>
              <li><Link to="/terms" className="text-sm font-medium text-gray-500 hover:text-brand-primary transition-colors">Terms & Conditions</Link></li>
              <li><Link to="/privacy-policy" className="text-sm font-medium text-gray-500 hover:text-brand-primary transition-colors">Privacy Policy</Link></li>
              <li><Link to="/dmca" className="text-sm font-medium text-gray-500 hover:text-brand-primary transition-colors">DMCA</Link></li>
            </ul>
          </div>

          {/* Newsletter */}
          <div className="md:col-span-4 space-y-6">
            <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Newsletter</h4>
            <p className="text-sm text-gray-500">Subscribe effectively to our newsletter and get the latest updates.</p>
            <div className="flex bg-gray-50 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-brand-primary/50 transition-all border border-black/5">
              <input type="email" placeholder="Your email address" className="bg-transparent border-none outline-none flex-1 px-4 py-3 text-sm font-medium placeholder:text-gray-400 text-gray-900" />
              <button className="px-5 font-semibold text-white bg-brand-primary hover:brightness-105 transition-all text-sm">Subscribe</button>
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-black/5 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-col gap-1 items-center md:items-start text-center md:text-left text-sm text-gray-500">
             <p className="font-semibold text-gray-700">
               &copy; {new Date().getFullYear()} Bunon Fabrics. All rights reserved.
             </p>
             <span>60 Lake Circus Rd, Kalabagan, Dhaka. | Hotline: 09611900606</span>
          </div>
          <img src="https://bunonfabrics.com/wp-content/uploads/2025/03/Payment-1-1024x98-1-1.png" className="h-5 opacity-50 grayscale hover:grayscale-0 transition-opacity" alt="Secure Payment" />
        </div>
      </div>
    </footer>
  );
}
