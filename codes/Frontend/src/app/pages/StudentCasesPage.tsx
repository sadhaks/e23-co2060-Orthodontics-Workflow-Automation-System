import React, { useEffect, useMemo, useState } from 'react';
import { Card, Badge, Button, Table, RefreshButton } from '../components/UI';
import { Clock } from 'lucide-react';
import { apiService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router';

type CaseRow = {
  id: number;
  patient_id: number;
  patient_code: string;
  patient_name: string;
  student_name?: string;
  supervisor_name?: string;
  treatment_plan?: string;
  status: 'ASSIGNED' | 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED';
  created_at: string;
  updated_at: string;
};

export function StudentCasesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [rows, setRows] = useState<CaseRow[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCases = async () => {
    setLoading(true);
    setError(null);
    try {
      const [listRes, statsRes] = await Promise.all([
        apiService.cases.getList({ page: 1, limit: 100, status: statusFilter || undefined }),
        apiService.cases.getStats()
      ]);

      setRows(listRes.data?.cases || []);
      setStats(statsRes.data?.overview || null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load cases');
      setRows([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCases();
  }, [statusFilter]);

  const myCases = useMemo(() => rows, [rows]);

  const statusVariant = (status: CaseRow['status']) => {
    if (status === 'VERIFIED') return 'success';
    if (status === 'PENDING_VERIFICATION') return 'warning';
    if (status === 'REJECTED') return 'error';
    return 'blue';
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Student Case Management</h2>
          <p className="text-gray-500">Live case data from backend records.</p>
        </div>
        <div className="flex gap-2">
          <select
            className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="PENDING_VERIFICATION">Pending Verification</option>
            <option value="VERIFIED">Verified</option>
            <option value="REJECTED">Rejected</option>
          </select>
          <RefreshButton onClick={loadCases} loading={loading} />
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-xs text-gray-500">Total Cases</p>
          <p className="text-2xl font-bold">{stats?.total_cases ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500">Assigned</p>
          <p className="text-2xl font-bold text-blue-600">{stats?.assigned_cases ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500">Pending</p>
          <p className="text-2xl font-bold text-amber-600">{stats?.pending_cases ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500">Verified</p>
          <p className="text-2xl font-bold text-green-600">{stats?.verified_cases ?? 0}</p>
        </Card>
      </div>

      <Card>
        <Table>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-6 py-4 font-semibold text-gray-600">Case ID</th>
              <th className="px-6 py-4 font-semibold text-gray-600">Patient</th>
              <th className="px-6 py-4 font-semibold text-gray-600">Student</th>
              <th className="px-6 py-4 font-semibold text-gray-600">Supervisor</th>
              <th className="px-6 py-4 font-semibold text-gray-600">Status</th>
              <th className="px-6 py-4 font-semibold text-gray-600">Updated</th>
              <th className="px-6 py-4 font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {!loading && myCases.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 font-mono text-xs text-gray-500">#{c.id}</td>
                <td className="px-6 py-4">
                  <p className="font-medium text-gray-900">{c.patient_name}</p>
                  <p className="text-xs text-gray-500">#{c.patient_code}</p>
                </td>
                <td className="px-6 py-4 text-gray-600">{c.student_name || 'Unassigned'}</td>
                <td className="px-6 py-4 text-gray-600">{c.supervisor_name || 'Unassigned'}</td>
                <td className="px-6 py-4"><Badge variant={statusVariant(c.status) as any}>{c.status}</Badge></td>
                <td className="px-6 py-4 text-gray-500">{String(c.updated_at).slice(0, 10)}</td>
                <td className="px-6 py-4">
                  <Button size="sm" variant="secondary" onClick={() => navigate(`/patients/${c.patient_id}`)}>Open Patient</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>

        {loading && <div className="p-8 text-sm text-gray-500 flex items-center gap-2"><Clock className="w-4 h-4" /> Loading cases...</div>}
        {!loading && myCases.length === 0 && <div className="p-8 text-sm text-gray-500">No cases found.</div>}
      </Card>
    </div>
  );
}
