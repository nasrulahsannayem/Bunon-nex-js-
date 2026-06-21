import { motion } from 'motion/react';
import { Phone, Mail, MapPin, Send, MessageSquare } from 'lucide-react';
import { useState } from 'react';

export default function Contact() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }, 1500);
  };

  return (
    <div className="bg-gray-50 pb-24">
      {/* Hero Section */}
      <section className="relative w-full h-[40vh] min-h-[350px] bg-brand-navy flex items-center justify-center text-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-tr from-brand-navy to-brand-primary/30 z-0" />
        <div className="relative z-10 px-4 max-w-3xl mx-auto w-full">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
            <h1 className="text-white text-4xl sm:text-5xl font-display font-medium leading-[1.1] mb-4">
              Get in <i className="text-brand-gold font-normal italic">Touch</i>
            </h1>
            <p className="text-white/80 text-lg font-light">
              We'd love to hear from you. Here's how you can reach us.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Main Content */}
      <section className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-12 -mt-16 relative z-20">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Contact Info Cards */}
          <div className="lg:col-span-1 space-y-6">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 flex items-start gap-5">
               <div className="w-12 h-12 rounded-full bg-brand-primary/10 flex items-center justify-center shrink-0">
                  <Phone className="w-5 h-5 text-brand-primary" />
               </div>
               <div>
                  <h3 className="text-lg font-semibold text-brand-navy mb-1 leading-none">Phone</h3>
                  <a href="tel:09611900606" className="text-gray-500 hover:text-brand-primary transition-colors">09611900606</a>
               </div>
            </motion.div>
            
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 flex items-start gap-5">
               <div className="w-12 h-12 rounded-full bg-brand-primary/10 flex items-center justify-center shrink-0">
                  <Mail className="w-5 h-5 text-brand-primary" />
               </div>
               <div>
                  <h3 className="text-lg font-semibold text-brand-navy mb-1 leading-none">Email</h3>
                  <a href="mailto:bunonfabric@gmail.com" className="text-gray-500 hover:text-brand-primary transition-colors">bunonfabric@gmail.com</a>
               </div>
            </motion.div>
            
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 flex items-start gap-5">
               <div className="w-12 h-12 rounded-full bg-brand-primary/10 flex items-center justify-center shrink-0">
                  <MapPin className="w-5 h-5 text-brand-primary" />
               </div>
               <div>
                  <h3 className="text-lg font-semibold text-brand-navy mb-1 leading-none">Office</h3>
                  <p className="text-gray-500 leading-relaxed">60 Lake Circus Rd,<br/>Kalabagan, Dhaka, Bangladesh</p>
               </div>
            </motion.div>
          </div>

          {/* Contact Form */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="lg:col-span-2 bg-white rounded-3xl shadow-xl border border-gray-100 p-8 sm:p-12">
            <div className="flex items-center gap-3 mb-8">
               <MessageSquare className="w-6 h-6 text-brand-gold" />
               <h2 className="text-2xl font-bold text-brand-navy">Send us a Message</h2>
            </div>
            
            {success ? (
              <div className="h-64 flex flex-col items-center justify-center text-center">
                 <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
                    <Send className="w-8 h-8" />
                 </div>
                 <h3 className="text-xl font-bold text-brand-navy mb-2">Message Sent!</h3>
                 <p className="text-gray-500">Thank you for reaching out. We will get back to you shortly.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                       <label htmlFor="name" className="text-sm font-semibold text-gray-700">Full Name</label>
                       <input type="text" id="name" required className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary/50 transition-all" placeholder="John Doe" />
                    </div>
                    <div className="space-y-2">
                       <label htmlFor="phone" className="text-sm font-semibold text-gray-700">Phone</label>
                       <input type="tel" id="phone" required className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary/50 transition-all" placeholder="01XXX-XXXXXX" />
                    </div>
                 </div>
                 
                 <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-semibold text-gray-700">Email Address</label>
                    <input type="email" id="email" required className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary/50 transition-all" placeholder="john@example.com" />
                 </div>
                 
                 <div className="space-y-2">
                    <label htmlFor="message" className="text-sm font-semibold text-gray-700">Message</label>
                    <textarea id="message" rows={5} required className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary/50 transition-all resize-none" placeholder="How can we help you?"></textarea>
                 </div>
                 
                 <button 
                  type="submit" 
                  disabled={loading}
                  className="w-full sm:w-auto px-8 py-4 bg-brand-navy text-white rounded-xl font-semibold shadow-sm hover:bg-brand-primary hover:text-white transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                 >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>Send Message <Send className="w-4 h-4" /></>
                    )}
                 </button>
              </form>
            )}
          </motion.div>

        </div>
      </section>
    </div>
  );
}
