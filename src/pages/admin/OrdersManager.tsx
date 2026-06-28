import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export default function OrdersManager() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = () => {
    setLoading(true);
    fetch('/api/admin/orders', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('bunon_token')}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.ok) setOrders(data.orders);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/admin/orders/${id}/status`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('bunon_token')}` 
        },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (data.ok) {
        alert('অর্ডার স্ট্যাটাস আপডেট হয়েছে!');
        fetchOrders();
      }
    } catch (e) {
      alert('স্ট্যাটাস আপডেট ফেইল হয়েছে!');
    }
  };

  if (loading) return <div className="text-center py-20 animate-pulse">অর্ডার লোড হচ্ছে...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-brand-navy">অর্ডার ম্যানেজমেন্ট</h1>
      
      <div className="bg-white shadow-sm rounded-2xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-sm text-gray-600">
                <th className="p-4 font-medium">ইনভয়েস</th>
                <th className="p-4 font-medium">কাস্টমার</th>
                <th className="p-4 font-medium">এমাউন্ট</th>
                <th className="p-4 font-medium">তারিখ</th>
                <th className="p-4 font-medium">স্ট্যাটাস</th>
                <th className="p-4 font-medium text-center">কুরিয়ার (Steadfast)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {orders.map((order, idx) => (
                <motion.tr 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.05 }}
                  key={order.id} 
                  className="hover:bg-gray-50/50"
                >
                  <td className="p-4 font-semibold text-brand-navy">#{order.invoice}</td>
                  <td className="p-4">
                    <div className="font-medium text-gray-900">{order.customer_name}</div>
                    <div className="text-gray-500 text-xs">{order.phone}</div>
                    <div className="text-gray-500 text-xs">{order.city}</div>
                  </td>
                  <td className="p-4 font-bold text-brand-primary">৳{order.total_payable}</td>
                  <td className="p-4 text-gray-500">{new Date(order.created_at).toLocaleString('en-US', {timeZone: 'Asia/Dhaka'})}</td>
                  <td className="p-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      order.status === 'completed' ? 'bg-green-100 text-green-700' :
                      order.status === 'pending' ? 'bg-orange-100 text-orange-700' :
                      order.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {order.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-4">
                    <select 
                      className="border border-gray-200 rounded-lg text-xs p-2 bg-gray-50 focus:ring-brand-primary focus:border-brand-primary outline-none w-full"
                      value={order.status}
                      onChange={(e) => updateStatus(order.id, e.target.value)}
                    >
                      <option value="pending">Pending</option>
                      <option value="processing">Processing</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </td>
                  <td className="p-4">
                    {order.consignment_id ? (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-bold text-brand-primary flex items-center gap-1">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                          Booked (Steadfast)
                        </span>
                        <span className="text-xs text-gray-500 font-mono">{order.tracking_code}</span>
                      </div>
                    ) : (
                      <button
                        onClick={async () => {
                          if (confirm('আপনি কি এই অর্ডারটি Steadfast-এ বুক করতে চান?')) {
                            try {
                              const res = await fetch(`/api/admin/orders/${order.id}/courier/steadfast`, {
                                method: 'POST',
                                headers: { 'Authorization': `Bearer ${localStorage.getItem('bunon_token')}` }
                              });
                              const data = await res.json();
                              if (data.ok) {
                                alert(`Steadfast বুকিং সম্পন্ন হয়েছে! কনসাইনমেন্ট: ${data.consignment.consignment_id}`);
                                fetchOrders();
                              } else {
                                alert(data.msg);
                              }
                            } catch (e) {
                              alert('Steadfast সার্ভার এরর!');
                            }
                          }
                        }}
                        className="bg-brand-primary text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-brand-primary/90 transition flex items-center justify-center whitespace-nowrap"
                      >
                        Auto Book (Steadfast)
                      </button>
                    )}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
