import React, { useState, useRef, useEffect } from 'react';
import { 
  MapPin, Clock, Users, Phone, CheckCircle, Send, Star, Zap, ShieldCheck, 
  Briefcase, Award, TrendingUp, Gift, Target, 
  MessageSquare, ShoppingBag, RefreshCcw, Handshake, 
  ChevronDown, Lock, Loader2, Copy
} from 'lucide-react';

const isPriorityArea = (area: string) => {
    const priorityKeywords = ['lalbagh', 'লালবাগ', 'পুরান ঢাকা', 'puran dhaka', 'চানখাঁরপুল', 'azampur', 'চকবাজার'];
    return priorityKeywords.some(keyword => area.toLowerCase().includes(keyword));
};

const Section = ({ id, className = "", children, bg = "bg-white" }: any) => (
  <section id={id} className={`py-16 md:py-24 ${bg} ${className}`}>
    <div className="max-w-5xl mx-auto px-5 md:px-8">
      {children}
    </div>
  </section>
);

const SectionTitle = ({ title, subtitle }: any) => (
  <div className="mb-12 text-center md:text-left">
    <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-4 tracking-tight">{title}</h2>
    {subtitle && <p className="text-slate-600 text-lg md:text-xl max-w-2xl">{subtitle}</p>}
  </div>
);

