import React, { useEffect, useMemo, useState } from 'react';
import { Card, Badge, Button, Input, RefreshButton, Table, cn } from '../components/UI';
import { CheckCircle2, ChevronDown, ClipboardList, Clock, Stethoscope, Plus, Search, Timer, Trash2, X } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { apiService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

const QUEUE_STATUSES = ['IN_WAITING_ROOM', 'UNDER_CONSULTATION', 'UNDER_TREATMENT', 'COMPLETED'] as const;
const QUEUE_TIME_ZONE = 'Asia/Colombo';

type QueueStatus = typeof QUEUE_STATUSES[number];

type QueueItem = {
  id: number;
  patient_id: number;
  patient_name: string;
  patient_code: string;
  priority?: 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW';
  status: QueueStatus;
  arrival_time: string;
  completion_time?: string | null;
  wait_time_minutes?: number;
  assigned_clinical_staff?: string | null;
};

type PatientOption = {
  id: number;
  patient_code: string;
  first_name: string;
  last_name: string;
};

const parseQueueTimestamp = (value?: string | null) => {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const hasExplicitTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const parsed = new Date(hasExplicitTimezone ? normalized : `${normalized}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatQueueArrival = (value?: string | null) => {
  const parsed = parseQueueTimestamp(value);
  if (!parsed) return '-';

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: QUEUE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(parsed).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
};

const formatWaitDuration = (item: QueueItem, now: Date) => {
  const arrival = parseQueueTimestamp(item.arrival_time);
  if (!arrival) return '-';

  const endTime = item.status === 'COMPLETED'
    ? parseQueueTimestamp(item.completion_time) || now
    : now;
  const elapsedSeconds = Math.max(0, Math.floor((endTime.getTime() - arrival.getTime()) / 1000));
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return `${minutes} min ${String(seconds).padStart(2, '0')} sec`;
};

const STATUS_META: Record<QueueStatus, {
  label: string;
  shortLabel: string;
  text: string;
  badge: string;
  selected: string;
}> = {
  IN_WAITING_ROOM: {
    label: 'In Waiting Room',
    shortLabel: 'Waiting',
    text: 'text-amber-600',
    badge: 'border-amber-200 bg-amber-50 text-amber-700',
    selected: 'ring-amber-400 shadow-[0_12px_30px_-18px_rgba(245,158,11,0.9)]'
  },
  UNDER_CONSULTATION: {
    label: 'Under Consultation',
    shortLabel: 'Consultation',
    text: 'text-sky-600',
    badge: 'border-sky-200 bg-sky-50 text-sky-700',
    selected: 'ring-sky-400 shadow-[0_12px_30px_-18px_rgba(14,165,233,0.9)]'
  },
  UNDER_TREATMENT: {
    label: 'Under Treatment',
    shortLabel: 'Treatment',
    text: 'text-violet-600',
    badge: 'border-violet-200 bg-violet-50 text-violet-700',
    selected: 'ring-violet-400 shadow-[0_12px_30px_-18px_rgba(139,92,246,0.9)]'
  },
  COMPLETED: {
    label: 'Completed',
    shortLabel: 'Completed',
    text: 'text-emerald-600',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    selected: 'ring-emerald-400 shadow-[0_12px_30px_-18px_rgba(16,185,129,0.9)]'
  }
};

const QUEUE_ROLES = ['ADMIN', 'NURSE', 'RECEPTION', 'ORTHODONTIST', 'DENTAL_SURGEON', 'STUDENT'];

export function ClinicQueuePage() {
  const { user } = useAuth();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queueAlert, setQueueAlert] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [initialStatus, setInitialStatus] = useState<QueueStatus>('IN_WAITING_ROOM');
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [statusMenuOpenId, setStatusMenuOpenId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<QueueItem | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());

  const role = user?.role || '';
  const canViewQueue = QUEUE_ROLES.includes(role);
  const canAddToQueue = role === 'RECEPTION';
  const canDeleteQueue = role === 'RECEPTION';
  const canUpdateQueue = ['RECEPTION', 'ORTHODONTIST', 'DENTAL_SURGEON', 'STUDENT'].includes(role);
  const isReadOnly = role === 'ADMIN' || role === 'NURSE';

  const loadPatientOptions = async () => {
    if (!canAddToQueue) return;
    const patientRes = await apiService.patients.getList({
      page: 1,
      limit: 100,
      deleted: 'active',
      sort: 'id',
      order: 'DESC'
    });
    setPatients(patientRes?.data?.patients || []);
  };

  const loadQueue = async () => {
    if (!canViewQueue) return;
    setLoading(true);
    setError(null);
    setQueueAlert(null);
    try {
      const queueRes = await apiService.queue.getList();
      setItems(queueRes.data?.queue || []);
      setStats(queueRes.data?.statistics || null);
      await loadPatientOptions();
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
  }, [role]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  const filteredPatients = useMemo(() => {
    const term = patientSearch.trim().toLowerCase();
    const sorted = [...patients].sort((a, b) => b.id - a.id);
    if (!term) return sorted.slice(0, 12);
    return sorted
      .filter((p) => {
        const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
        return fullName.includes(term) || String(p.patient_code || '').toLowerCase().includes(term);
      })
      .slice(0, 12);
  }, [patients, patientSearch]);

  const selectedPatient = useMemo(
    () => patients.find((p) => String(p.id) === selectedPatientId) || null,
    [patients, selectedPatientId]
  );

  const addToQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId) {
      setError('Select a registered patient before adding to the queue');
      return;
    }

    setAdding(true);
    setError(null);
    setQueueAlert(null);
    try {
      await apiService.queue.addToQueue({
        patient_id: Number(selectedPatientId),
        status: initialStatus
      });
      setAddOpen(false);
      resetAddQueueForm();
      await loadQueue();
    } catch (err: any) {
      const message = err?.message || 'Failed to add patient to queue';
      if (String(message).toLowerCase().includes('already in queue')) {
        setAddOpen(false);
        resetAddQueueForm();
        setQueueAlert(message);
        toast.error(message);
      } else {
        setError(message);
      }
    } finally {
      setAdding(false);
    }
  };

  const resetAddQueueForm = () => {
    setPatientSearch('');
    setSelectedPatientId('');
    setInitialStatus('IN_WAITING_ROOM');
  };

  const openAddQueueModal = () => {
    resetAddQueueForm();
    setQueueAlert(null);
    setAddOpen(true);
  };

  const closeAddQueueModal = () => {
    if (adding) return;
    setAddOpen(false);
    resetAddQueueForm();
  };

  const clearSelectedPatient = () => {
    resetAddQueueForm();
  };

  const updateStatus = async (item: QueueItem, status: QueueStatus) => {
    if (item.status === status) {
      setStatusMenuOpenId(null);
      return;
    }
    setUpdatingId(item.id);
    setError(null);
    try {
      await apiService.queue.updateStatus(String(item.id), { status });
      setStatusMenuOpenId(null);
      await loadQueue();
    } catch (err: any) {
      setError(err?.message || 'Failed to update queue status');
    } finally {
      setUpdatingId(null);
    }
  };

  const deleteQueueEntry = async () => {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    setError(null);
    try {
      await apiService.queue.remove(String(deleteTarget.id));
      setDeleteTarget(null);
      await loadQueue();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete queue entry');
    } finally {
      setDeletingId(null);
    }
  };

  const statusBadge = (status: QueueStatus) => (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold', STATUS_META[status].badge)}>
      {STATUS_META[status].label}
    </span>
  );

  const statCards = [
    { label: 'Total in Queue', value: stats?.total_in_queue ?? 0, className: 'text-gray-900', icon: ClipboardList },
    { label: 'Waiting', value: stats?.waiting_count ?? 0, className: STATUS_META.IN_WAITING_ROOM.text, icon: Clock },
    { label: 'Consultation', value: stats?.under_consultation_count ?? 0, className: STATUS_META.UNDER_CONSULTATION.text, icon: Stethoscope },
    { label: 'Treatment', value: stats?.under_treatment_count ?? 0, className: STATUS_META.UNDER_TREATMENT.text, icon: Timer },
    { label: 'Completed', value: stats?.completed_count ?? 0, className: STATUS_META.COMPLETED.text, icon: CheckCircle2 },
  ];

  if (!canViewQueue) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        You do not have access to the live clinic queue.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Live Clinic Queue</h2>
        </div>
        <div className="flex gap-2">
          <RefreshButton onClick={loadQueue} loading={loading} />
          {canAddToQueue && (
            <Button className="flex items-center gap-2" onClick={openAddQueueModal}>
              <Plus className="w-4 h-4" />
              Add to Queue
            </Button>
          )}
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {queueAlert && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 shadow-sm">
          {queueAlert}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {statCards.map((card) => (
          <Card key={card.label} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-medium leading-tight text-gray-500 sm:text-sm">{card.label}</p>
              <card.icon className={cn('h-4 w-4 shrink-0 sm:h-5 sm:w-5', card.className)} />
            </div>
            <p className={cn('mt-2 text-3xl font-extrabold leading-none', card.className)}>{card.value}</p>
          </Card>
        ))}
      </div>

      <Card className="p-0">
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-6 py-4">
          <div>
            <h3 className="font-bold text-gray-900">Queue Entries</h3>
            <p className="text-xs text-gray-500">
              {items.length} {items.length === 1 ? 'patient' : 'patients'} visible in this queue view.
            </p>
          </div>
        </div>
        <Table tableClassName="w-full min-w-[1120px] text-sm text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-6 py-4 font-semibold text-gray-600 whitespace-nowrap">Patient</th>
              <th className="px-6 py-4 font-semibold text-gray-600 whitespace-nowrap">Status</th>
              <th className="px-6 py-4 font-semibold text-gray-600 whitespace-nowrap">Assigned Staff</th>
              <th className="px-6 py-4 font-semibold text-gray-600 whitespace-nowrap">Wait</th>
              <th className="px-6 py-4 font-semibold text-gray-600 whitespace-nowrap">Arrival</th>
              {!isReadOnly && <th className="px-6 py-4 font-semibold text-gray-600 text-center whitespace-nowrap">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {!loading && items.map((item) => (
              <tr key={item.id} className="hover:bg-blue-50/30 transition-colors">
                <td className="px-6 py-4 align-middle whitespace-nowrap">
                  <p className="font-semibold text-gray-900">{item.patient_name}</p>
                  <p className="text-xs font-medium text-blue-600">MRN: {item.patient_code}</p>
                </td>
                <td className="px-6 py-4 align-middle whitespace-nowrap">{statusBadge(item.status)}</td>
                <td className="px-6 py-4 align-middle text-gray-600 whitespace-nowrap">
                  {item.assigned_clinical_staff || 'Unassigned'}
                </td>
                <td className="px-6 py-4 align-middle text-gray-600 whitespace-nowrap">
                  {formatWaitDuration(item, currentTime)}
                </td>
                <td className="px-6 py-4 align-middle text-gray-600 whitespace-nowrap">
                  {formatQueueArrival(item.arrival_time)}
                </td>
                {!isReadOnly && (
                  <td className="px-6 py-4 align-middle text-center whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2">
                      {canUpdateQueue && (
                        <div className="relative">
                          <DropdownMenu
                            open={statusMenuOpenId === item.id}
                            onOpenChange={(open) => setStatusMenuOpenId(open ? item.id : null)}
                          >
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className={cn(
                                  'flex h-10 min-w-[13.5rem] items-center justify-between gap-3 rounded-lg border px-3 text-sm font-semibold transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 active:translate-y-0 active:scale-[0.99]',
                                  STATUS_META[item.status].badge,
                                  STATUS_META[item.status].selected,
                                  updatingId === item.id && 'cursor-wait opacity-70'
                                )}
                                disabled={updatingId === item.id}
                              >
                                <span>{STATUS_META[item.status].label}</span>
                                <ChevronDown
                                  className={cn(
                                    'h-4 w-4 transition-transform',
                                    statusMenuOpenId === item.id && 'rotate-180'
                                  )}
                                />
                              </button>
                            </DropdownMenuTrigger>

                            <DropdownMenuContent className="w-72 p-2">
                              <div className="px-2 pb-2 pt-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                                Change queue status
                              </div>
                              <div className="space-y-1.5">
                                {QUEUE_STATUSES.map((status) => {
                                  const selected = item.status === status;
                                  return (
                                    <DropdownMenuItem
                                      key={status}
                                      className={cn(
                                        'flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm font-semibold transition-all active:translate-y-0 active:scale-[0.99]',
                                        STATUS_META[status].badge,
                                        selected
                                          ? cn('ring-2 ring-offset-1', STATUS_META[status].selected)
                                          : 'opacity-85 hover:opacity-100'
                                      )}
                                      onSelect={() => updateStatus(item, status)}
                                      disabled={updatingId === item.id}
                                    >
                                      <span>{STATUS_META[status].label}</span>
                                      {selected && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                                    </DropdownMenuItem>
                                  );
                                })}
                              </div>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                      {canDeleteQueue && (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setDeleteTarget(item)}
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>

        {loading && <div className="p-8 text-sm text-gray-500 flex items-center gap-2"><Clock className="w-4 h-4" /> Loading queue...</div>}
        {!loading && items.length === 0 && <div className="p-8 text-sm text-gray-500">No queue entries found.</div>}
      </Card>

      {addOpen && canAddToQueue && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/45 backdrop-blur-[1px] p-4">
          <div className="flex w-full max-w-4xl max-h-[92vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="shrink-0 flex items-center justify-between border-b border-slate-200 bg-blue-50 px-6 py-5">
              <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-600" />
                Add Patient to Queue
              </h3>
              <Button
                variant="secondary"
                size="icon"
                className="h-9 w-9 border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                onClick={closeAddQueueModal}
                disabled={adding}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <form className="flex min-h-0 flex-1 flex-col" onSubmit={addToQueue}>
              <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-7 py-6">
              <div className="space-y-4">
                <label className="mb-2 block text-xs font-semibold text-gray-600">Search Registered Patient</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    className="pl-9"
                    placeholder="Search by full name or MRN"
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                  />
                </div>
                <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-100 p-1">
                  {filteredPatients.length === 0 ? (
                    <div className="p-4 text-sm text-gray-400">No registered patients found.</div>
                  ) : filteredPatients.map((p) => {
                    const selected = selectedPatientId === String(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedPatientId(String(p.id))}
                        className={cn(
                          'flex w-full items-center justify-between gap-3 rounded-md border px-4 py-4 text-left text-sm transition-all',
                          selected
                            ? 'border-blue-300 bg-blue-50 text-blue-700 shadow-sm'
                            : 'border-transparent bg-white text-gray-700 hover:border-blue-100 hover:bg-blue-50/50'
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{p.first_name} {p.last_name}</span>
                          <span className="text-xs">MRN: {p.patient_code}</span>
                        </span>
                        {selected && <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-600" />}
                      </button>
                    );
                  })}
                </div>
                {selectedPatient && (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-4 text-sm text-blue-800">
                    <div className="min-w-0">
                      <span className="block text-xs font-semibold uppercase text-blue-600">Selected Patient</span>
                      <span className="block truncate">
                        <strong>{selectedPatient.first_name} {selectedPatient.last_name}</strong> ({selectedPatient.patient_code})
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-9 border-blue-200 bg-white px-3 text-blue-700 hover:bg-blue-100"
                      onClick={clearSelectedPatient}
                      disabled={adding}
                    >
                      <X className="mr-1 h-3.5 w-3.5" />
                      Clear
                    </Button>
                  </div>
                )}
              </div>

              {selectedPatient && (
                <div className="space-y-4">
                    <label className="mb-2 block text-xs font-semibold text-gray-600">Current Queue Status</label>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {QUEUE_STATUSES.map((status) => {
                      const selected = initialStatus === status;
                      return (
                        <button
                          key={status}
                          type="button"
                          onClick={() => setInitialStatus(status)}
                          className={cn(
                            'flex min-h-[4.25rem] items-center rounded-lg border px-4 py-3 text-left text-sm font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.99]',
                            STATUS_META[status].badge,
                            selected
                              ? cn('scale-[1.015] ring-2 ring-offset-2 opacity-100', STATUS_META[status].selected)
                              : 'opacity-80 hover:opacity-100'
                          )}
                        >
                          <span>{STATUS_META[status].label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              </div>

              <div className="shrink-0 flex justify-end gap-2 border-t border-slate-100 bg-white px-7 py-5">
                <Button type="button" variant="secondary" onClick={closeAddQueueModal} disabled={adding}>
                  Cancel
                </Button>
                <Button type="submit" disabled={adding || !selectedPatientId}>
                  {adding ? 'Adding...' : 'Add to Queue'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/45 backdrop-blur-[1px] p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            <div className="border-b border-red-100 bg-red-50 px-5 py-4">
              <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-600" />
                Delete Queue Entry
              </h3>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800">
                Remove <strong>{deleteTarget.patient_name}</strong> from the live clinic queue?
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={deletingId !== null}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onClick={deleteQueueEntry}
                  disabled={deletingId !== null}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  {deletingId !== null ? 'Deleting...' : 'Delete'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
