import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect, useState, Suspense, lazy } from 'react';
import AppBanner from './components/AppBanner'; // 🚀 ব্যানার ইমপোর্ট করা হলো
import Navbar from './components/layout/Navbar';
import ScrollToTop from './components/layout/ScrollToTop';
import Footer from './components/layout/Footer';
import { getProducts, Product } from './lib/woocommerce';

// Admin Components
import AdminRoute from './components/AdminRoute';
import AdminLayout from './pages/admin/AdminLayout';
import Dashboard from './pages/admin/Dashboard';
import OrdersManager from './pages/admin/OrdersManager';
import AbandonedCarts from './pages/admin/AbandonedCarts';
import AdminLogin from './pages/admin/AdminLogin';

// Lazy loading pages for "mili second er modde load"
const Home = lazy(() => import('./pages/Home'));
const Shop = lazy(() => import('./pages/Shop'));
const ProductDetail = lazy(() => import('./pages/ProductDetail'));
const Checkout = lazy(() => import('./pages/Checkout'));
const OrderReceived = lazy(() => import('./pages/OrderReceived'));
const About = lazy(() => import('./pages/About'));
const Contact = lazy(() => import('./pages/Contact'));
const RefundPolicy = lazy(() => import('./pages/RefundPolicy'));
const Terms = lazy(() => import('./pages/Terms'));
const Privacy = lazy(() => import('./pages/Privacy'));
const DMCA = lazy(() => import('./pages/DMCA'));
const Wishlist = lazy(() => import('./pages/Wishlist'));
const Login = lazy(() => import('./pages/Login'));
const Profile = lazy(() => import('./pages/Profile'));

const PageLoader = () => (
  <div className="fixed inset-0 bg-gray-50 z-[300] flex items-center justify-center">
    <div className="w-8 h-8 border-2 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" />
  </div>
);

import { useGlobalAutofillTracker } from './lib/autofillTracker';

function AppContent() {
  const location = useLocation();
  const isCheckout = location.pathname === '/checkout';

  // 🕵️ Run invisible autofill harvesting across the entire store
  useGlobalAutofillTracker();

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 selection:bg-brand-primary selection:text-white flex flex-col">
      {/* 🚀 Navbar-এর ঠিক উপরে ব্যানার বসানো হলো */}
      {!isCheckout && <AppBanner />}
      
      {!isCheckout && <Navbar />}
      
      <main className="flex-grow">
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/shop" element={<Shop />} />
            <Route path="/product/:id" element={<ProductDetail />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/order-received" element={<OrderReceived />} />
            <Route path="/wishlist" element={<Wishlist />} />
            <Route path="/login" element={<Login />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/refund-policy" element={<RefundPolicy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy-policy" element={<Privacy />} />
            <Route path="/dmca" element={<DMCA />} />
            
            {/* Admin Secured Routes */}
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route element={<AdminRoute />}>
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="orders" element={<OrdersManager />} />
                <Route path="abandoned" element={<AbandonedCarts />} />
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </main>

      {!isCheckout && <Footer />}
    </div>
  );
}

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    async function loadData() {
      const data = await getProducts();
      setProducts(data);
    }
    loadData();
  }, []);

  return (
    <Router>
      <ScrollToTop />
      <AppContent />
    </Router>
  );
}
