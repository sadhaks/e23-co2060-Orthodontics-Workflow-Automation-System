import React, { useEffect, useMemo, useState } from 'react';
import { Card, Badge, Button, Input, RefreshButton } from '../components/UI';
import { Clock, Plus } from 'lucide-react';
import { apiService } from '../services/api';
import { useAuth } from '../context/AuthContext';

const STATUS_FLOW = ['WAITING', 'PREPARATION', 'IN_TREATMENT', 'COMPLETED'] as const;

type QueueItem = {
  id: number;
  patient_id: number;
  patient_name: string;
  patient_code: string;
  procedure_type?: string;
  priority: 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW';
  status: 'WAITING' | 'PREPARATION' | 'IN_TREATMENT' | 'COMPLETED';
  arrival_time: string;
  wait_time_minutes?: number;
  provider_name?: string | null;
  student_name?: string | null;
};

type PatientOption = {
  id: number;
  patient_code: string;
  first_name: string;
  last_name: string;
};

export function ClinicQueuePage() {
  const { user } = useAuth();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ patient_id: '', procedure_type: '', priority: 'NORMAL' as QueueItem['priority'] });
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const canAddToQueue = ['RECEPTION', 'NURSE'].includes(user?.role || '');
  const canUpdateQueue = ['RECEPTION', 'NURSE', 'ORTHODONTIST', 'DENTAL_SURGEON', 'STUDENT'].includes(user?.role || '');

  const loadQueue = async () => {
    setLoading(true);
    setError(null);
    try {
      const queueRes = await apiService.queue.getList();
      let patientRes: any = null;
      if (canAddToQueue) {
        try {
          patientRes = await apiService.patients.getList({
            page: 1,
            limit: 100,
            deleted: 'active',
            sort: 'id',
            order: 'DESC'
          });
        } catch (patientErr) {
          // Keep queue usable even if add-to-queue patient options fail to load.
          patientRes = null;
        }
      }

      setItems(queueRes.data?.queue || []);
      setStats(queueRes.data?.statistics || null);
      setPatients(patientRes?.data?.patients || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load clinic queue');
      setItems([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const waiting = useMemo(() => items.filter((i) => i.status === 'WAITING'), [items]);
  const active = useMemo(() => items.filter((i) => i.status !== 'WAITING' && i.status !== 'COMPLETED'), [items]);

  const addToQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.patient_id) return;
    setAdding(true);
    setError(null);
    try {
      await apiService.queue.addToQueue({
        patient_id: Number(form.patient_id),
        priority: form.priority,
        procedure_type: form.procedure_type || undefined
      });
      setShowAdd(false);
      setForm({ patient_id: '', procedure_type: '', priority: 'NORMAL' });
      await loadQueue();
    } catch (err: any) {
      setError(err?.message || 'Failed to add patient to queue');
    } finally {
      setAdding(false);
    }
  };

  const setNextStatus = async (item: QueueItem) => {
    const idx = STATUS_FLOW.indexOf(item.status);
    if (idx === -1 || idx === STATUS_FLOW.length - 1) return;

    setUpdatingId(item.id);
    setError(null);
    try {
      await apiService.queue.updateStatus(String(item.id), { status: STATUS_FLOW[idx + 1] });
      await loadQueue();
    } catch (err: any) {
      setError(err?.message || 'Failed to update queue status');
    } finally {
      setUpdatingId(null);
    }
  };

  const statusBadge = (status: QueueItem['status']) => {
    if (status === 'WAITING') return 'warning';
    if (status === 'COMPLETED') return 'success';
    return 'blue';
  };

  const queueCard = (item: QueueItem) => (
    <div key={item.id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
      <div className="flex justify-between items-start gap-3">
        <div>
          <h4 className="font-bold text-gray-900">{item.patient_name}</h4>
          <p className="text-xs text-gray-500">#{item.patient_code}</p>
          <p className="text-xs text-gray-500 mt-1">{item.procedure_type || 'General visit'}</p>
        </div>
        <Badge variant={statusBadge(item.status) as any}>{item.status}</Badge>
      </div>
      <div className="mt-3 text-xs text-gray-600 space-y-1">
        <p>Priority: {item.priority}</p>
        <p>Provider: {item.provider_name || 'Unassigned'}</p>
        <p>Student: {item.student_name || 'Unassigned'}</p>
        <p>Wait: {item.wait_time_minutes ?? '-'} min</p>
      </div>
      <div className="mt-4 flex gap-2">
        {canUpdateQueue && item.status !== 'COMPLETED' && (
          <Button
            size="sm"
            onClick={() => setNextStatus(item)}
            disabled={updatingId === item.id}
            className="flex-1"
          >
            Next Status
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Live Clinic Queue</h2>
          <p className="text-gray-500">Real-time queue integrated with backend records.</p>
        </div>
        <div className="flex gap-2">
          <RefreshButton onClick={loadQueue} loading={loading} />
          {canAddToQueue && (
            <Button className="flex items-center gap-2" onClick={() => setShowAdd((v) => !v)}>
              <Plus className="w-4 h-4" />
              Add to Queue
            </Button>
          )}
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {showAdd && canAddToQueue && (
        <Card className="p-4">
          <form className="grid grid-cols-1 md:grid-cols-4 gap-3" onSubmit={addToQueue}>
            <select
              className="h-10 rounded-md border border-gray-200 px-3 text-sm"
              value={form.patient_id}
              onChange={(e) => setForm((f) => ({ ...f, patient_id: e.target.value }))}
              required
            >
              <option value="">Select patient</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>{p.first_name} {p.last_name} (#{p.patient_code})</option>
              ))}
            </select>
            <Input
              placeholder="Procedure type"
              value={form.procedure_type}
              onChange={(e) => setForm((f) => ({ ...f, procedure_type: e.target.value }))}
            />
            <select
              className="h-10 rounded-md border border-gray-200 px-3 text-sm"
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as QueueItem['priority'] }))}
            >
              <option value="LOW">LOW</option>
              <option value="NORMAL">NORMAL</option>
              <option value="HIGH">HIGH</option>
              <option value="URGENT">URGENT</option>
            </select>
            <Button type="submit" disabled={adding}>{adding ? 'Adding...' : 'Add'}</Button>
          </form>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-4 border-t-4 border-t-amber-400">
          <h3 className="font-bold flex items-center gap-2 mb-4">
            Waiting Area
            <Badge variant="warning">{waiting.length}</Badge>
          </h3>
          <div className="space-y-3">{waiting.map(queueCard)}</div>
        </Card>

        <Card className="p-4 border-t-4 border-t-blue-500 lg:col-span-1">
          <h3 className="font-bold flex items-center gap-2 mb-4">
            Active Treatment
            <Badge variant="blue">{active.length}</Badge>
          </h3>
          <div className="space-y-3">{active.map(queueCard)}</div>
        </Card>

        <Card className="p-4 bg-gray-50/50">
          <h3 className="font-bold mb-4">Daily Statistics</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between p-2 bg-white rounded border border-gray-100">
              <span>Total in queue</span>
              <span className="font-bold">{stats?.total_in_queue ?? 0}</span>
            </div>
            <div className="flex justify-between p-2 bg-white rounded border border-gray-100">
              <span>Waiting</span>
              <span className="font-bold">{stats?.waiting_count ?? 0}</span>
            </div>
            <div className="flex justify-between p-2 bg-white rounded border border-gray-100">
              <span>In treatment</span>
              <span className="font-bold">{stats?.in_treatment_count ?? 0}</span>
            </div>
            <div className="flex justify-between p-2 bg-white rounded border border-gray-100">
              <span>Avg wait time</span>
              <span className="font-bold">{Math.round(Number(stats?.avg_wait_time || 0))} min</span>
            </div>
          </div>
        </Card>
      </div>

      {loading && (
        <div className="text-sm text-gray-500 flex items-center gap-2">
          <Clock className="w-4 h-4" /> Loading queue...
        </div>
      )}
    </div>
  );
}
