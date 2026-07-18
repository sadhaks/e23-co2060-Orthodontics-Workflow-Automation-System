import { Outlet, Navigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { Sidebar, Topbar } from '../components/LayoutComponents';

export function MainLayout() {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen h-[100dvh] min-h-0 overflow-hidden bg-gray-50 font-sans text-gray-900">
      <Sidebar />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden min-w-0">
        <Topbar />
        <main className="orthoflow-main-scroll orthoflow-scroll-region min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-32 pt-4 sm:px-6 sm:pb-32 sm:pt-6 lg:px-10 lg:pb-10 lg:pt-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
