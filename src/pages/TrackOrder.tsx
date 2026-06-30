import { useState } from 'react';
import { Search, Package, CheckCircle2, Clock, Truck } from 'lucide-react';
import { motion } from 'framer-motion';

export default function TrackOrder() {
  const [phone, setPhone] = useState('');
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.length < 11) {
      setError('Please enter a valid phone number');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/track-order?phone=${encodeURIComponent(phone)}`);
      const data = await res.json();
      if (data.ok && data.orders && data.orders.length > 0) {
        setOrder(data.orders[0]);
      } else {
        setOrder(null);
        setError('No orders found for this phone number.');
      }
    } catch (err) {
      setError('An error occurred while tracking the order.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusStep = (status: string) => {
    const s = status.toLowerCase();
    if (s === 'delivered') return 4;
    if (s === 'shipped') return 3;
    if (s === 'processing' || s === 'completed') return 2;
    return 1; // pending/on-hold
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-24 pb-20">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        
        <div className="text-center mb-10">
          <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Track Your Order</h1>
          <p className="text-gray-500">Enter your phone number to see your order status.</p>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8 mb-8"
        >
          <form onSubmit={handleTrack} className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Enter your phone number (e.g. 017...)"
                className="block w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-colors"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="bg-brand-primary text-white px-8 py-3 rounded-xl font-semibold hover:bg-brand-primary/90 transition-colors disabled:opacity-70 flex items-center justify-center min-w-[140px]"
            >
              {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Track Order'}
            </button>
          </form>
          {error && <p className="text-red-500 text-sm mt-3 text-center">{error}</p>}
        </motion.div>

        {order && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8"
          >
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-gray-100 pb-6 mb-8 gap-4">
              <div>
                <p className="text-sm text-gray-500 mb-1">Order ID</p>
                <p className="text-lg font-bold text-gray-900">#{order.id}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Total Amount</p>
                <p className="text-lg font-bold text-brand-primary">৳{order.amount}</p>
              </div>
            </div>

            <div className="relative">
              <div className="absolute left-[21px] top-4 bottom-4 w-0.5 bg-gray-100 md:left-1/2 md:-ml-px md:w-full md:h-0.5 md:top-[21px] md:bottom-auto"></div>
              <div className="flex flex-col md:flex-row justify-between gap-8 md:gap-4 relative">
                
                {/* Step 1 */}
                <div className="flex md:flex-col items-center gap-4 md:gap-2 relative z-10 w-full md:w-1/4">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center border-4 border-white shadow-sm transition-colors ${getStatusStep(order.status) >= 1 ? 'bg-brand-primary text-white' : 'bg-gray-100 text-gray-400'}`}>
                    <Clock className="w-5 h-5" />
                  </div>
                  <div className="md:text-center">
                    <p className={`font-semibold ${getStatusStep(order.status) >= 1 ? 'text-gray-900' : 'text-gray-400'}`}>Pending</p>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="flex md:flex-col items-center gap-4 md:gap-2 relative z-10 w-full md:w-1/4">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center border-4 border-white shadow-sm transition-colors ${getStatusStep(order.status) >= 2 ? 'bg-brand-primary text-white' : 'bg-gray-100 text-gray-400'}`}>
                    <Package className="w-5 h-5" />
                  </div>
                  <div className="md:text-center">
                    <p className={`font-semibold ${getStatusStep(order.status) >= 2 ? 'text-gray-900' : 'text-gray-400'}`}>Processing</p>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="flex md:flex-col items-center gap-4 md:gap-2 relative z-10 w-full md:w-1/4">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center border-4 border-white shadow-sm transition-colors ${getStatusStep(order.status) >= 3 ? 'bg-brand-primary text-white' : 'bg-gray-100 text-gray-400'}`}>
                    <Truck className="w-5 h-5" />
                  </div>
                  <div className="md:text-center">
                    <p className={`font-semibold ${getStatusStep(order.status) >= 3 ? 'text-gray-900' : 'text-gray-400'}`}>Shipped</p>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="flex md:flex-col items-center gap-4 md:gap-2 relative z-10 w-full md:w-1/4">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center border-4 border-white shadow-sm transition-colors ${getStatusStep(order.status) >= 4 ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div className="md:text-center">
                    <p className={`font-semibold ${getStatusStep(order.status) >= 4 ? 'text-gray-900' : 'text-gray-400'}`}>Delivered</p>
                  </div>
                </div>

              </div>
            </div>
            
          </motion.div>
        )}

      </div>
    </div>
  );
}
