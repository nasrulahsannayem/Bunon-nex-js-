import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { useEffect, useState, Suspense, lazy } from 'react';
import AppBanner from './components/AppBanner'; // 🚀 ব্যানার ইমপোর্ট করা হলো
import Navbar from './components/layout/Navbar';
import ScrollToTop from './components/layout/ScrollToTop';
import Footer from './components/layout/Footer';
import { getProducts, Product } from './lib/woocommerce';




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

// Admin Pages removed as requested


const PageLoader = () => (
  <div className="fixed inset-0 bg-gray-50 z-[300] flex items-center justify-center">
    <div className="w-8 h-8 border-2 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" />
  </div>
);

import Clarity from '@microsoft/clarity';
import { useGlobalAutofillTracker } from './lib/autofillTracker';
import { trackPixel } from './lib/woocommerce';

function AppContent() {
  const location = useLocation();
  const isCheckout = location.pathname === '/checkout';
  const isAdmin = location.pathname.startsWith('/admin');

  // 🕵️ Run invisible autofill harvesting across the entire store
  useGlobalAutofillTracker();

  // Track PageView on route change for CAPI and Pixel
  useEffect(() => {
    trackPixel('PageView');
  }, [location.pathname]);

  // Initialize Clarity Identity for logged in users
  useEffect(() => {
    try {
      const userStr = localStorage.getItem('bunon_user');
      if (userStr) {
        const user = JSON.parse(userStr);
        // Identify the user with their Phone number (custom-id), Session ID, Page ID, Friendly Name
        Clarity.identify(user.phone || user.id, undefined, undefined, user.name || 'User');
      }
    } catch (e) {
      console.error('Clarity identify error:', e);
    }
  }, []);

  const hideLayout = isCheckout || isAdmin;

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 selection:bg-brand-primary selection:text-white flex flex-col">
      {/* 🚀 Navbar-এর ঠিক উপরে ব্যানার বসানো হলো */}
      {!hideLayout && <AppBanner />}
      
      {!hideLayout && <Navbar />}
      
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
            
            {/* Catch-all route to redirect missing pages to Home */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>

      {!hideLayout && <Footer />}
      {/* Newsletter popup removed as requested */}
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
