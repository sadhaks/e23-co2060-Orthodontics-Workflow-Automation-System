import { NavLink } from 'react-router';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Clock,
  GraduationCap,
  BarChart3,
  Package,
  Settings,
  LogOut,
  UserCog,
  ListChecks,
  ClipboardCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Badge, Button, cn } from './UI';
import { apiService } from '../services/api';

const formatUnderscoreLabel = (value?: string | null) => String(value || '').replace(/_/g, ' ');

export function Sidebar({
  collapsed = false,
  onToggle,
}: {
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const { user } = useAuth();
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const mustChangePassword = Boolean(user?.must_change_password);

  const canSeeQueue = ['ADMIN', 'NURSE', 'ORTHODONTIST', 'DENTAL_SURGEON', 'STUDENT', 'RECEPTION'].includes(user?.role || '');
  const canSeeCases = ['ADMIN', 'ORTHODONTIST', 'DENTAL_SURGEON', 'STUDENT'].includes(user?.role || '');
  const canSeeReports = user?.role === 'ADMIN';
  const canSeeMaterials = ['ADMIN', 'NURSE'].includes(user?.role || '');
  const canSeeRequestApprovals = !mustChangePassword && ['ORTHODONTIST', 'DENTAL_SURGEON'].includes(user?.role || '');

  useEffect(() => {
    if (!canSeeRequestApprovals) {
      setPendingApprovalCount(0);
      return;
    }

    let mounted = true;
    const loadPendingCount = async () => {
      try {
        const response = await apiService.patients.getPendingAssignmentRequests();
        if (!mounted) return;
        const rows = response.data || [];
        setPendingApprovalCount(Array.isArray(rows) ? rows.length : 0);
      } catch {
        if (!mounted) return;
        setPendingApprovalCount(0);
      }
    };

    const loadWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        loadPendingCount();
      }
    };

    loadPendingCount();
    const timer = window.setInterval(loadWhenVisible, 120000);
    document.addEventListener('visibilitychange', loadWhenVisible);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', loadWhenVisible);
    };
  }, [canSeeRequestApprovals]);

  useEffect(() => {
    if (!canSeeRequestApprovals) return;
    const handleRealtimeCountUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{ count?: number }>;
      const nextCount = Number(customEvent.detail?.count ?? 0);
      if (Number.isNaN(nextCount)) return;
      setPendingApprovalCount(nextCount);
    };
    window.addEventListener('assignment-requests-updated', handleRealtimeCountUpdate as EventListener);
    return () => {
      window.removeEventListener('assignment-requests-updated', handleRealtimeCountUpdate as EventListener);
    };
  }, [canSeeRequestApprovals]);

  const navItems = mustChangePassword
    ? [
        { name: 'Settings', icon: Settings, path: '/settings', visible: true }
      ]
    : [
        { name: 'Dashboard', icon: LayoutDashboard, path: '/', visible: true },
        { name: 'Patients', icon: Users, path: '/patients', visible: true },
        { name: 'Clinic Queue', icon: Clock, path: '/queue', visible: canSeeQueue },
        { name: 'Student Cases', icon: GraduationCap, path: '/cases', visible: canSeeCases },
        { name: 'Reports', icon: BarChart3, path: '/reports', visible: canSeeReports },
        { name: 'Materials', icon: Package, path: '/materials', visible: canSeeMaterials },
        { name: 'Request Approvals', icon: ClipboardCheck, path: '/requests/approvals', visible: canSeeRequestApprovals },
        { name: 'User Management', icon: UserCog, path: '/admin/users', visible: user?.role === 'ADMIN' },
        { name: 'Audit Log', icon: ListChecks, path: '/admin/audit-logs', visible: user?.role === 'ADMIN' },
        { name: 'Settings', icon: Settings, path: '/settings', visible: true },
      ].filter((item) => item.visible);

  return (
    <aside
      className={cn(
        'sticky top-0 flex h-full max-h-[100dvh] shrink-0 flex-col overflow-hidden border-r border-gray-100 bg-white transition-all duration-200',
        collapsed ? 'w-20' : 'w-64'
      )}
    >
      <div
        className={cn(
          'border-b border-gray-100',
          collapsed ? 'px-3 py-4' : 'px-4 py-4'
        )}
      >
        <div className={cn('flex items-center', collapsed ? 'justify-center' : 'gap-3')}>
          {!collapsed && (
            <div className="group flex w-fit max-w-[calc(100%-3.75rem)] items-center justify-center rounded-[1.75rem] border border-slate-200 bg-white px-6 py-4 shadow-[0_14px_32px_-26px_rgba(15,23,42,0.35)] transition-all duration-200 hover:border-sky-200 hover:shadow-[0_16px_34px_-26px_rgba(14,116,214,0.22)]">
              <div className="min-w-0 text-center">
                <h1
                  className="whitespace-nowrap text-[1.15rem] font-black tracking-tight text-slate-900 transition-colors duration-200 group-hover:text-slate-950"
                  title="OrthoFlow"
                >
                  OrthoFlow
                </h1>
              </div>
            </div>
          )}
          {onToggle && (
            <Button
              type="button"
              onClick={onToggle}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="h-12 w-12 shrink-0 rounded-[1.4rem] border border-slate-200 bg-white text-sky-600 shadow-[0_14px_28px_-24px_rgba(15,23,42,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 hover:shadow-[0_16px_30px_-24px_rgba(14,116,214,0.24)] focus:outline-none focus:ring-0 focus:ring-offset-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
            >
              <span className="text-[1.2rem] font-semibold leading-none">
                {collapsed ? '›' : '‹'}
              </span>
            </Button>
          )}
        </div>
      </div>

      <nav className={cn('orthoflow-scroll-region min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain py-4', collapsed ? 'px-2' : 'px-4')}>
        {mustChangePassword && (
          <div
            className={cn(
              'mb-4 rounded-lg border border-amber-200 bg-amber-50 text-xs font-medium text-amber-800',
              collapsed ? 'px-2 py-3 text-center' : 'px-3 py-2'
            )}
            title={collapsed ? 'Change your temporary password to unlock the rest of the system.' : undefined}
          >
            {collapsed ? 'PW' : 'Change your temporary password to unlock the rest of the system.'}
          </div>
        )}
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            title={collapsed ? item.name : undefined}
            className={({ isActive }) => `
              flex items-center rounded-lg text-sm font-medium transition-all group relative
              ${collapsed ? 'justify-center px-2 py-3' : 'gap-3 px-3 py-2.5'}
              ${isActive 
                ? 'bg-blue-50 text-blue-700' 
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}
            `}
          >
            <item.icon className="w-5 h-5" />
            {!collapsed && <span>{item.name}</span>}
            {item.name === 'Request Approvals' && pendingApprovalCount > 0 && (
              <span
                className={cn(
                  'inline-flex h-5 min-w-[1.3rem] items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white',
                  collapsed ? 'absolute right-1 top-1' : 'ml-auto'
                )}
              >
                {pendingApprovalCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className={cn('border-t border-gray-100', collapsed ? 'p-3' : 'p-4')}>
        <div
          className={cn(
            'bg-gray-50 rounded-lg',
            collapsed ? 'flex justify-center p-2' : 'flex items-center gap-3 p-2'
          )}
          title={collapsed ? `${user?.name || ''} (${formatUnderscoreLabel(user?.role)})` : undefined}
        >
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
            {user?.name.charAt(0)}
          </div>
          {!collapsed && (
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-semibold text-gray-900 truncate">{user?.name}</p>
              <Badge variant="blue">{formatUnderscoreLabel(user?.role)}</Badge>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

export function Topbar() {
  const { logout } = useAuth();

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-gray-100 bg-white px-6">
      <div aria-hidden="true" />

      <div className="flex items-center">
        <Button
          type="button"
          onClick={logout}
          className="inline-flex items-center gap-2 rounded-xl border border-red-300 bg-red-100 px-4 py-2 text-sm font-semibold text-red-600 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-red-400 hover:bg-red-200 hover:text-red-700 hover:shadow-md focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </div>
    </header>
  );
}
