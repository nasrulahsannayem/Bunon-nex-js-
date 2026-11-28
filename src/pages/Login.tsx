import { useState, useEffect } from 'react';
import { SeoHead } from '../components/SeoHead';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User, Lock, Phone } from 'lucide-react';

export default function Login() {
  const location = useLocation();
  const [isLogin, setIsLogin] = useState(!location.state?.isSignUp);

  useEffect(() => {
    if (location.state?.isSignUp !== undefined) {
      setIsLogin(!location.state.isSignUp);
    }
  }, [location.state]);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  
  const navigate = useNavigate();

  // 🔐 GOOGLE SIGN-IN HANDLER
  // The backend redirects back to /login#token=... after Google consent, so the
  // JWT arrives in the fragment (never sent to the server or a referrer) and we
  // store it exactly like the password flow does. Google accounts with no bunon
  // profile are auto-created by the callback, so there is nothing to submit here.
  useEffect(() => {
    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
    if (!hash) return;
    const params = new URLSearchParams(hash);
    const token = params.get('token');
    const err = new URLSearchParams(window.location.search).get('error');
    if (err) {
      setError(decodeURIComponent(err));
      window.history.replaceState({}, '', '/login');
      return;
    }
    if (token) {
      localStorage.setItem('bunon_token', token);
      localStorage.setItem(
        'bunon_user',
        JSON.stringify({
          name: params.get('name') || '',
          email: params.get('email') || '',
          phone: null,
          picture: params.get('picture') || null,
        })
      );
      window.history.replaceState({}, '', '/login');
      navigate('/profile');
      window.location.reload();
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    if (isForgotPassword) {
      try {
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone })
        });
        const data = await res.json();
        if (data.ok) {
          setSuccessMsg(data.msg);
          setTimeout(() => setIsForgotPassword(false), 5000);
        } else {
          setError(data.msg || 'Failed to reset password');
        }
      } catch (err) {
        setError('Something went wrong. Please try again.');
      } finally {
        setLoading(false);
      }
      return;
    }

    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
    const payload = isLogin 
      ? { phone, password } 
      : { phone, password, name, email };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.ok) {
        localStorage.setItem('bunon_token', data.token);
        localStorage.setItem('bunon_user', JSON.stringify(data.user));
        navigate('/profile');
        window.location.reload();
      } else {
        setError(data.msg || 'Authentication failed');
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  <SeoHead noindex={true} />
    return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          {isForgotPassword ? 'পাসওয়ার্ড ভুলে গেছেন?' : (isLogin ? 'আপনার অ্যাকাউন্টে লগইন করুন' : 'নতুন অ্যাকাউন্ট তৈরি করুন')}
        </h2>
        
        {!isForgotPassword && (
          <p className="mt-2 text-center text-sm text-gray-600">
            অথবা{' '}
            <button 
              onClick={() => setIsLogin(!isLogin)} 
              className="font-medium text-brand-primary hover:text-brand-primary/80"
            >
              {isLogin ? 'নতুন অ্যাকাউন্ট খুলুন' : 'লগইন পেইজে ফিরে যান'}
            </button>
          </p>
        )}
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl sm:rounded-2xl sm:px-10 border border-gray-100">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-50 text-red-500 text-sm p-3 rounded-xl border border-red-100 text-center">
                {error}
              </div>
            )}
            {successMsg && (
              <div className="bg-green-50 text-green-600 text-sm p-3 rounded-xl border border-green-100 text-center">
                {successMsg}
              </div>
            )}

            {!isLogin && !isForgotPassword && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700">আপনার নাম</label>
                  <div className="mt-1 relative rounded-md shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <User className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      required={!isLogin}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="focus:ring-brand-primary focus:border-brand-primary block w-full pl-10 sm:text-sm border-gray-300 rounded-xl h-11 bg-gray-50 border"
                      placeholder="আপনার পূর্ণ নাম"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">ইমেইল (Optional)</label>
                  <div className="mt-1 relative rounded-md shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <User className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="focus:ring-brand-primary focus:border-brand-primary block w-full pl-10 sm:text-sm border-gray-300 rounded-xl h-11 bg-gray-50 border"
                      placeholder="আপনার ইমেইল অ্যাড্রেস"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700">ফোন নম্বর</label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Phone className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="focus:ring-brand-primary focus:border-brand-primary block w-full pl-10 sm:text-sm border-gray-300 rounded-xl h-11 bg-gray-50 border"
                  placeholder="017XXXXXXXX"
                />
              </div>
            </div>

            {!isForgotPassword && (
              <div>
                <label className="block text-sm font-medium text-gray-700">পাসওয়ার্ড</label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="focus:ring-brand-primary focus:border-brand-primary block w-full pl-10 sm:text-sm border-gray-300 rounded-xl h-11 bg-gray-50 border"
                    placeholder="আপনার পাসওয়ার্ড"
                  />
                </div>
                
                {isLogin && (
                  <div className="mt-2 text-right">
                    <button
                      type="button"
                      onClick={() => setIsForgotPassword(true)}
                      className="text-xs font-medium text-brand-primary hover:text-brand-primary/80"
                    >
                      পাসওয়ার্ড ভুলে গেছেন?
                    </button>
                  </div>
                )}
              </div>
            )}

            <div>
              <motion.button
                whileTap={{ scale: 0.98 }}
                disabled={loading}
                type="submit"
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-brand-primary hover:bg-brand-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-primary transition-colors disabled:opacity-50"
              >
                {loading ? 'দয়া করে অপেক্ষা করুন...' : (isForgotPassword ? 'পাসওয়ার্ড রিসেট করুন' : (isLogin ? 'লগইন করুন' : 'অ্যাকাউন্ট তৈরি করুন'))}
              </motion.button>
            </div>

            {/* 🔐 Google sign-in — a second way to reach the same account, not a
                replacement. Customers who already order as guests are unaffected;
                this just lets someone claim a profile in one tap so /profile,
                order history and wishlist work for them. Hidden on the
                forgot-password screen, where it makes no sense. */}
            {!isForgotPassword && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="h-px flex-1 bg-gray-200" />
                  <span className="text-xs font-medium text-gray-400">অথবা</span>
                  <span className="h-px flex-1 bg-gray-200" />
                </div>
                <a
                  href="/api/auth/google"
                  className="w-full flex justify-center items-center gap-3 py-3 px-4 border border-gray-300 rounded-xl shadow-sm text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-400 transition-colors"
                >
                  {/* Google's brand mark, inline so no external request is made. */}
                  <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.77.43 3.45 1.18 4.94l3.66-2.84z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  Google দিয়ে চালিয়া যান
                </a>
                <p className="text-[11px] text-center text-gray-400 leading-relaxed">
                  Google অ্যাকাউন্ট না থাকলে একটি নতুন প্রোফাইল নিজে থেকেই তৈরি হবে।
                </p>
              </div>
            )}
            
            {isForgotPassword && (
              <div className="text-center mt-4">
                <button
                  type="button"
                  onClick={() => setIsForgotPassword(false)}
                  className="text-sm font-medium text-gray-600 hover:text-gray-900"
                >
                  ফিরে যান
                </button>
              </div>
            )}
            
          </form>
        </div>
      </div>
    </div>
  );
}
