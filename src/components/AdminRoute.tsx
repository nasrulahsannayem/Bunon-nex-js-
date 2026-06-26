import { Navigate, Outlet } from 'react-router-dom';

export default function AdminRoute() {
  const token = localStorage.getItem('bunon_token');
  const userStr = localStorage.getItem('bunon_user');

  if (!token || !userStr) {
    return <Navigate to="/login" replace />;
  }

  try {
    const user = JSON.parse(userStr);
    if (user.role !== 'admin' && user.role !== 'staff') {
      return <Navigate to="/" replace />;
    }
  } catch (e) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
