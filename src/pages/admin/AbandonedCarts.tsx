import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export default function AbandonedCarts() {
  const [carts, setCarts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/marketing/abandoned-carts', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('bunon_token')}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.ok) setCarts(data.carts);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-20 animate-pulse">ডাটা লোড হচ্ছে...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-brand-navy">অ্যাবানডনড কার্ট (রিকভারি)</h1>
      <p className="text-gray-500 text-sm">যারা চেকআউটে এসে নাম্বার দিয়েছে কিন্তু অর্ডার প্লেস করেনি তাদের লিস্ট</p>
      
      <div className="bg-white shadow-sm rounded-2xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-sm text-gray-600">
                <th className="p-4 font-medium">কাস্টমার</th>
                <th className="p-4 font-medium">যোগাযোগ</th>
                <th className="p-4 font-medium">অসম্পূর্ণ কার্ট আইটেম</th>
                <th className="p-4 font-medium">স্ট্যাটাস</th>
                <th className="p-4 font-medium">তারিখ (শেষ আপডেট)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {carts.map((cart, idx) => (
                <motion.tr 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.05 }}
                  key={cart.id} 
                  className="hover:bg-gray-50/50"
                >
                  <td className="p-4 font-medium text-gray-900">{cart.customer_name || 'N/A'}</td>
                  <td className="p-4">
                    <div className="font-semibold text-brand-primary">{cart.phone}</div>
                    <div className="text-gray-500 text-xs">{cart.email !== 'N/A' ? cart.email : ''}</div>
                  </td>
                  <td className="p-4">
                    {cart.cart_data && cart.cart_data.length > 0 ? (
                      <ul className="list-disc pl-4 text-xs text-gray-600">
                        {cart.cart_data.map((item: any, i: number) => (
                          <li key={i}>{item.name} (Qty: {item.quantity})</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-gray-400 text-xs">খালি</span>
                    )}
                  </td>
                  <td className="p-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      cart.status === 'converted' ? 'bg-green-100 text-green-700' :
                      cart.status === 'sent' ? 'bg-blue-100 text-blue-700' :
                      'bg-orange-100 text-orange-700'
                    }`}>
                      {cart.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-4 text-gray-500 text-xs">{new Date(cart.updated_at).toLocaleString('en-US', {timeZone: 'Asia/Dhaka'})}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
