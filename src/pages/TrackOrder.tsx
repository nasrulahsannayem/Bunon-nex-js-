import { useState } from 'react';
import { Search, Package, CheckCircle2, Clock, Truck, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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

        <AnimatePresence>
          {order && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
              onClick={() => setOrder(null)}
            >
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="bg-white w-full max-w-3xl rounded-[2rem] shadow-2xl border border-white/20 overflow-hidden relative max-h-[85vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header Section */}
                <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50/50">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Order Details</h2>
                    <p className="text-sm text-gray-500">#{order.id}</p>
                  </div>
                  <button 
                    onClick={() => setOrder(null)}
                    className="p-2 rounded-full bg-white shadow-sm border border-gray-200 text-gray-500 hover:text-brand-primary hover:bg-brand-primary/5 transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Scrollable Content */}
                <div className="overflow-y-auto p-6 md:p-8 custom-scrollbar">
                  <div className="relative mb-10">
                    <div className="absolute left-[21px] top-4 bottom-4 w-0.5 bg-gray-100 md:left-1/2 md:-ml-px md:w-full md:h-0.5 md:top-[21px] md:bottom-auto"></div>
                    <div className="flex flex-col md:flex-row justify-between gap-8 md:gap-4 relative">
                      
                      {/* Step 1 */}
                      <div className="flex md:flex-col items-center gap-4 md:gap-2 relative z-10 w-full md:w-1/4">
                        <div className={`w-11 h-11 rounded-full flex items-center justify-center border-4 border-white shadow-sm transition-colors ${getStatusStep(order.status) >= 1 ? 'bg-brand-primary text-white shadow-brand-primary/30' : 'bg-gray-100 text-gray-400'}`}>
                          <Clock className="w-5 h-5" />
                        </div>
                        <div className="md:text-center">
                          <p className={`font-semibold ${getStatusStep(order.status) >= 1 ? 'text-gray-900' : 'text-gray-400'}`}>Pending</p>
                        </div>
                      </div>

                      {/* Step 2 */}
                      <div className="flex md:flex-col items-center gap-4 md:gap-2 relative z-10 w-full md:w-1/4">
                        <div className={`w-11 h-11 rounded-full flex items-center justify-center border-4 border-white shadow-sm transition-colors ${getStatusStep(order.status) >= 2 ? 'bg-brand-primary text-white shadow-brand-primary/30' : 'bg-gray-100 text-gray-400'}`}>
                          <Package className="w-5 h-5" />
                        </div>
                        <div className="md:text-center">
                          <p className={`font-semibold ${getStatusStep(order.status) >= 2 ? 'text-gray-900' : 'text-gray-400'}`}>Processing</p>
                        </div>
                      </div>

                      {/* Step 3 */}
                      <div className="flex md:flex-col items-center gap-4 md:gap-2 relative z-10 w-full md:w-1/4">
                        <div className={`w-11 h-11 rounded-full flex items-center justify-center border-4 border-white shadow-sm transition-colors ${getStatusStep(order.status) >= 3 ? 'bg-brand-primary text-white shadow-brand-primary/30' : 'bg-gray-100 text-gray-400'}`}>
                          <Truck className="w-5 h-5" />
                        </div>
                        <div className="md:text-center">
                          <p className={`font-semibold ${getStatusStep(order.status) >= 3 ? 'text-gray-900' : 'text-gray-400'}`}>Shipped</p>
                        </div>
                      </div>

                      {/* Step 4 */}
                      <div className="flex md:flex-col items-center gap-4 md:gap-2 relative z-10 w-full md:w-1/4">
                        <div className={`w-11 h-11 rounded-full flex items-center justify-center border-4 border-white shadow-sm transition-colors ${getStatusStep(order.status) >= 4 ? 'bg-[#22c55e] text-white shadow-[#22c55e]/30' : 'bg-gray-100 text-gray-400'}`}>
                          <CheckCircle2 className="w-5 h-5" />
                        </div>
                        <div className="md:text-center">
                          <p className={`font-semibold ${getStatusStep(order.status) >= 4 ? 'text-gray-900' : 'text-gray-400'}`}>Delivered</p>
                        </div>
                      </div>

                    </div>
                  </div>

                  <div className="pt-6 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-8">
                    
                    {/* Left Column: Customer & Order Details */}
                    <div className="space-y-6">
                      <div>
                        <h3 className="font-bold text-gray-900 mb-3">Delivery Information</h3>
                        <div className="bg-gray-50/80 p-4 rounded-xl border border-gray-100 space-y-2">
                          <p className="text-sm"><span className="text-gray-500 w-20 inline-block">Name:</span> <span className="font-medium text-gray-900">{order.customer_name || 'N/A'}</span></p>
                          <p className="text-sm"><span className="text-gray-500 w-20 inline-block">Phone:</span> <span className="font-medium text-gray-900">{order.phone}</span></p>
                          <p className="text-sm"><span className="text-gray-500 w-20 inline-block">Address:</span> <span className="font-medium text-gray-900">{order.address || 'N/A'}, {order.city || ''} {order.state ? `(${order.state})` : ''}</span></p>
                        </div>
                      </div>

                      <div>
                        <h3 className="font-bold text-gray-900 mb-3">Payment Summary</h3>
                        <div className="bg-gray-50/80 p-4 rounded-xl border border-gray-100 space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Method</span>
                            <span className="font-medium text-gray-900 uppercase">{order.payment_method}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Subtotal</span>
                            <span className="font-medium text-gray-900">৳{order.subtotal || 0}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Delivery Fee</span>
                            <span className="font-medium text-gray-900">৳{order.delivery_fee || 0}</span>
                          </div>
                          {Number(order.discount_amount) > 0 && (
                            <div className="flex justify-between text-sm text-green-600">
                              <span>Discount</span>
                              <span className="font-medium">-৳{order.discount_amount}</span>
                            </div>
                          )}
                          <div className="pt-3 mt-3 border-t border-gray-200 flex justify-between">
                            <span className="font-bold text-gray-900">Total Payable</span>
                            <span className="font-bold text-brand-primary text-xl">৳{order.amount}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right Column: Ordered Items */}
                    <div>
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-gray-900">Ordered Items</h3>
                        <p className="text-xs text-gray-500">on {new Date(order.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}</p>
                      </div>
                      
                      {order.items && order.items.length > 0 ? (
                        <div className="space-y-3">
                          {order.items.map((item: any, idx: number) => (
                            <div key={idx} className="flex items-center gap-4 bg-white p-3 rounded-xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] hover:border-brand-primary/20 hover:shadow-md transition-all">
                              <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-50 shrink-0 border border-gray-50">
                                <img src={item.thumbnail || 'https://via.placeholder.com/150'} alt={item.name} className="w-full h-full object-cover" />
                              </div>
                              <div className="flex-1">
                                <p className="font-medium text-gray-900 line-clamp-2 text-sm leading-tight mb-1">{item.name}</p>
                                <p className="text-xs text-gray-500 font-medium">Qty: {item.quantity}</p>
                              </div>
                              <div className="font-bold text-brand-primary text-sm whitespace-nowrap">
                                ৳{item.price}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="bg-gray-50 p-6 rounded-xl border border-gray-100 text-center">
                          <p className="text-gray-500 text-sm">No items found.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
