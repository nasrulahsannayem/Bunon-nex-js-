import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, MapPin, Package, LogOut, Ticket, Heart, ShieldCheck, Mail, Phone, ShoppingBag, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Profile() {
  const [user, setUser] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'orders' | 'wishlist' | 'settings'>('orders');
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('bunon_token');
    if (!token) {
      navigate('/login');
      return;
    }

    const fetchProfileAndOrders = async () => {
      try {
        const [profileRes, ordersRes] = await Promise.all([
          fetch('/api/auth/profile', { headers: { 'Authorization': `Bearer ${token}` } }),
          fetch('/api/auth/orders', { headers: { 'Authorization': `Bearer ${token}` } })
        ]);

        const profileData = await profileRes.json();
        const ordersData = await ordersRes.json();

        if (profileData.ok) setUser(profileData.user);
        if (ordersData.ok) setOrders(ordersData.orders);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfileAndOrders();
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('bunon_token');
    localStorage.removeItem('bunon_user');
    navigate('/login');
    window.location.reload();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin"></div>
          <p className="text-gray-500 font-medium animate-pulse">Loading your profile...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#f8f9fa] pt-24 pb-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">My Profile</h1>
            <p className="text-gray-500 mt-1">Manage your orders and account settings</p>
          </div>
          <button 
            onClick={handleLogout}
            className="group flex items-center justify-center gap-2 text-red-600 hover:text-white bg-red-50 hover:bg-red-500 px-5 py-2.5 rounded-xl font-semibold transition-all duration-300 shadow-sm hover:shadow-md"
          >
            <LogOut className="w-4 h-4 transition-transform group-hover:-translate-x-1" /> Sign Out
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Sidebar - Profile Card */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* User Info Card */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-3xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100/50 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-br from-brand-primary/10 to-pink-500/10"></div>
              <div className="relative text-center mt-8">
                <div className="w-28 h-28 bg-white rounded-full flex items-center justify-center mx-auto mb-5 shadow-lg border-4 border-white relative">
                  <div className="w-full h-full bg-gradient-to-br from-brand-primary to-pink-500 rounded-full flex items-center justify-center text-white">
                    <User className="w-12 h-12" />
                  </div>
                  <div className="absolute bottom-1 right-1 w-5 h-5 bg-green-500 border-2 border-white rounded-full"></div>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-1">{user.name || 'সম্মানিত গ্রাহক'}</h2>
                <div className="flex items-center justify-center gap-1.5 text-brand-primary font-medium bg-brand-primary/10 px-3 py-1 rounded-full w-fit mx-auto text-sm mb-6">
                  <ShieldCheck className="w-4 h-4" /> Verified Customer
                </div>

                <div className="space-y-4 text-left border-t border-gray-100 pt-6 mt-6">
                  <div className="flex items-center gap-3 text-gray-600 group">
                    <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center group-hover:bg-brand-primary/10 transition-colors">
                      <Phone className="w-5 h-5 text-gray-400 group-hover:text-brand-primary transition-colors" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 font-medium">Phone</p>
                      <p className="font-medium text-gray-900">{user.phone}</p>
                    </div>
                  </div>
                  {user.email && (
                    <div className="flex items-center gap-3 text-gray-600 group">
                      <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center group-hover:bg-brand-primary/10 transition-colors">
                        <Mail className="w-5 h-5 text-gray-400 group-hover:text-brand-primary transition-colors" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 font-medium">Email</p>
                        <p className="font-medium text-gray-900 truncate max-w-[200px]">{user.email}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-gray-600 group">
                    <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center group-hover:bg-brand-primary/10 transition-colors">
                      <MapPin className="w-5 h-5 text-gray-400 group-hover:text-brand-primary transition-colors" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 font-medium">Default Address</p>
                      {user.default_address ? (
                        <p className="font-medium text-gray-900 text-sm leading-snug pr-4">
                          {user.default_address}{user.default_city ? `, ${user.default_city}` : ''}
                        </p>
                      ) : (
                        <p className="text-sm text-gray-400 italic">No address set</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Special Offers Section */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden group cursor-pointer"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/30 rounded-full blur-3xl group-hover:bg-brand-primary/40 transition-colors"></div>
              <Ticket className="w-24 h-24 absolute -right-6 -bottom-6 text-white/5 group-hover:scale-110 transition-transform duration-500" />
              
              <div className="relative z-10">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-xs font-semibold backdrop-blur-md mb-4 border border-white/10">
                  <Ticket className="w-3.5 h-3.5" /> VIP OFFER
                </span>
                <h3 className="text-xl font-bold mb-2">Exclusive Discount</h3>
                <p className="text-gray-300 text-sm mb-6 leading-relaxed">Use this special coupon on your next purchase to get a flat discount.</p>
                <div className="bg-white/10 px-4 py-3 rounded-xl text-center backdrop-blur-md border border-white/20">
                  <span className="font-mono text-xl font-extrabold tracking-widest text-brand-primary mix-blend-plus-lighter">BUNON-VIP</span>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Right Content - Orders & Activity */}
          <div className="lg:col-span-8">
            <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100/50 overflow-hidden min-h-[600px]">
              
              {/* Custom Tabs */}
              <div className="flex items-center gap-8 px-8 pt-6 border-b border-gray-100 overflow-x-auto custom-scrollbar">
                <button 
                  onClick={() => setActiveTab('orders')}
                  className={`pb-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === 'orders' ? 'border-brand-primary text-brand-primary' : 'border-transparent text-gray-400 hover:text-gray-700'
                  }`}
                >
                  <Package className="w-4 h-4" /> My Orders 
                  <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeTab === 'orders' ? 'bg-brand-primary/10 text-brand-primary' : 'bg-gray-100 text-gray-500'}`}>
                    {orders.length}
                  </span>
                </button>
                <button 
                  onClick={() => navigate('/wishlist')}
                  className={`pb-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap border-transparent text-gray-400 hover:text-gray-700`}
                >
                  <Heart className="w-4 h-4" /> Wishlist
                </button>
              </div>

              {/* Tab Content */}
              <div className="p-8">
                <AnimatePresence mode="wait">
                  {activeTab === 'orders' && (
                    <motion.div
                      key="orders"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-4"
                    >
                      {orders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                          <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                            <ShoppingBag className="w-10 h-10 text-gray-300" />
                          </div>
                          <h3 className="text-xl font-bold text-gray-900 mb-2">No Orders Yet</h3>
                          <p className="text-gray-500 mb-6 max-w-sm">Looks like you haven't made your choice yet. Explore our latest collections!</p>
                          <button 
                            onClick={() => navigate('/shop')}
                            className="bg-brand-primary text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-brand-primary/90 transition-colors shadow-sm"
                          >
                            Start Shopping
                          </button>
                        </div>
                      ) : (
                        orders.map((order, idx) => (
                          <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            key={order.id} 
                            className="group bg-white border border-gray-100 rounded-2xl p-6 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:border-brand-primary/20 transition-all duration-300"
                          >
                            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                              <div className="flex items-start gap-4">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                                  order.status === 'completed' || order.status === 'shipped' ? 'bg-green-50 text-green-600' :
                                  order.status === 'processing' ? 'bg-blue-50 text-blue-600' :
                                  'bg-orange-50 text-orange-600'
                                }`}>
                                  {order.status === 'completed' || order.status === 'shipped' ? <Package className="w-6 h-6" /> :
                                   order.status === 'processing' ? <Clock className="w-6 h-6" /> :
                                   <Clock className="w-6 h-6" />}
                                </div>
                                
                                <div>
                                  <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                                    <span className="font-extrabold text-gray-900 text-lg">#{order.invoice || order.id}</span>
                                    <span className={`text-[10px] px-2.5 py-1 rounded-md font-bold tracking-wide uppercase ${
                                      order.status === 'pending' ? 'bg-orange-100 text-orange-700' :
                                      order.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                                      order.status === 'completed' || order.status === 'shipped' ? 'bg-green-100 text-green-700' :
                                      'bg-gray-100 text-gray-700'
                                    }`}>
                                      {order.status || 'PENDING'}
                                    </span>
                                  </div>
                                  <p className="text-sm text-gray-500 font-medium">
                                    {new Date(order.created_at).toLocaleDateString('en-US', {
                                      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'
                                    })}
                                  </p>
                                </div>
                              </div>
                              
                              <div className="text-left sm:text-right sm:border-l sm:border-gray-100 sm:pl-6">
                                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">Total Amount</p>
                                <p className="font-black text-gray-900 text-xl group-hover:text-brand-primary transition-colors">
                                  ৳{Number(order.amount).toLocaleString()}
                                </p>
                              </div>
                            </div>
                          </motion.div>
                        ))
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
