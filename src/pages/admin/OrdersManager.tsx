import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSearch, FiRefreshCw, FiChevronLeft, FiChevronRight, FiX, FiTruck, FiMapPin, FiPhone, FiUser, FiPackage, FiFileText } from 'react-icons/fi';

export default function OrdersManager() {
  const [orders, setOrders] = useState<any[]>([]);
  const [statusCounts, setStatusCounts] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  
  const [filters, setFilters] = useState({
    status: 'all',
    courier: 'all',
    search: '',
  });

  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [orderDetails, setOrderDetails] = useState<{items: any[], logs: any[], loading: boolean}>({ items: [], logs: [], loading: false });

  const fetchOrders = (page = 1) => {
    setLoading(true);
    const query = new URLSearchParams({
      page: page.toString(),
      status: filters.status,
      courier: filters.courier,
      search: filters.search
    });

    fetch(`/api/admin/orders?${query.toString()}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('bunon_token')}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.ok) {
          setOrders(data.orders);
          setStatusCounts(data.statusCounts || []);
          setPagination(data.pagination);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchOrders(1);
  }, [filters]);

  const fetchOrderDetails = (orderId: string) => {
    setOrderDetails(prev => ({ ...prev, loading: true }));
    fetch(`/api/admin/orders/${orderId}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('bunon_token')}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.ok) {
          setOrderDetails({ items: data.items || [], logs: data.logs || [], loading: false });
          setSelectedOrder(data.order);
        }
      })
      .catch(() => setOrderDetails(prev => ({ ...prev, loading: false })));
  };

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
        alert('Order status updated!');
        fetchOrders(pagination.page);
        if (selectedOrder && selectedOrder.id === id) {
          setSelectedOrder({ ...selectedOrder, status: newStatus });
        }
      }
    } catch (e) {
      alert('Failed to update status!');
    }
  };

  const getStatusCount = (statusName: string) => {
    const s = statusCounts.find(s => s.status === statusName);
    return s ? s.count : 0;
  };

  const totalOrders = statusCounts.reduce((acc, curr) => acc + curr.count, 0);

  const TABS = [
    { label: 'All Orders', value: 'all', count: totalOrders },
    { label: 'Pending', value: 'pending', count: getStatusCount('pending') },
    { label: 'Processing', value: 'processing', count: getStatusCount('processing') },
    { label: 'Transit', value: 'transit', count: getStatusCount('transit') },
    { label: 'Delivered', value: 'delivered', count: getStatusCount('delivered') },
    { label: 'Cancelled', value: 'cancelled', count: getStatusCount('cancelled') },
  ];

  const handleRowClick = (order: any) => {
    setSelectedOrder(order);
    fetchOrderDetails(order.id);
  };

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-[#f8fafc] -mx-4 -my-6 px-4 py-6">
      {/* LEFT PANE: List */}
      <div className={`flex-1 flex flex-col transition-all duration-300 ${selectedOrder ? 'w-2/3 pr-4' : 'w-full'}`}>
        
        {/* Header Snapshot */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 text-white mb-6 shadow-[0_10px_25px_-5px_rgba(59,130,246,0.4)]">
          <h2 className="text-sm font-bold tracking-widest uppercase mb-1 opacity-80">Today's Snapshot</h2>
          <div className="text-4xl font-black mb-4">{totalOrders}</div>
          <div className="flex gap-8 text-sm font-semibold">
            <div>Pend <span className="text-yellow-300">{getStatusCount('pending')}+</span></div>
            <div>Ship <span className="text-blue-300">{getStatusCount('processing')}+</span></div>
            <div>Del <span className="text-green-300">{getStatusCount('delivered')}+</span></div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 mb-4 flex gap-4 items-center">
          <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 flex-1 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition">
            <FiSearch className="text-slate-400" />
            <input 
              type="text" 
              placeholder="Search Invoice / Phone..."
              className="bg-transparent border-none outline-none w-full text-sm"
              value={filters.search}
              onChange={e => setFilters({...filters, search: e.target.value})}
            />
          </div>
          <select 
            className="border border-slate-200 rounded-lg px-4 py-2 text-sm outline-none bg-slate-50"
            value={filters.courier}
            onChange={e => setFilters({...filters, courier: e.target.value})}
          >
            <option value="all">Courier: All</option>
            <option value="steadfast">Steadfast</option>
            <option value="none">None</option>
          </select>
          <button onClick={() => fetchOrders(pagination.page)} className="bg-slate-900 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium hover:bg-slate-800 transition">
            <FiRefreshCw /> Reload
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4" style={{scrollbarWidth: 'none'}}>
          {TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => setFilters({...filters, status: tab.value})}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition border ${
                filters.status === tab.value 
                  ? 'bg-slate-800 text-white border-slate-800' 
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {tab.label}
              <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                filters.status === tab.value ? 'bg-white/20' : 'bg-slate-100 text-slate-500'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex-1 overflow-hidden flex flex-col">
          <div className="overflow-y-auto flex-1">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider z-10">
                <tr>
                  <th className="p-4 w-10">
                    <input type="checkbox" className="rounded border-slate-300" />
                  </th>
                  <th className="p-4">Invoice</th>
                  <th className="p-4">Customer</th>
                  <th className="p-4">Phone</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Amount</th>
                  <th className="p-4">Courier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={7} className="text-center p-8 text-slate-500">Loading...</td></tr>
                ) : orders.length === 0 ? (
                  <tr><td colSpan={7} className="text-center p-8 text-slate-500">No orders found.</td></tr>
                ) : orders.map(order => (
                  <tr 
                    key={order.id} 
                    onClick={() => handleRowClick(order)}
                    className={`cursor-pointer hover:bg-slate-50 transition ${selectedOrder?.id === order.id ? 'bg-blue-50/50' : ''}`}
                  >
                    <td className="p-4"><input type="checkbox" className="rounded border-slate-300" onClick={e=>e.stopPropagation()} /></td>
                    <td className="p-4 font-bold text-slate-700">#{order.invoice}</td>
                    <td className="p-4 font-medium text-slate-600">{order.customer_name}</td>
                    <td className="p-4 text-slate-500 font-mono">{order.phone}</td>
                    <td className="p-4">
                      <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                        {order.status}
                      </span>
                    </td>
                    <td className="p-4 font-bold text-slate-800">৳{order.total_payable}</td>
                    <td className="p-4">
                      {order.consignment_id ? (
                        <span className="text-blue-600 text-xs font-semibold flex items-center gap-1">
                          <FiTruck /> Steadfast
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Pagination Footer */}
          <div className="border-t border-slate-200 p-4 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
            <div>Showing page {pagination.page} of {pagination.totalPages}</div>
            <div className="flex gap-2">
              <button 
                disabled={pagination.page === 1}
                onClick={() => fetchOrders(pagination.page - 1)}
                className="p-2 bg-white border border-slate-200 rounded hover:bg-slate-100 disabled:opacity-50"
              ><FiChevronLeft /></button>
              <button 
                disabled={pagination.page === pagination.totalPages}
                onClick={() => fetchOrders(pagination.page + 1)}
                className="p-2 bg-white border border-slate-200 rounded hover:bg-slate-100 disabled:opacity-50"
              ><FiChevronRight /></button>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT PANE: Order Journey */}
      <AnimatePresence>
        {selectedOrder && (
          <motion.div 
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: '33.333333%', opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="h-full bg-white border-l border-slate-200 shadow-xl overflow-hidden flex flex-col rounded-2xl"
          >
            {/* Pane Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 sticky top-0 z-10">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800 uppercase tracking-widest">
                <FiFileText /> Order Journey
              </div>
              <button onClick={() => setSelectedOrder(null)} className="p-2 bg-slate-200 hover:bg-slate-300 rounded-full text-slate-600 transition">
                <FiX />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto">
              {/* Order Info Card */}
              <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-6 text-white mb-6 relative overflow-hidden shadow-[0_10px_25px_-5px_rgba(59,130,246,0.4)]">
                <div className="absolute top-0 right-0 p-4 opacity-20">
                  <FiPackage size={100} />
                </div>
                <div className="relative z-10">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-blue-200 text-xs font-bold uppercase tracking-widest mb-1">Invoice</div>
                      <div className="text-3xl font-black mb-4">#{selectedOrder.invoice}</div>
                    </div>
                    <div className="bg-white/20 px-3 py-1 rounded-full text-xs font-bold backdrop-blur-sm uppercase">
                      {selectedOrder.status}
                    </div>
                  </div>
                  <div className="text-2xl font-bold font-mono">৳{selectedOrder.total_payable}</div>
                </div>
              </div>

              {/* Customer Info */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 mb-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0"><FiUser /></div>
                  <div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Customer Name</div>
                    <div className="text-sm font-bold text-slate-800">{selectedOrder.customer_name}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0"><FiPhone /></div>
                  <div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Phone Number</div>
                    <div className="text-sm font-bold text-slate-800 font-mono">{selectedOrder.phone}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0"><FiMapPin /></div>
                  <div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Delivery Address</div>
                    <div className="text-sm font-bold text-slate-800">{selectedOrder.address}, {selectedOrder.city}</div>
                  </div>
                </div>
              </div>

              {/* Items List */}
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Order Items</h3>
              <div className="space-y-3 mb-6">
                {orderDetails.loading ? (
                  <div className="text-sm text-slate-400 animate-pulse">Loading items...</div>
                ) : orderDetails.items.map(item => (
                  <div key={item.id} className="flex gap-3 bg-white border border-slate-100 p-3 rounded-xl shadow-sm">
                    <img src={item.product_thumb || 'https://via.placeholder.com/60'} alt="thumb" className="w-16 h-16 rounded-lg object-cover bg-slate-100" />
                    <div className="flex-1 flex flex-col justify-center">
                      <div className="text-sm font-bold text-slate-800 line-clamp-2 leading-tight mb-1">{item.product_name}</div>
                      <div className="text-xs text-slate-500 font-medium">Qty: {item.qty} × ৳{item.price}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Update Status */}
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Update Status</h3>
              <div className="flex flex-col gap-2">
                <select 
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none font-bold text-slate-700 bg-slate-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                  value={selectedOrder.status}
                  onChange={(e) => updateStatus(selectedOrder.id, e.target.value)}
                >
                  <option value="pending">Pending</option>
                  <option value="processing">Processing</option>
                  <option value="transit">Transit</option>
                  <option value="delivered">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
