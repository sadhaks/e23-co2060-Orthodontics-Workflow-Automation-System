import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button, Badge, RefreshButton } from '../components/UI';
import { Download } from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
} from 'recharts';
import { apiService } from '../services/api';

const COLORS = ['#2563eb', '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [patient, setPatient] = useState<any>(null);
  const [visits, setVisits] = useState<any>(null);
  const [inventory, setInventory] = useState<any>(null);

  const loadReports = async () => {
    setLoading(true);
    setError(null);
    const [p, v, i] = await Promise.allSettled([
      apiService.reports.patientStatus({ group_by: 'status' }),
      apiService.reports.visitSummary({ group_by: 'month' }),
      apiService.reports.inventoryAlerts('all')
    ]);

    setPatient(p.status === 'fulfilled' ? (p.value.data || null) : null);
    setVisits(v.status === 'fulfilled' ? (v.value.data || null) : null);
    setInventory(i.status === 'fulfilled' ? (i.value.data || null) : null);

    const failedLabels: string[] = [];
    if (p.status === 'rejected') failedLabels.push('patient status');
    if (v.status === 'rejected') failedLabels.push('visit summary');
    if (i.status === 'rejected') failedLabels.push('inventory alerts');

    if (failedLabels.length > 0) {
      setError(`Some report sections failed to load: ${failedLabels.join(', ')}`);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadReports();
  }, []);

  const patientBreakdown = useMemo(() => (patient?.breakdown || []).map((r: any) => ({ name: r.group_key || 'Unknown', value: Number(r.patient_count || 0) })), [patient]);
  const visitTrends = useMemo(() => (visits?.trends || []).map((r: any) => ({ name: String(r.group_key), total: Number(r.total_visits || 0), completed: Number(r.completed_visits || 0) })).reverse(), [visits]);
  const inventoryAlerts = inventory?.alerts || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Analytics & Reports</h2>
          <p className="text-gray-500">Live data reports from patients, visits, and inventory.</p>
        </div>
        <div className="flex gap-2">
          <RefreshButton onClick={loadReports} loading={loading} />
          <Button className="flex items-center gap-2" onClick={() => window.print()}>
            <Download className="w-4 h-4" /> Export
          </Button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-xs text-gray-500">Total Patients</p>
          <p className="text-2xl font-bold">{patient?.overview?.total_patients ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500">Active Patients</p>
          <p className="text-2xl font-bold text-blue-600">{patient?.overview?.active_patients ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500">Total Visits (period)</p>
          <p className="text-2xl font-bold text-green-600">{visitTrends.reduce((s, v) => s + v.total, 0)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500">Inventory Alerts</p>
          <p className="text-2xl font-bold text-amber-600">{inventory?.overview?.low_stock_count ?? 0}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6">
          <h4 className="font-bold mb-4">Visit Trend</h4>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={visitTrends}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="total" stroke="#2563eb" strokeWidth={2} />
                <Line type="monotone" dataKey="completed" stroke="#10b981" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <h4 className="font-bold mb-4">Patient Status Distribution</h4>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={patientBreakdown} cx="50%" cy="50%" outerRadius={85} dataKey="value" nameKey="name" label>
                  {patientBreakdown.map((_: any, idx: number) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <h4 className="font-bold mb-4">Top Procedures</h4>
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={visits?.procedure_breakdown || []}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="procedure_type" axisLine={false} tickLine={false} />
              <YAxis axisLine={false} tickLine={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-6">
        <h4 className="font-bold mb-4">Inventory Alerts</h4>
        <div className="space-y-2">
          {inventoryAlerts.length === 0 && !loading && <p className="text-sm text-gray-500">No inventory alerts.</p>}
          {inventoryAlerts.slice(0, 12).map((a: any) => (
            <div key={a.id} className="flex justify-between items-center p-3 border border-gray-100 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">{a.name}</p>
                <p className="text-xs text-gray-500">{a.category} • Qty: {a.quantity} / Min: {a.minimum_threshold}</p>
              </div>
              <Badge variant={a.alert_level === 'OUT_OF_STOCK' ? 'error' : a.alert_level === 'CRITICAL' ? 'warning' : 'blue'}>{a.alert_level}</Badge>
            </div>
          ))}
        </div>
      </Card>

      {loading && <p className="text-sm text-gray-500">Loading reports...</p>}
    </div>
  );
}
