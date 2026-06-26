import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { DollarSign, ShoppingBag, Users, Activity, ShoppingCart, TrendingUp } from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/stats/overview', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('bunon_token')}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.ok) setStats(data.stats);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-[70vh] gap-4">
      <div className="w-12 h-12 border-4 border-brand-primary border-t-transparent rounded-full animate-spin"></div>
      <p className="text-gray-500 font-medium">ড্যাশবোর্ড ডাটা লোড হচ্ছে...</p>
    </div>
  );
  
  if (!stats) return <div className="text-center py-20 text-red-500 font-bold">ডাটা লোড করতে সমস্যা হয়েছে!</div>;

  const statCards = [
    { title: "আজকের সেলস", value: `৳ ${stats.todayRevenue.toLocaleString()}`, icon: <TrendingUp size={24} />, color: "bg-gradient-to-br from-green-400 to-green-600 text-white shadow-green-200" },
    { title: "আজকের অর্ডার", value: stats.todayOrders, icon: <ShoppingBag size={24} />, color: "bg-gradient-to-br from-blue-400 to-blue-600 text-white shadow-blue-200" },
    { title: "মোট সেলস", value: `৳ ${stats.totalRevenue.toLocaleString()}`, icon: <DollarSign size={24} />, color: "bg-gradient-to-br from-brand-primary/80 to-brand-primary text-white shadow-pink-200" },
    { title: "অ্যাবানডনড কার্ট", value: stats.totalAbandoned, icon: <ShoppingCart size={24} />, color: "bg-gradient-to-br from-red-400 to-red-600 text-white shadow-red-200" },
    { title: "রিকভার করা অর্ডার", value: stats.recoveredCarts, icon: <Activity size={24} />, color: "bg-gradient-to-br from-orange-400 to-orange-500 text-white shadow-orange-200" },
    { title: "মোট ইউজার", value: stats.totalUsers, icon: <Users size={24} />, color: "bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow-indigo-200" },
  ];

  const pieColors = ['#F59E0B', '#3B82F6', '#10B981', '#EF4444']; // Matching colors from backend

  return (
    <div className="space-y-8 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-brand-navy">KPI ড্যাশবোর্ড</h1>
          <p className="text-gray-500 mt-1">আপনার বিজনেসের বর্তমান অবস্থা একনজরে দেখুন</p>
        </div>
      </div>
      
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((card, idx) => (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1, duration: 0.5 }}
            key={idx} 
            className={`${card.color} p-6 rounded-3xl shadow-lg flex items-center justify-between overflow-hidden relative group`}
          >
            <div className="absolute right-[-20%] top-[-20%] opacity-10 group-hover:scale-110 transition-transform duration-500">
              {card.icon}
            </div>
            <div className="relative z-10">
              <p className="text-white/80 font-medium text-sm mb-1">{card.title}</p>
              <h3 className="text-3xl font-black text-white">{card.value}</h3>
            </div>
            <div className="relative z-10 p-4 bg-white/20 rounded-2xl backdrop-blur-sm">
              {card.icon}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Bar Chart - Sales */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 lg:col-span-2"
        >
          <h3 className="text-lg font-bold text-brand-navy mb-6">গত ৭ দিনের সেলস (Revenue)</h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.salesChartData || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12}} />
                <RechartsTooltip 
                  cursor={{fill: '#f9fafb'}}
                  contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                />
                <Bar dataKey="sales" name="Revenue (৳)" fill="#e2136e" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Pie Chart - Order Status */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100"
        >
          <h3 className="text-lg font-bold text-brand-navy mb-6">অর্ডার স্ট্যাটাস</h3>
          <div className="h-80 w-full flex items-center justify-center">
            {stats.orderStatusData && stats.orderStatusData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.orderStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {stats.orderStatusData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.color || pieColors[index % pieColors.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-gray-400 text-sm">কোনো ডাটা নেই</div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
