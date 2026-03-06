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
  ListChecks
  ,
  ClipboardCheck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Badge, Button } from './UI';
import { apiService } from '../services/api';

const formatUnderscoreLabel = (value?: string | null) => String(value || '').replace(/_/g, ' ');

export function Sidebar() {
  const { user } = useAuth();
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);

  const canSeeQueue = ['ADMIN', 'ORTHODONTIST', 'DENTAL_SURGEON', 'STUDENT', 'NURSE', 'RECEPTION'].includes(user?.role || '');
  const canSeeCases = ['ADMIN', 'ORTHODONTIST', 'DENTAL_SURGEON', 'STUDENT'].includes(user?.role || '');
  const canSeeReports = user?.role === 'ADMIN';
  const canSeeMaterials = ['ADMIN', 'NURSE'].includes(user?.role || '');
  const canSeeRequestApprovals = ['ORTHODONTIST', 'DENTAL_SURGEON'].includes(user?.role || '');

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

    loadPendingCount();
    const timer = window.setInterval(loadPendingCount, 30000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
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

  const navItems = [
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
    <aside className="w-64 border-r border-gray-100 bg-white h-screen flex flex-col sticky top-0">
      <div className="p-6">
        <h1 className="text-xl font-bold text-blue-900 flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white">
            <span className="text-xs font-black">OW</span>
          </div>
          OrthoFlow
        </h1>
      </div>

      <nav className="flex-1 px-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `
              flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group
              ${isActive 
                ? 'bg-blue-50 text-blue-700' 
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}
            `}
          >
            <item.icon className="w-5 h-5" />
            <span>{item.name}</span>
            {item.name === 'Request Approvals' && pendingApprovalCount > 0 && (
              <span className="ml-auto inline-flex min-w-[1.3rem] h-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white">
                {pendingApprovalCount}
              </span>
            )}
            {/* Optional indicator for active */}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-100">
        <div className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
            {user?.name.charAt(0)}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-semibold text-gray-900 truncate">{user?.name}</p>
            <Badge variant="blue">{formatUnderscoreLabel(user?.role)}</Badge>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function Topbar() {
  const { logout, user } = useAuth();

  return (
    <header className="h-16 border-b border-gray-100 bg-white px-6 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-500 font-medium">Orthodontics Workflow System</span>
        <div className="h-4 w-px bg-gray-200" />
        <span className="text-sm font-semibold text-gray-900">University Dental Hospital</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex flex-col items-end">
           <span className="text-sm font-medium text-gray-900">{user?.name}</span>
           <span className="text-xs text-gray-500">{formatUnderscoreLabel(user?.role)}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={logout} className="p-2 rounded-full hover:bg-red-50 text-gray-500 hover:text-red-600 transition-colors">
          <LogOut className="w-5 h-5" />
        </Button>
      </div>
    </header>
  );
}
