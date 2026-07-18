import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, Badge, RefreshButton } from '../components/UI';
import { Users, Clock, Calendar, AlertCircle, Activity, ClipboardList } from 'lucide-react';
import { apiService } from '../services/api';
import { toast } from 'sonner';

const ASSIGNMENT_SCOPED_ROLES = ['ORTHODONTIST', 'DENTAL_SURGEON', 'STUDENT'];

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
  const [upcomingVisits, setUpcomingVisits] = useState<any[]>([]);
  const [queueStats, setQueueStats] = useState<any>(null);
  const [caseStats, setCaseStats] = useState<any>(null);
  const [inventoryStats, setInventoryStats] = useState<any>(null);
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
      const assignmentScopedRole = ASSIGNMENT_SCOPED_ROLES.includes(String(user?.role || ''));
      const [p, today, upcoming, q, c, i] = await Promise.all([
        safe<any>(apiService.patients.getStats()),
        safe<any>(apiService.visits.getToday()),
        safe<any>(apiService.visits.getUpcoming({ limit: 6 })),
        safe<any>(apiService.queue.getList(assignmentScopedRole ? { scope: 'assigned' } : undefined)),
        safe<any>(apiService.cases.getStats()),
        safe<any>(apiService.inventory.getStats()),
      ]);

      setPatientsStats(p);
      setVisitsToday(Array.isArray(today) ? today : []);
      setUpcomingVisits(Array.isArray(upcoming) ? upcoming : []);
      setQueueStats(q?.statistics || null);
      setCaseStats(c?.overview || null);
      setInventoryStats(i?.overview || null);
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
  }, [user?.role, user?.id]);

  const patientOverview = patientsStats?.overview || {};
  const assignmentScoped = ASSIGNMENT_SCOPED_ROLES.includes(String(user?.role || ''));
  const actualTodayVisits = useMemo(
    () => visitsToday.filter((visit) => visit.status === 'COMPLETED' || visit.status === 'DID_NOT_ATTEND').length,
    [visitsToday]
  );
  const inventoryAlertCount = Number(inventoryStats?.out_of_stock || 0) + Number(inventoryStats?.low_stock || 0);

  const snapshotRows = useMemo(() => {
    const role = String(user?.role || '');

    if (role === 'ORTHODONTIST' || role === 'DENTAL_SURGEON' || role === 'STUDENT') {
      return [
        { label: 'Student Cases', value: caseStats?.total_cases ?? 0 },
        { label: 'Pending Tasks', value: caseStats?.pending_tasks ?? 0 },
        { label: 'Completed Tasks', value: caseStats?.completed_tasks ?? 0 },
        { label: 'Overdue Tasks', value: caseStats?.overdue_tasks ?? 0 },
      ];
    }

    return [
      { label: assignmentScoped ? 'Active Assigned Patients' : 'Active Patients', value: patientOverview.active_patients ?? 0 },
      { label: 'Under Consultation', value: queueStats?.under_consultation_count ?? 0 },
      { label: 'Under Treatment Queue', value: queueStats?.under_treatment_count ?? 0 },
      { label: 'Upcoming Appointments', value: upcomingVisits.length },
    ];
  }, [assignmentScoped, caseStats, patientOverview.active_patients, queueStats, upcomingVisits.length, user?.role]);

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <header>
          <h2 className="text-2xl font-bold text-gray-900">Welcome back, {user?.name}</h2>
        </header>
        <RefreshButton onClick={() => loadDashboard(true)} loading={refreshing} />
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title={assignmentScoped ? 'Assigned Patients' : 'Total Patients'} value={patientOverview.total_patients ?? 0} icon={Users} />
        <StatCard title="Today's Visits" value={actualTodayVisits} icon={Calendar} />
        <StatCard title="Queue Waiting" value={queueStats?.waiting_count ?? 0} icon={Clock} />
        <StatCard title="Inventory Alerts" value={inventoryAlertCount} icon={AlertCircle} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6">
          <h4 className="font-bold mb-4">Upcoming Appointments</h4>
          <div className="space-y-3">
            {upcomingVisits.length === 0 && !loading && <p className="text-sm text-gray-500">No upcoming appointments.</p>}
            {upcomingVisits.map((visit: any) => (
              <div key={visit.id} className="flex items-center justify-between gap-4 p-3 border border-gray-100 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{visit.patient_name || 'Patient'} • {visit.procedure_type || 'Visit'}</p>
                  <p className="text-xs text-gray-500">{String(visit.visit_date).slice(0, 16).replace('T', ' ')} • {visit.provider_name || 'Unassigned provider'}</p>
                </div>
                <Badge variant="blue">{visit.status}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <h4 className="font-bold mb-4">Operational Snapshot</h4>
          <div className="space-y-3 text-sm">
            {snapshotRows.map((row) => (
              <div key={row.label} className="flex justify-between p-2 border border-gray-100 rounded">
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {loading && <p className="text-sm text-gray-500 flex items-center gap-2"><Activity className="w-4 h-4" /> Loading dashboard data...</p>}
      {!loading && actualTodayVisits === 0 && (
        <p className="text-sm text-gray-500 flex items-center gap-2">
          <ClipboardList className="w-4 h-4" /> No completed visit outcomes recorded for today.
        </p>
      )}
    </div>
  );
}