const Button = ({ children, variant = 'primary', className = "", isLoading, ...props }: any) => {
  const baseStyle = "relative inline-flex items-center justify-center font-bold rounded-2xl transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-offset-1 active:scale-[0.97] overflow-hidden group";
  
  const variants: any = {
    primary: "bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-700 hover:to-violet-700 focus:ring-indigo-500/30 shadow-[0_8px_20px_-6px_rgba(79,70,229,0.5)] hover:shadow-[0_12px_25px_-6px_rgba(79,70,229,0.6)]",
    secondary: "bg-slate-900 text-white hover:bg-slate-800 focus:ring-slate-500/30 shadow-lg",
    outline: "border-2 border-indigo-100 bg-indigo-50/50 text-indigo-700 hover:border-indigo-200 hover:bg-indigo-100 focus:ring-indigo-500/30"
  };

  return (
    <button 
      className={`${baseStyle} ${variants[variant]} ${isLoading ? 'opacity-80 cursor-not-allowed' : ''} ${className}`}
      disabled={isLoading}
      {...props}
    >
      <span className="absolute inset-0 w-full h-full -mt-1 rounded-lg opacity-30 bg-gradient-to-b from-transparent via-transparent to-black pointer-events-none"></span>
      {isLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2 relative z-10" /> : null}
      <span className="relative z-10 flex items-center justify-center gap-2">{children}</span>
    </button>
  );
};

const FormGroup = ({ label, id, required, children, error }: any) => (
  <div className="mb-6 relative group">
    <label htmlFor={id} className="block text-sm font-bold text-slate-700 mb-2 transition-colors group-focus-within:text-indigo-600">
      {label} {required && <span className="text-rose-500">*</span>}
    </label>
    {children}
    {error && <p className="mt-2 text-sm text-rose-500 flex items-center gap-1.5 animate-[slide-down_0.2s_ease-out]"><Lock className="w-3.5 h-3.5"/> {error}</p>}
  </div>
);

const Input = ({ id, ...props }: any) => (
  <input
    id={id}
    className="w-full px-5 py-4 rounded-2xl border-2 border-slate-200 bg-slate-50/50 text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition-all duration-300 outline-none hover:border-slate-300"
    {...props}
  />
);

const Select = ({ id, options, ...props }: any) => (
  <div className="relative">
    <select
      id={id}
      className="w-full px-5 py-4 rounded-2xl border-2 border-slate-200 bg-slate-50/50 text-slate-900 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition-all duration-300 outline-none appearance-none pr-12 cursor-pointer hover:border-slate-300"
      {...props}
    >
      <option value="" disabled>নির্বাচন করুন...</option>
      {options.map((opt: any) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
    </select>
    <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
  </div>
);

const useFOMO = () => {
  const [notification, setNotification] = useState<any>(null);
  
  useEffect(() => {
    const applicants = [
      { name: "রাহিম", area: "মিরপুর", time: "2 min ago" },
      { name: "ফাতেমা", area: "লালবাগ", time: "Just now" },
      { name: "সাকিব", area: "আজিমপুর", time: "5 min ago" },
      { name: "তাসনিম", area: "ধানমন্ডি", time: "1 min ago" },
      { name: "আরিফ", area: "চকবাজার", time: "3 min ago" }
    ];

    let timeout: NodeJS.Timeout;
    const showNotification = () => {
      const randomUser = applicants[Math.floor(Math.random() * applicants.length)];
      setNotification(randomUser);
      
      // Hide after 4 seconds
      timeout = setTimeout(() => {
        setNotification(null);
        // Schedule next showing between 8 to 20 seconds
        timeout = setTimeout(showNotification, Math.random() * 12000 + 8000);
      }, 4000);
    };

    timeout = setTimeout(showNotification, 3000);
    return () => clearTimeout(timeout);
  }, []);

  return notification;
};

const CountdownTimer = ({ targetDate }: { targetDate: string }) => {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date().getTime();
      const distance = new Date(targetDate).getTime() - now;

      if (distance < 0) {
        clearInterval(timer);
        return;
      }

      setTimeLeft({
        days: Math.floor(distance / (1000 * 60 * 60 * 24)),
        hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((distance % (1000 * 60)) / 1000)
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [targetDate]);

  const TimeBox = ({ value, label }: any) => (
    <div className="flex flex-col items-center">
      <div className="bg-white text-indigo-700 font-bold text-xl md:text-2xl w-12 h-12 md:w-14 md:h-14 flex items-center justify-center rounded-xl shadow-sm border border-indigo-100">
        {value.toString().padStart(2, '0')}
      </div>
      <span className="text-[10px] md:text-xs font-semibold text-indigo-800/70 mt-1.5 uppercase tracking-wider">{label}</span>
    </div>
  );

  return (
    <div className="flex gap-3 justify-center items-center p-4 bg-indigo-50/80 backdrop-blur-sm border border-indigo-100 rounded-3xl inline-flex shadow-inner">
      <TimeBox value={timeLeft.days} label="Days" />
      <span className="text-xl font-bold text-indigo-300 -mt-5">:</span>
      <TimeBox value={timeLeft.hours} label="Hours" />
      <span className="text-xl font-bold text-indigo-300 -mt-5">:</span>
      <TimeBox value={timeLeft.minutes} label="Mins" />
      <span className="text-xl font-bold text-indigo-300 -mt-5">:</span>
      <TimeBox value={timeLeft.seconds} label="Secs" />
    </div>
  );
};

const TeleSalesRecruitment = ({ onSuccess }: { onSuccess: (id: string) => void }) => {
  const formRef = useRef<HTMLDivElement>(null);
  const [showStickyCTA, setShowStickyCTA] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const recentApplicant = useFOMO();

  const [formData, setFormData] = useState({
    fullName: '', phone: '', age: '', area: '', experience: '', fullTime: ''
  });

  useEffect(() => {
    // Tracking Pixel
    if (typeof window !== 'undefined' && (window as any).fbq) {
        (window as any).fbq('track', 'PageView');
    }

    const handleScroll = () => {
      if(!formRef.current) return;
      const rect = formRef.current.getBoundingClientRect();
      const isVisible = (rect.top <= window.innerHeight) && ((rect.top + rect.height) >= 0);
      setShowStickyCTA(window.scrollY > 400 && !isVisible);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: value }));
    setFormError(''); 
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError('');
    
    try {
        const dateStr = new Date().toISOString().slice(0,10).replace(/-/g, '');
        const generatedAppId = `BF-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;
        
        // Simulating API call
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        if (typeof window !== 'undefined' && (window as any).fbq) {
            (window as any).fbq('track', 'Lead', {
                content_name: 'Tele-Sales Executive Application'
            });
        }
        if(onSuccess) onSuccess(generatedAppId);
    } catch (error) {
        setFormError('দুঃখিত, কোনো সমস্যা হয়েছে। দয়া করে আবার চেষ্টা করুন।');
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-[#F8FAFC] font-sans selection:bg-indigo-500/30 selection:text-indigo-900 relative overflow-hidden pb-20 md:pb-0">
      
      {/* Background Enhancements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-gradient-to-br from-indigo-200/40 to-violet-200/40 blur-[100px] pointer-events-none"></div>
      <div className="absolute top-[20%] right-[-5%] w-[30%] h-[50%] rounded-full bg-gradient-to-tl from-amber-100/40 to-rose-100/30 blur-[100px] pointer-events-none"></div>

      {/* FOMO Notification */}
      <div className={`fixed bottom-24 md:bottom-8 left-4 md:left-8 z-50 transition-all duration-500 ease-out transform ${recentApplicant ? 'translate-y-0 opacity-100 visible' : 'translate-y-10 opacity-0 invisible'}`}>
        <div className="bg-white/95 backdrop-blur-md px-4 py-3 rounded-2xl shadow-2xl border border-indigo-50 flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0 animate-pulse">
            <Zap className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">{recentApplicant?.name} <span className="text-slate-500 font-normal">({recentApplicant?.area})</span></p>
            <p className="text-xs text-slate-500">Just applied • {recentApplicant?.time}</p>
          </div>
        </div>
      </div>

      {/* HERO SECTION (No Headers/Footers) */}
      <section className="relative pt-12 md:pt-20 pb-16 px-5 md:px-8 max-w-6xl mx-auto z-10">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-rose-100 shadow-sm text-rose-600 text-sm font-bold tracking-wide mb-8 animate-[fade-in-up_0.5s_ease-out]">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-600"></span>
              </span>
              URGENT HIRING: ১টি পদ খালি
            </div>
            
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold text-slate-900 leading-[1.1] mb-6 tracking-tight animate-[fade-in-up_0.7s_ease-out]">
              Build Your Career as a <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">Tele-Sales Exec</span>
            </h1>
            
            <p className="text-lg md:text-xl text-slate-600 mb-8 font-medium max-w-2xl mx-auto lg:mx-0 animate-[fade-in-up_0.9s_ease-out]">
              কাস্টমারের সাথে কথা বলতে ভালোবাসেন? Communication Skill দিয়ে দারুণ একটি ক্যারিয়ার গড়ার সুযোগ দিচ্ছে বুনন ফেব্রিক্স।
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 mb-10 animate-[fade-in-up_1.1s_ease-out]">
              <Button onClick={scrollToForm} className="w-full sm:w-auto px-10 py-4 text-lg">
                <span className="flex items-center gap-2">আবেদন করুন <Send className="w-5 h-5"/></span>
              </Button>
              <div className="flex -space-x-3 items-center">
                <img src="https://i.pravatar.cc/100?img=12" alt="user" className="w-10 h-10 rounded-full border-2 border-white shadow-sm" />
                <img src="https://i.pravatar.cc/100?img=33" alt="user" className="w-10 h-10 rounded-full border-2 border-white shadow-sm" />
                <img src="https://i.pravatar.cc/100?img=47" alt="user" className="w-10 h-10 rounded-full border-2 border-white shadow-sm" />
                <div className="w-10 h-10 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 shadow-sm z-10">40+</div>
                <span className="ml-4 text-sm font-bold text-slate-600">জন ইতিমধ্যে আবেদন করেছেন</span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-left animate-[fade-in-up_1.3s_ease-out]">
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-1 hover:border-indigo-200 transition-colors">
                <Clock className="w-6 h-6 text-indigo-500 mb-1"/>
                <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Type</span>
                <span className="font-extrabold text-slate-900">Full-Time</span>
              </div>
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-1 hover:border-indigo-200 transition-colors">
                <MapPin className="w-6 h-6 text-rose-500 mb-1"/>
                <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Location</span>
                <span className="font-extrabold text-slate-900">Lalbagh</span>
              </div>
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-1 hover:border-indigo-200 transition-colors">
                <Briefcase className="w-6 h-6 text-amber-500 mb-1"/>
                <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Experience</span>
                <span className="font-extrabold text-slate-900">Fresher / Exp.</span>
              </div>
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-1 hover:border-indigo-200 transition-colors">
                <Award className="w-6 h-6 text-emerald-500 mb-1"/>
                <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Salary</span>
                <span className="font-extrabold text-slate-900">Negotiable</span>
              </div>
            </div>
          </div>

          <div className="relative hidden lg:flex justify-center items-center">
            <div className="absolute inset-0 bg-gradient-to-tr from-indigo-200/50 to-violet-100/50 rounded-[3rem] rotate-3 scale-105 transition-transform hover:rotate-6 duration-700"></div>
            <div className="relative bg-white rounded-[2.5rem] p-8 shadow-2xl border border-white/50 w-full max-w-md transform transition-all hover:-translate-y-2 duration-500 z-10">
              
              <div className="absolute -top-6 -right-6 bg-gradient-to-br from-amber-400 to-orange-500 text-white rounded-2xl p-4 shadow-xl rotate-12 animate-[bounce-slow_3s_infinite]">
                 <Target className="w-8 h-8" />
              </div>

              <div className="flex justify-between items-center mb-8 border-b border-slate-100 pb-6">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center border border-indigo-100">
                      <Phone className="w-7 h-7 text-indigo-600" />
                    </div>
                    <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-white"></span>
                    </span>
                  </div>
                  <div>
                    <h3 className="text-lg font-extrabold text-slate-900">Live Call Platform</h3>
                    <p className="text-sm text-emerald-600 font-bold flex items-center gap-1">Connecting Customers</p>
                  </div>
                </div>
              </div>

              <div className="space-y-5">
                {[
                  { icon: <Users/>, bg: "bg-blue-50 text-blue-500", w1: "w-3/4", w2: "w-1/2" },
                  { icon: <MessageSquare/>, bg: "bg-emerald-50 text-emerald-500", w1: "w-full", w2: "w-5/6", active: true },
                  { icon: <ShoppingBag/>, bg: "bg-purple-50 text-purple-500", w1: "w-2/3", w2: "w-1/3" }
                ].map((item, i) => (
                  <div key={i} className={`flex gap-4 items-center ${item.active ? 'p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/50' : ''}`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${item.bg}`}>
                      {React.cloneElement(item.icon as React.ReactElement<{ className?: string }>, { className: "w-5 h-5" })}
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className={`h-2.5 ${item.active ? 'bg-indigo-200' : 'bg-slate-200'} rounded-full ${item.w1}`}></div>
                      <div className={`h-2 ${item.active ? 'bg-indigo-100' : 'bg-slate-100'} rounded-full ${item.w2}`}></div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 pt-6 border-t border-slate-100">
                 <div className="flex justify-between items-end">
                   <div>
                     <p className="text-sm font-bold text-slate-500 mb-1">Weekly Conversion</p>
                     <p className="text-3xl font-black text-slate-900">28.4%</p>
                   </div>
                   <div className="flex items-center gap-1 text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-full text-sm font-bold">
                     <TrendingUp className="w-4 h-4"/> +7.2%
                   </div>
                 </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Section id="benefits" bg="bg-transparent" className="relative z-10 pt-0">
        <SectionTitle 
          title="কেন আমাদের টিমে যোগ দেবেন?" 
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { icon: <Briefcase/>, title: "আকর্ষণীয় বেতন", desc: "যোগ্যতা অনুযায়ী উপযুক্ত ও সম্মানজনক বেতন কাঠামো।", color: "from-blue-500 to-cyan-500" },
            { icon: <Award/>, title: "পারফরম্যান্স রিওয়ার্ড", desc: "ভালো কাজের জন্য থাকছে বিশেষ স্বীকৃতি ও রিওয়ার্ড।", color: "from-emerald-400 to-teal-500" },
            { icon: <TrendingUp/>, title: "বার্ষিক ইনক্রিমেন্ট", desc: "কাজের মূল্যায়নের ভিত্তিতে প্রতি বছর বেতন বৃদ্ধি।", color: "from-indigo-500 to-violet-500" },
            { icon: <Gift/>, title: "উৎসব ভাতা", desc: "বছরে ২টি উৎসব ভাতা (Festival Bonus) প্রদান।", color: "from-amber-400 to-orange-500" },
          ].map((item, i) => (
            <div key={i} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/20 hover:-translate-y-2 hover:shadow-2xl hover:shadow-slate-200/50 transition-all duration-300 group">
              <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${item.color} text-white flex items-center justify-center mb-6 transform group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300 shadow-lg`}>
                {React.cloneElement(item.icon as React.ReactElement<{ className?: string }>, { className: "w-7 h-7" })}
              </div>
              <h3 className="font-extrabold text-slate-900 text-xl mb-3">{item.title}</h3>
              <p className="text-slate-600 font-medium leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section bg="bg-white relative z-10" className="rounded-[3rem] md:rounded-[5rem] mx-2 md:mx-4 shadow-sm border border-slate-100">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-8">পজিশনে আপনার কাজ কী হবে?</h2>
            <div className="space-y-4">
              {[
                "কাস্টমারদের সাথে ফোনে নিয়মিত যোগাযোগ করা",
                "প্রয়োজন বুঝে প্রোডাক্ট সম্পর্কে সঠিক তথ্য দেওয়া",
                "প্রোডাক্ট সাজেস্ট করা ও সেলস কনভার্শনে কাজ করা",
                "কাস্টমার ফলো-আপ এবং রিলেশনশিপ মেইনটেইন করা"
              ].map((req, i) => (
                <div key={i} className="flex items-start gap-4 p-4 rounded-2xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                  <div className="mt-1 w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0">
                    <CheckCircle className="w-5 h-5" />
                  </div>
                  <span className="text-slate-700 font-bold text-lg">{req}</span>
                </div>
              ))}
            </div>
            
            <div className="mt-8 p-6 bg-amber-50/50 border border-amber-200/50 rounded-3xl flex gap-4 items-start shadow-inner">
               <ShieldCheck className="w-8 h-8 text-amber-500 flex-shrink-0" />
               <p className="text-slate-700 font-medium leading-relaxed">
                 <strong className="text-slate-900 block mb-1">ফ্রেশাররাও আবেদন করতে পারবেন!</strong>
                 অভিজ্ঞতা না থাকলেও, শেখার প্রবল আগ্রহ এবং ভালো যোগাযোগ দক্ষতা থাকলে আমরা আপনাকে স্বাগত জানাই।
               </p>
            </div>
          </div>

          <div className="bg-slate-900 rounded-[2.5rem] p-8 md:p-12 relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500 rounded-full blur-[80px] opacity-30"></div>
            <div className="absolute bottom-0 left-0 w-40 h-40 bg-rose-500 rounded-full blur-[80px] opacity-20"></div>
            
            <h3 className="text-2xl font-bold text-white mb-8 flex items-center gap-3 relative z-10">
              <div className="p-2 bg-indigo-500/20 rounded-xl"><MapPin className="text-indigo-400 w-6 h-6"/></div> 
              আপনার কর্মস্থল
            </h3>
            
            <div className="space-y-6 relative z-10">
              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 p-6 rounded-2xl hover:bg-slate-800 transition-colors">
                <p className="text-slate-300 font-medium text-lg leading-relaxed">
                  Shop 12, Level 2,<br/>Lily Shopping Complex,<br/>Lalbagh Killa Mor, Dhaka-1211
                </p>
              </div>
              
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-3 text-indigo-200 bg-indigo-900/40 p-4 rounded-2xl border border-indigo-500/30 flex-1">
                  <Clock className="w-6 h-6 text-indigo-400"/>
                  <div>
                    <p className="text-xs text-indigo-300/70 uppercase font-bold tracking-wider mb-0.5">Office Time</p>
                    <p className="font-bold">সকাল ৯টা – সন্ধ্যা ৮টা</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-gradient-to-r from-amber-500/10 to-transparent p-4 rounded-2xl border-l-4 border-amber-500 flex items-start gap-3 mt-4">
                <Star className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-amber-100 text-sm font-medium leading-relaxed">
                  লালবাগ, পুরান ঢাকা ও আশেপাশের এলাকার প্রার্থীদের বিশেষভাবে অগ্রাধিকার দেওয়া হবে।
                </p>
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section id="application-form" bg="bg-transparent" className="relative z-10">
        
        <div className="text-center mb-10">
          <h2 className="text-lg font-extrabold text-rose-500 uppercase tracking-widest mb-4">হাতে সময় খুব কম!</h2>
          <CountdownTimer targetDate="2026-09-29T23:59:59" />
        </div>

        <div ref={formRef} className="max-w-3xl mx-auto bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200/50 border border-slate-100 overflow-hidden relative">
          <div className="h-1.5 w-full bg-slate-100 absolute top-0 left-0">
             <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 w-full animate-[pulse_2s_infinite]"></div>
          </div>
          
          <div className="p-8 md:p-12">
            <div className="text-center mb-10">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl mb-6 shadow-sm border border-indigo-100">
                <Send className="w-8 h-8 ml-1" />
              </div>
              <h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-3">আবেদন জমা দিন</h2>
              <p className="text-slate-500 font-medium text-lg">নিচের সহজ ফর্মটি পূরণ করতে ১ মিনিটেরও কম সময় লাগবে।</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-2">
              {formError && (
                <div className="mb-6 p-4 bg-rose-50 text-rose-700 rounded-2xl border border-rose-200 text-sm font-bold flex items-center gap-3">
                  <ShieldCheck className="w-5 h-5" />
                  {formError}
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-x-6">
                <FormGroup label="আপনার পুরো নাম" id="fullName" required>
                  <Input 
                    id="fullName" type="text" placeholder="যেমন: মোঃ আবদুল্লাহ" 
                    pattern="^[a-zA-Z\s\u0980-\u09FF]+$" required 
                    value={formData.fullName} onChange={handleInputChange}
                  />
                </FormGroup>
                <FormGroup label="মোবাইল নম্বর" id="phone" required>
                  <Input 
                    id="phone" type="tel" placeholder="01XXXXXXXXX" 
                    required pattern="[0-9]{11}" title="Please enter a valid 11 digit mobile number"
                    value={formData.phone} onChange={handleInputChange}
                  />
                </FormGroup>
              </div>

              <div className="grid md:grid-cols-2 gap-x-6">
                <FormGroup label="আপনার বয়স" id="age" required>
                  <Input 
                    id="age" type="number" min="18" max="45" placeholder="যেমন: ২২" 
                    required value={formData.age} onChange={handleInputChange}
                  />
                </FormGroup>
                <FormGroup label="বর্তমান এলাকা/ঠিকানা" id="area" required>
                  <Input 
                    id="area" type="text" placeholder="যেমন: লালবাগ" 
                    required value={formData.area} onChange={handleInputChange}
                  />
                </FormGroup>
              </div>

              <FormGroup label="Sales বা Call Center-এ কাজের অভিজ্ঞতা" id="experience" required>
                <Select 
                  id="experience" required value={formData.experience} onChange={handleInputChange}
                  options={[
                    { value: "Fresher", label: "কোনো অভিজ্ঞতা নেই (Fresher)" },
                    { value: "Less than 1 year", label: "১ বছরের কম অভিজ্ঞতা আছে" },
                    { value: "1–2 years", label: "১–২ বছরের অভিজ্ঞতা আছে" },
                    { value: "2+ years", label: "২ বছরের বেশি অভিজ্ঞতা আছে" }
                  ]} 
                />
              </FormGroup>

              <FormGroup label="আপনি কি Full-Time কাজ করতে আগ্রহী?" id="fullTime" required>
                 <Select 
                  id="fullTime" required value={formData.fullTime} onChange={handleInputChange}
                  options={[
                    { value: "yes", label: "হ্যাঁ, আমি Full-Time করতে চাই" },
                    { value: "no", label: "না, আমি আগ্রহী নই" }
                  ]} 
                />
              </FormGroup>

              <div className="pt-8">
                <Button type="submit" className="w-full py-5 text-xl tracking-wide shadow-xl shadow-indigo-600/20 hover:shadow-indigo-600/40" isLoading={isSubmitting}>
                  আবেদন সম্পন্ন করুন <Send className="w-6 h-6 ml-2" />
                </Button>
              </div>
              
              <div className="pt-6 text-center">
                <p className="text-sm text-slate-500 flex items-center justify-center gap-2 font-semibold">
                  <Lock className="w-4 h-4 text-emerald-500"/> 
                  আপনার তথ্য সম্পূর্ণ নিরাপদ এবং গোপন রাখা হবে।
                </p>
              </div>
            </form>
          </div>
        </div>
      </Section>

      <div className={`fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-xl border-t border-slate-200 z-50 transition-all duration-500 ease-in-out md:hidden shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.15)] ${showStickyCTA ? 'translate-y-0 opacity-100' : 'translate-y-[150%] opacity-0'}`}>
        <Button onClick={scrollToForm} className="w-full py-4 text-lg shadow-xl shadow-indigo-600/30">
          <span className="flex items-center gap-2 text-white">এখনই আবেদন করুন <Send className="w-5 h-5"/></span>
        </Button>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fade-in-up {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(-5%) rotate(12deg); }
          50% { transform: translateY(5%) rotate(12deg); }
        }
        @keyframes slide-down {
          0% { opacity: 0; transform: translateY(-10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}} />
    </div>
  );
};

const TeleSalesSuccess = ({ appId, onReturn }: { appId: string, onReturn: () => void }) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(appId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-5 relative overflow-hidden">
      
      <div className="absolute inset-0 pointer-events-none opacity-50">
         <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-indigo-500 rounded-full blur-[80px]"></div>
         <div className="absolute bottom-1/4 right-1/4 w-32 h-32 bg-emerald-500 rounded-full blur-[80px]"></div>
      </div>

      <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl p-8 md:p-12 text-center transform transition-all animate-[scale-in_0.4s_cubic-bezier(0.16,1,0.3,1)] relative z-10">
        
        <div className="w-28 h-28 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-8 relative">
          <div className="absolute inset-0 border-4 border-emerald-400 rounded-full animate-[ping_2s_infinite] opacity-50"></div>
          <div className="absolute inset-2 bg-emerald-100 rounded-full"></div>
          <CheckCircle className="w-14 h-14 text-emerald-500 relative z-10" />
        </div>

        <h1 className="text-3xl md:text-4xl font-black text-slate-900 mb-4 tracking-tight">
          অভিনন্দন! 🎉
        </h1>
        
        <p className="text-lg font-bold text-slate-600 mb-8">
          আপনার আবেদন সফলভাবে জমা হয়েছে।
        </p>

        <div className="bg-slate-50 border-2 border-slate-100 hover:border-indigo-100 transition-colors rounded-2xl p-6 mb-8 group cursor-default">
          <p className="text-sm text-slate-500 font-bold uppercase tracking-widest mb-3">Application ID</p>
          <div className="flex items-center justify-center gap-3">
            <code className="text-2xl font-mono font-black text-indigo-600 bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-100/50">
              {appId}
            </code>
            <button 
              onClick={handleCopy}
              className="p-3 bg-white border border-slate-200 hover:bg-slate-100 hover:border-slate-300 rounded-xl transition-all shadow-sm active:scale-95 group/btn relative"
              aria-label="Copy ID"
            >
              {copied ? <CheckCircle className="w-5 h-5 text-emerald-600" /> : <Copy className="w-5 h-5 text-slate-500 group-hover/btn:text-slate-900" />}
              {copied && <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white font-semibold text-xs px-3 py-1.5 rounded-lg shadow-lg">Copied!</span>}
            </button>
          </div>
        </div>

        <p className="text-sm text-slate-600 font-semibold leading-relaxed mb-10 bg-indigo-50/50 p-5 rounded-2xl border border-indigo-100/50">
          আমাদের রিক্রুটমেন্ট টিম আপনার তথ্য পর্যালোচনা করবে। <strong className="text-indigo-700">Shortlisted</strong> প্রার্থীদের সাথে পরবর্তী ধাপের জন্য দ্রুত যোগাযোগ করা হবে।
        </p>

        <Button onClick={onReturn} variant="secondary" className="w-full py-4 text-lg bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors font-bold">
          হোম পেজে ফিরে যান
        </Button>
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes scale-in {
          0% { transform: scale(0.90); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}} />
    </div>
  );
};

export default TeleSalesRecruitment;
export { TeleSalesSuccess };