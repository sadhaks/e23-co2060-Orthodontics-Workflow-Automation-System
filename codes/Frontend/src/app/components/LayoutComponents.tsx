import { NavLink } from 'react-router';
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
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Badge, Button } from './UI';

export function Sidebar() {
  const { user } = useAuth();

  const canSeeQueue = ['ADMIN', 'ORTHODONTIST', 'DENTAL_SURGEON', 'STUDENT', 'NURSE', 'RECEPTION'].includes(user?.role || '');
  const canSeeCases = ['ADMIN', 'ORTHODONTIST', 'DENTAL_SURGEON', 'STUDENT'].includes(user?.role || '');
  const canSeeReports = user?.role === 'ADMIN';
  const canSeeMaterials = ['ADMIN', 'NURSE'].includes(user?.role || '');

  const navItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/', visible: true },
    { name: 'Patients', icon: Users, path: '/patients', visible: true },
    { name: 'Clinic Queue', icon: Clock, path: '/queue', visible: canSeeQueue },
    { name: 'Student Cases', icon: GraduationCap, path: '/cases', visible: canSeeCases },
    { name: 'Reports', icon: BarChart3, path: '/reports', visible: canSeeReports },
    { name: 'Materials', icon: Package, path: '/materials', visible: canSeeMaterials },
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
            <Badge variant="blue">{user?.role}</Badge>
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
           <span className="text-xs text-gray-500">{user?.role}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={logout} className="p-2 rounded-full hover:bg-red-50 text-gray-500 hover:text-red-600 transition-colors">
          <LogOut className="w-5 h-5" />
        </Button>
      </div>
    </header>
  );
}
