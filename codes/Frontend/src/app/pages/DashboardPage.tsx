import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, Badge, Button, RefreshButton } from '../components/UI';
import { Users, Clock, Calendar, AlertCircle, Activity, CheckCircle2 } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
} from 'recharts';
import { apiService } from '../services/api';
import { toast } from 'sonner';

const StatCard = ({ title, value, icon: Icon, className = '' }: { title: string; value: string | number; icon: any; className?: string }) => (
  <Card className={`p-6 ${className}`}>
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-500">{title}</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      </div>
      <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
        <Icon className="w-6 h-6" />
      </div>
    </div>
  </Card>
);

export function DashboardPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [patientsStats, setPatientsStats] = useState<any>(null);
  const [visitsToday, setVisitsToday] = useState<any[]>([]);
  const [visitsStats, setVisitsStats] = useState<any>(null);
  const [queueStats, setQueueStats] = useState<any>(null);
  const [caseStats, setCaseStats] = useState<any>(null);
  const [inventoryStats, setInventoryStats] = useState<any>(null);
  const [adminDashboard, setAdminDashboard] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboard = async (manual = false) => {
    const refreshStartedAt = manual ? Date.now() : 0;
    let succeeded = false;
    if (manual) setRefreshing(true);
    setLoading(true);
    setError(null);

    const safe = async <T,>(promise: Promise<any>): Promise<T | null> => {
      try {
        const res = await promise;
        return (res.data || null) as T | null;
      } catch {
        return null;
      }
    };

    try {
      const [p, vt, vs, q, c, i, admin] = await Promise.all([
        safe<any>(apiService.patients.getStats()),
        safe<any>(apiService.visits.getToday()),
        safe<any>(apiService.visits.getStats()),
        safe<any>(apiService.queue.getList()),
        safe<any>(apiService.cases.getStats()),
        safe<any>(apiService.inventory.getStats()),
        user?.role === 'ADMIN' ? safe<any>(apiService.reports.dashboard('month')) : Promise.resolve(null),
      ]);

      setPatientsStats(p);
      setVisitsToday(Array.isArray(vt) ? vt : []);
      setVisitsStats(vs);
      setQueueStats(q?.statistics || null);
      setCaseStats(c?.overview || null);
      setInventoryStats(i?.overview || null);
      setAdminDashboard(admin);
      succeeded = true;
    } catch (err: any) {
      setError(err?.message || 'Failed to load dashboard');
      if (manual) toast.error(err?.message || 'Failed to refresh dashboard');
    } finally {
      setLoading(false);
      if (manual) {
        const elapsed = Date.now() - refreshStartedAt;
        const minVisibleMs = 650;
        if (elapsed < minVisibleMs) {
          await new Promise((resolve) => setTimeout(resolve, minVisibleMs - elapsed));
        }
        setRefreshing(false);
        if (succeeded) toast.success('Dashboard refreshed');
      }
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [user?.role]);

  const visitTrend = useMemo(() => {
    const daily = visitsStats?.daily_visits || [];
    return daily.slice(-7).map((d: any) => ({ name: String(d.date).slice(5), count: Number(d.visit_count || 0) }));
  }, [visitsStats]);

  const adminPatientTrend = useMemo(() => {
    const rows = adminDashboard?.patient_trends || [];
    return rows.slice(-14).map((d: any) => ({ name: String(d.date).slice(5), count: Number(d.new_patients || 0) }));
  }, [adminDashboard]);

  const upcoming = useMemo(() => {
    return visitsToday
      .filter((v) => v.status === 'SCHEDULED')
      .sort((a, b) => String(a.visit_date).localeCompare(String(b.visit_date)))
      .slice(0, 6);
  }, [visitsToday]);

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <header>
          <h2 className="text-2xl font-bold text-gray-900">Welcome back, {user?.name}</h2>
          <p className="text-gray-500">Live operational dashboard.</p>
        </header>
        <RefreshButton onClick={() => loadDashboard(true)} loading={refreshing} />
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Patients" value={patientsStats?.total_patients ?? 0} icon={Users} />
        <StatCard title="Today's Visits" value={visitsToday.length} icon={Calendar} />
        <StatCard title="Queue Waiting" value={queueStats?.waiting_count ?? 0} icon={Clock} />
        <StatCard title="Inventory Alerts" value={inventoryStats?.low_stock ?? 0} icon={AlertCircle} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6">
          <h4 className="font-bold mb-4">Visit Trend</h4>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={visitTrend.length ? visitTrend : adminPatientTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <h4 className="font-bold mb-4">Operational Snapshot</h4>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between p-2 border border-gray-100 rounded"><span>Active Patients</span><strong>{patientsStats?.active_patients ?? 0}</strong></div>
            <div className="flex justify-between p-2 border border-gray-100 rounded"><span>In Treatment Queue</span><strong>{queueStats?.in_treatment_count ?? 0}</strong></div>
            <div className="flex justify-between p-2 border border-gray-100 rounded"><span>Pending Cases</span><strong>{caseStats?.pending_cases ?? 0}</strong></div>
            <div className="flex justify-between p-2 border border-gray-100 rounded"><span>Verified Cases</span><strong>{caseStats?.verified_cases ?? 0}</strong></div>
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <h4 className="font-bold mb-4">Upcoming Appointments</h4>
        <div className="space-y-3">
          {upcoming.length === 0 && !loading && <p className="text-sm text-gray-500">No upcoming appointments.</p>}
          {upcoming.map((v: any) => (
            <div key={v.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">{v.patient_name || 'Patient'} • {v.procedure_type || 'Visit'}</p>
                <p className="text-xs text-gray-500">{String(v.visit_date).slice(0, 16).replace('T', ' ')} • {v.provider_name || 'Unassigned provider'}</p>
              </div>
              <Badge variant="blue">{v.status}</Badge>
            </div>
          ))}
        </div>
      </Card>

      {user?.role === 'ADMIN' && (
        <Card className="p-6">
          <h4 className="font-bold mb-4">Admin Trend (New Patients)</h4>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={adminPatientTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {loading && <p className="text-sm text-gray-500 flex items-center gap-2"><Activity className="w-4 h-4" /> Loading dashboard data...</p>}
      {!loading && visitsToday.length === 0 && <p className="text-sm text-gray-500">No visit records available for today.</p>}
    </div>
  );
}
