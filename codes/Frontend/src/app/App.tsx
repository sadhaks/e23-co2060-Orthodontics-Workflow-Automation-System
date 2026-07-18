import { createBrowserRouter, RouterProvider, Outlet, Navigate, useLocation } from "react-router";
import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';

// Layout & Components
import { Sidebar, Topbar } from './components/LayoutComponents';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { PatientListPage } from './pages/PatientListPage';
import { PatientProfilePage } from './pages/PatientProfilePage';
import { ClinicQueuePage } from './pages/ClinicQueuePage';
import { StudentCasesPage } from './pages/StudentCasesPage';
import { ReportsPage } from './pages/ReportsPage';
import { InventoryPage } from './pages/InventoryPage';
import { SettingsPage } from './pages/SettingsPage';
import UserManagement from './pages/admin/UserManagement';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { RequestApprovalsPage } from './pages/RequestApprovalsPage';

function MainLayout() {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const savedState = window.localStorage.getItem('orthoflow-sidebar-collapsed');
    if (savedState === null && window.matchMedia?.('(max-width: 767px)').matches) {
      setSidebarCollapsed(true);
      return;
    }
    setSidebarCollapsed(savedState === 'true');
  }, []);

  const handleSidebarToggle = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem('orthoflow-sidebar-collapsed', String(next));
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-600">
        Loading session...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.must_change_password && location.pathname !== '/settings') {
    return <Navigate to="/settings" replace />;
  }

  return (
    <div className="flex h-screen h-[100dvh] min-h-0 overflow-hidden bg-gray-50 font-sans text-gray-900">
      <Sidebar collapsed={sidebarCollapsed} onToggle={handleSidebarToggle} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden min-w-0">
        <Topbar />
        <main className="orthoflow-main-scroll orthoflow-scroll-region min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-32 pt-4 sm:px-6 sm:pb-32 sm:pt-6 lg:px-10 lg:pb-10 lg:pt-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function RequireRoles({ roles, children }: { roles: string[]; children: JSX.Element }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-600">
        Loading session...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}

const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/",
    element: <MainLayout />,
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        path: "patients",
        element: <PatientListPage />,
      },
      {
        path: "patients/:id",
        element: <PatientProfilePage />,
      },
      {
        path: "queue",
        element: (
          <RequireRoles roles={['ADMIN', 'NURSE', 'ORTHODONTIST', 'DENTAL_SURGEON', 'STUDENT', 'RECEPTION']}>
            <ClinicQueuePage />
          </RequireRoles>
        ),
      },
      {
        path: "cases",
        element: (
          <RequireRoles roles={['ADMIN', 'ORTHODONTIST', 'DENTAL_SURGEON', 'STUDENT']}>
            <StudentCasesPage />
          </RequireRoles>
        ),
      },
      {
        path: "reports",
        element: (
          <RequireRoles roles={['ADMIN']}>
            <ReportsPage />
          </RequireRoles>
        ),
      },
      {
        path: "materials",
        element: (
          <RequireRoles roles={['ADMIN', 'NURSE']}>
            <InventoryPage />
          </RequireRoles>
        ),
      },
      {
        path: "requests/approvals",
        element: (
          <RequireRoles roles={['ORTHODONTIST', 'DENTAL_SURGEON']}>
            <RequestApprovalsPage />
          </RequireRoles>
        ),
      },
      {
        path: "settings",
        element: <SettingsPage />,
      },
      {
        path: "admin/users",
        element: (
          <RequireRoles roles={['ADMIN']}>
            <UserManagement />
          </RequireRoles>
        ),
      },
      {
        path: "admin/audit-logs",
        element: (
          <RequireRoles roles={['ADMIN']}>
            <AuditLogsPage />
          </RequireRoles>
        ),
      },
    ],
  },
]);

function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}

export default App;
