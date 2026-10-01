import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, Phone, ShieldCheck } from 'lucide-react';

export default function AdminLogin() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Redirect if already logged in as admin (token + role both required)
  useEffect(() => {
    const userStr = localStorage.getItem('bunon_user');
    const token = localStorage.getItem('bunon_token');
    if (userStr && token) {
      try {
        const user = JSON.parse(userStr);
        if (user.role === 'admin' || user.role === 'staff' || user.role === 'super_admin') {
          navigate('/admin');
        }
      } catch (e) {}
    }
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, phone: identifier, username: identifier, password })
      });
      const data = await res.json();

      if (data.ok) {
        if (data.user.role === 'admin' || data.user.role === 'staff' || data.user.role === 'super_admin') {
          localStorage.setItem('bunon_token', data.token);
          localStorage.setItem('bunon_user', JSON.stringify(data.user));
          navigate('/admin');
          window.location.reload();
        } else {
          setError('Access Denied. You do not have admin privileges.');
        }
      } else {
        setError(data.msg || 'Authentication failed');
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-brand-primary/20 rounded-full blur-[100px]"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-blue-500/20 rounded-full blur-[100px]"></div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex justify-center"
        >
          <div className="bg-brand-primary p-3 rounded-2xl shadow-lg shadow-brand-primary/30">
            <ShieldCheck size={40} className="text-white" />
          </div>
        </motion.div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-white tracking-tight">
          Admin <span className="text-brand-primary">Portal</span>
        </h2>
        <p className="mt-2 text-center text-sm text-gray-400">
          Authorized personnel only
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-gray-800/50 backdrop-blur-xl py-8 px-4 shadow-2xl sm:rounded-3xl sm:px-10 border border-gray-700/50"
        >
          <form className="space-y-6" onSubmit={handleLogin}>
            {error && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }} 
                animate={{ opacity: 1, x: 0 }} 
                className="bg-red-500/10 text-red-400 text-sm p-4 rounded-xl border border-red-500/20 text-center font-medium"
              >
                {error}
              </motion.div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-300">Username / Phone</label>
              <div className="mt-2 relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Phone className="h-5 w-5 text-gray-500" />
                </div>
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="focus:ring-2 focus:ring-brand-primary focus:border-brand-primary block w-full pl-11 sm:text-sm border-gray-600 rounded-xl h-12 bg-gray-900/50 text-white placeholder-gray-500 transition-all outline-none"
                  placeholder="Username or 017XXXXXXXX"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300">Secret Key</label>
              <div className="mt-2 relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-500" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="focus:ring-2 focus:ring-brand-primary focus:border-brand-primary block w-full pl-11 sm:text-sm border-gray-600 rounded-xl h-12 bg-gray-900/50 text-white placeholder-gray-500 transition-all outline-none"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="pt-2">
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                disabled={loading}
                type="submit"
                className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-[0_0_20px_rgba(226,19,110,0.3)] text-sm font-bold text-white bg-brand-primary hover:bg-brand-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-primary focus:ring-offset-gray-900 transition-all disabled:opacity-50"
              >
                {loading ? 'Authenticating...' : 'Secure Login'}
              </motion.button>
            </div>
            
          </form>
        </motion.div>
      </div>
    </div>
  );
}
