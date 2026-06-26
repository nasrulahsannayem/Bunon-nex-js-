import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, MapPin, Package, LogOut, Ticket } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Profile() {
  const [user, setUser] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900">My Profile</h1>
        <button 
          onClick={handleLogout}
          className="flex items-center gap-2 text-red-500 hover:text-red-700 bg-red-50 px-4 py-2 rounded-lg font-medium transition-colors"
        >
          <LogOut className="w-5 h-5" /> Logout
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* Profile Info Sidebar */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-center">
            <div className="w-24 h-24 bg-brand-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 text-brand-primary">
              <User className="w-12 h-12" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">{user.name || 'সম্মানিত গ্রাহক'}</h2>
            <p className="text-gray-500 mt-1">{user.phone}</p>
            {user.email && <p className="text-gray-500 text-sm mt-1">{user.email}</p>}
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-gray-400" /> Default Address
            </h3>
            {user.default_address ? (
              <p className="text-gray-600 text-sm leading-relaxed">
                {user.default_address}<br/>
                {user.default_city && <span>City: {user.default_city}</span>}
              </p>
            ) : (
              <p className="text-gray-400 text-sm italic">No default address set.</p>
            )}
          </div>

          {/* Special Offers Section */}
          <div className="bg-gradient-to-br from-brand-primary to-pink-500 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
            <Ticket className="w-20 h-20 absolute -right-4 -bottom-4 opacity-20" />
            <h3 className="font-bold mb-2 flex items-center gap-2">
              <Ticket className="w-5 h-5" /> My Offers
            </h3>
            <p className="text-sm opacity-90 mb-4">আপনার জন্য রয়েছে একটি এক্সক্লুসিভ ডিসকাউন্ট কুপন!</p>
            <div className="bg-white/20 px-4 py-2 rounded-lg text-center backdrop-blur-sm border border-white/30 font-mono text-lg font-bold">
              BUNON-VIP
            </div>
          </div>
        </div>

        {/* Main Content - Orders */}
        <div className="md:col-span-2">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/50">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Package className="w-5 h-5 text-gray-400" /> Order History
              </h3>
            </div>
            
            <div className="divide-y divide-gray-100">
              {orders.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Package className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                  <p>You haven't placed any orders yet.</p>
                </div>
              ) : (
                orders.map((order, idx) => (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    key={order.id} 
                    className="p-6 hover:bg-gray-50 transition-colors flex flex-col sm:flex-row justify-between sm:items-center gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-bold text-gray-900">#{order.invoice || order.id}</span>
                        <span className={`text-xs px-2 py-1 rounded-md font-semibold ${
                          order.status === 'pending' ? 'bg-orange-100 text-orange-700' :
                          order.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                          order.status === 'completed' || order.status === 'shipped' ? 'bg-green-100 text-green-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {order.status ? order.status.toUpperCase() : 'PENDING'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">
                        {new Date(order.created_at).toLocaleDateString('en-US', {
                          year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute:'2-digit'
                        })}
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-sm text-gray-500 mb-1">Total Amount</p>
                      <p className="font-bold text-brand-primary text-lg">৳{order.amount}</p>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
