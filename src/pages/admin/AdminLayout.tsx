import { Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, ShoppingCart, Users, Package, MailX } from 'lucide-react';

export default function AdminLayout() {
  const location = useLocation();
  
  const navItems = [
    { name: 'ড্যাশবোর্ড', path: '/admin', icon: <LayoutDashboard size={20} /> },
    { name: 'অর্ডার লিস্ট', path: '/admin/orders', icon: <ShoppingCart size={20} /> },
    { name: 'অ্যাবানডনড কার্ট', path: '/admin/abandoned', icon: <MailX size={20} /> },
    { name: 'মেইন সাইটে ফিরে যান', path: '/', icon: <Package size={20} /> }
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 hidden md:flex flex-col shadow-sm">
        <div className="h-16 flex items-center px-6 border-b border-gray-100">
          <span className="text-xl font-black text-brand-navy tracking-tight">বুনন <span className="text-brand-primary">অ্যাডমিন</span></span>
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          <nav className="space-y-1 px-3">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center px-3 py-3 text-sm font-medium rounded-xl transition-colors ${
                  location.pathname === item.path
                    ? 'bg-brand-primary/10 text-brand-primary'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <span className="mr-3">{item.icon}</span>
                {item.name}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header for Mobile */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:hidden shadow-sm">
          <span className="text-xl font-black text-brand-navy">বুনন <span className="text-brand-primary">অ্যাডমিন</span></span>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
