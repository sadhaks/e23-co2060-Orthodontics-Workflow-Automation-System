import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Badge, Button, Card, Input, RefreshButton, cn } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { toast } from 'sonner';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Clock,
  FolderOpen,
  GraduationCap,
  Plus,
  Search,
  Trash2,
  X
} from 'lucide-react';

type CaseStatus = 'ASSIGNED' | 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED';
type TaskStatus = 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'REVIEWED';
type LogbookOrder = 'latest' | 'oldest';

type CaseListRow = {
  id: number;
  patient_id: number;
  patient_code: string;
  patient_name: string;
  student_id: number;
  student_name: string;
  supervisor_id: number;
  supervisor_name: string;
  status: CaseStatus;
  progress_percentage: number;
  total_tasks: number;
  completed_tasks: number;
  reviewed_tasks: number;
  pending_tasks: number;
  overdue_tasks: number;
  student_assignment_active?: boolean;
  updated_at: string;
  last_task_update_at?: string | null;
};

type CaseTask = {
  id: number;
  title: string;
  description?: string | null;
  deadline_at?: string | null;
  status: TaskStatus;
  completion_notes?: string | null;
  completed_at?: string | null;
  review_notes?: string | null;
  reviewed_at?: string | null;
  reviewed_by_name?: string | null;
  is_overdue?: boolean;
};

type CaseLogEntry = {
  id: number;
  actor_name: string;
  actor_role: string;
  title: string;
  entry_text?: string | null;
  evaluation?: string | null;
  created_at: string;
};

type CaseDetailResponse = {
  case: CaseListRow;
  tasks: CaseTask[];
  logbook: CaseLogEntry[];
};

type TaskUpdateDraft = {
  status: '' | TaskStatus;
  completion_notes: string;
};

type TaskReviewDraft = {
  status: '' | TaskStatus;
  review_notes: string;
};

type ConfirmationDialogState = {
  open: boolean;
  title: string;
  message: string;
  confirmText: string;
  tone: 'warning' | 'danger';
  processing: boolean;
  onConfirm: null | (() => Promise<void>);
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
};

const caseVariant = (status: CaseStatus) => {
  if (status === 'VERIFIED') return 'success';
  if (status === 'PENDING_VERIFICATION') return 'warning';
  if (status === 'REJECTED') return 'error';
  return 'blue';
};

const taskVariant = (status: TaskStatus, overdue?: boolean) => {
  if (overdue) return 'error';
  if (status === 'REVIEWED') return 'success';
  if (status === 'COMPLETED') return 'blue';
  if (status === 'IN_PROGRESS') return 'warning';
  return 'neutral';
};

export function StudentCasesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [rows, setRows] = useState<CaseListRow[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);
  const [detail, setDetail] = useState<CaseDetailResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [logbookOrder, setLogbookOrder] = useState<LogbookOrder>('latest');
  const [search, setSearch] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    deadline_at: ''
  });
  const [taskUpdates, setTaskUpdates] = useState<Record<number, TaskUpdateDraft>>({});
  const [taskReviews, setTaskReviews] = useState<Record<number, TaskReviewDraft>>({});
  const [confirmDialog, setConfirmDialog] = useState<ConfirmationDialogState>({
    open: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    tone: 'warning',
    processing: false,
    onConfirm: null
  });

  const isStudent = user?.role === 'STUDENT';
  const isSupervisor = ['ORTHODONTIST', 'DENTAL_SURGEON'].includes(user?.role || '');
  const isAdmin = user?.role === 'ADMIN';
  const roleLabel = isStudent ? 'Student workspace' : isSupervisor ? 'Supervisor workspace' : 'Case overview';

  const loadCases = async () => {
    setLoadingList(true);
    setError(null);
    try {
      const [listRes, statsRes] = await Promise.all([
        apiService.cases.getList({
          page: 1,
          limit: 100,
          status: statusFilter || undefined,
          search: search.trim() || undefined
        }),
        apiService.cases.getStats()
      ]);

      const nextRows = listRes.data?.cases || [];
      setRows(nextRows);
      setStats(statsRes.data?.overview || null);
      setSelectedCaseId((current) => {
        if (current && nextRows.some((row: CaseListRow) => row.id === current)) return current;
        return nextRows[0]?.id ?? null;
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to load student cases');
      setRows([]);
      setStats(null);
      setSelectedCaseId(null);
    } finally {
      setLoadingList(false);
    }
  };

  const loadCaseDetail = async (caseId: number) => {
    setLoadingDetail(true);
    try {
      const response = await apiService.cases.getById(String(caseId));
      const payload = response.data || null;
      setDetail(payload);

      const nextUpdates: Record<number, TaskUpdateDraft> = {};
      const nextReviews: Record<number, TaskReviewDraft> = {};
      for (const task of payload?.tasks || []) {
        nextUpdates[task.id] = {
          status: '',
          completion_notes: ''
        };
        nextReviews[task.id] = {
          status: '',
          review_notes: ''
        };
      }
      setTaskUpdates(nextUpdates);
      setTaskReviews(nextReviews);
    } catch (err: any) {
      setDetail(null);
      toast.error(err?.message || 'Failed to load case details');
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadCases();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search, statusFilter]);

  useEffect(() => {
    if (!selectedCaseId) {
      setDetail(null);
      return;
    }
    loadCaseDetail(selectedCaseId);
  }, [selectedCaseId]);

  const selectedCase = detail?.case || rows.find((row) => row.id === selectedCaseId) || null;
  const selectedCaseStudentRemoved = Boolean(selectedCase && selectedCase.student_assignment_active === false);
  const tasks = detail?.tasks || [];
  const activeTasks = tasks.filter((task) => task.status !== 'REVIEWED');
  const reviewedTasks = tasks.filter((task) => task.status === 'REVIEWED');
  const sortedLogbookEntries = useMemo(() => {
    const entries = [...(detail?.logbook || [])];
    entries.sort((a, b) => {
      const firstTime = new Date(a.created_at).getTime();
      const secondTime = new Date(b.created_at).getTime();
      const first = Number.isFinite(firstTime) ? firstTime : 0;
      const second = Number.isFinite(secondTime) ? secondTime : 0;
      const timeOrder = logbookOrder === 'latest' ? second - first : first - second;
      if (timeOrder !== 0) return timeOrder;
      return logbookOrder === 'latest' ? b.id - a.id : a.id - b.id;
    });
    return entries;
  }, [detail?.logbook, logbookOrder]);

  const statsCards = useMemo(() => ([
    { label: 'Cases', value: stats?.total_cases ?? 0, tone: 'text-slate-900', icon: ClipboardList },
    { label: 'Assigned Tasks', value: stats?.total_tasks ?? 0, tone: 'text-blue-600', icon: GraduationCap },
    { label: 'Completed Tasks', value: stats?.completed_tasks ?? 0, tone: 'text-emerald-600', icon: CheckCircle2 },
    { label: 'Pending Tasks', value: stats?.pending_tasks ?? 0, tone: 'text-amber-600', icon: Clock },
    { label: 'Overdue Tasks', value: stats?.overdue_tasks ?? 0, tone: 'text-red-600', icon: AlertTriangle }
  ]), [stats]);
  const workflowSteps = useMemo(() => {
    if (isStudent) {
      return [
        { label: 'Assigned', value: stats?.pending_tasks ?? 0, tone: 'border-amber-200 bg-amber-50 text-amber-800' },
        { label: 'Complete', value: stats?.completed_tasks ?? 0, tone: 'border-blue-200 bg-blue-50 text-blue-800' },
        { label: 'Reviewed', value: stats?.reviewed_tasks ?? 0, tone: 'border-emerald-200 bg-emerald-50 text-emerald-800' }
      ];
    }
    return [
      { label: 'Assign work', value: stats?.total_tasks ?? 0, tone: 'border-blue-200 bg-blue-50 text-blue-800' },
      { label: 'Needs review', value: stats?.completed_tasks ?? 0, tone: 'border-indigo-200 bg-indigo-50 text-indigo-800' },
      { label: 'Accepted', value: stats?.reviewed_tasks ?? 0, tone: 'border-emerald-200 bg-emerald-50 text-emerald-800' }
    ];
  }, [isStudent, stats]);

  const openConfirmDialog = (config: Omit<ConfirmationDialogState, 'open' | 'processing'>) => {
    setConfirmDialog({
      ...config,
      open: true,
      processing: false
    });
  };

  const closeConfirmDialog = () => {
    if (confirmDialog.processing) return;
    setConfirmDialog((prev) => ({
      ...prev,
      open: false,
      onConfirm: null
    }));
  };

  const runConfirmDialog = async () => {
    if (!confirmDialog.onConfirm || confirmDialog.processing) return;
    setConfirmDialog((prev) => ({ ...prev, processing: true }));
    try {
      await confirmDialog.onConfirm();
      setConfirmDialog((prev) => ({ ...prev, open: false, processing: false, onConfirm: null }));
    } catch {
      setConfirmDialog((prev) => ({ ...prev, processing: false }));
    }
  };

  const assignTask = async () => {
    if (!selectedCase) return;
    if (!taskForm.title.trim()) {
      toast.error('Task title is required');
      return;
    }

    setSavingAssignment(true);
    try {
      await apiService.cases.assignTask(String(selectedCase.id), {
        title: taskForm.title.trim(),
        description: taskForm.description.trim() || undefined,
        deadline_at: taskForm.deadline_at || undefined
      });
      toast.success('Task assigned to student');
      setTaskForm({ title: '', description: '', deadline_at: '' });
      await Promise.all([loadCases(), loadCaseDetail(selectedCase.id)]);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to assign task');
    } finally {
      setSavingAssignment(false);
    }
  };

  const updateTask = async (taskId: number) => {
    if (!selectedCase) return;
    const form = taskUpdates[taskId];
    if (!form) return;
    if (!form.status) {
      toast.error('Select the current task progress before saving');
      return;
    }

    setSavingTask(true);
    try {
      await apiService.cases.updateTask(String(selectedCase.id), String(taskId), form);
      toast.success('Task progress updated');
      setTaskUpdates((prev) => ({
        ...prev,
        [taskId]: { status: '', completion_notes: '' }
      }));
      await Promise.all([loadCases(), loadCaseDetail(selectedCase.id)]);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update task');
    } finally {
      setSavingTask(false);
    }
  };

  const reviewTask = async (taskId: number) => {
    if (!selectedCase) return;
    const form = taskReviews[taskId];
    if (!form) return;
    if (!form.status && !form.review_notes.trim()) {
      toast.error('Select a review result or enter review notes before saving');
      return;
    }

    setSavingReview(true);
    try {
      const payload: { status?: string; review_notes?: string } = {};
      if (form.status) payload.status = form.status;
      if (form.review_notes.trim()) payload.review_notes = form.review_notes.trim();

      await apiService.cases.reviewTask(String(selectedCase.id), String(taskId), payload);
      toast.success('Task review recorded');
      setTaskReviews((prev) => ({
        ...prev,
        [taskId]: { status: '', review_notes: '' }
      }));
      await Promise.all([loadCases(), loadCaseDetail(selectedCase.id)]);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to review task');
    } finally {
      setSavingReview(false);
    }
  };

  const deleteTask = async (taskId: number, title: string) => {
    if (!selectedCase) return;
    const caseId = selectedCase.id;
    openConfirmDialog({
      title: 'Delete Task',
      message: `Delete the task "${title}"? This keeps a logbook entry but removes the task from the active list.`,
      confirmText: 'Delete Task',
      tone: 'danger',
      onConfirm: async () => {
        setSavingAssignment(true);
        try {
          await apiService.cases.deleteTask(String(caseId), String(taskId));
          toast.success('Task deleted');
          await Promise.all([loadCases(), loadCaseDetail(caseId)]);
        } catch (err: any) {
          toast.error(err?.message || 'Failed to delete task');
          throw err;
        } finally {
          setSavingAssignment(false);
        }
      }
    });
  };

  const deleteCase = async (caseRow: CaseListRow) => {
    openConfirmDialog({
      title: 'Remove Accessible Case',
      message: `Remove ${caseRow.patient_name} from Accessible Cases? This removes the case from the supervisor and student task bars.`,
      confirmText: 'Remove Case',
      tone: 'danger',
      onConfirm: async () => {
        setSavingAssignment(true);
        try {
          await apiService.cases.deleteCase(String(caseRow.id));
          toast.success('Case removed from Accessible Cases');
          await loadCases();
          if (selectedCaseId === caseRow.id) {
            setDetail(null);
          }
        } catch (err: any) {
          toast.error(err?.message || 'Failed to remove case');
          throw err;
        } finally {
          setSavingAssignment(false);
        }
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">{roleLabel}</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">Student Case Management</h2>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search patient or student"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 sm:w-72"
            />
          </div>
          <select
            className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All case statuses</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="PENDING_VERIFICATION">Pending Verification</option>
            <option value="VERIFIED">Verified</option>
            <option value="REJECTED">Rejected</option>
          </select>
          <RefreshButton onClick={loadCases} loading={loadingList} />
        </div>
      </div>

      <Card className="p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-3">
          {workflowSteps.map((step, index) => (
            <div key={step.label} className={cn('rounded-xl border px-4 py-3', step.tone)}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold">{index + 1}. {step.label}</p>
                <span className="text-2xl font-black tabular-nums">{step.value}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {statsCards.map((item) => (
          <Card key={item.label} className="p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-slate-500">{item.label}</p>
              <item.icon className={cn('h-5 w-5', item.tone)} />
            </div>
            <p className={cn('mt-2 text-3xl font-extrabold', item.tone)}>{item.value}</p>
          </Card>
        ))}
      </div>

      <div className="space-y-6">
        <Card className="overflow-hidden">
          <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
            <h3 className="font-bold text-slate-900">Accessible Cases</h3>
            <p className="text-xs text-slate-500">{rows.length} {rows.length === 1 ? 'case' : 'cases'} visible.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 p-4 sm:gap-5 sm:p-5 md:grid-cols-2 xl:grid-cols-3">
            {loadingList && <div className="p-4 text-sm text-slate-500">Loading cases...</div>}
            {!loadingList && rows.length === 0 && <div className="p-4 text-sm text-slate-500">No student cases found.</div>}
            {rows.map((row) => {
              const studentRemoved = row.student_assignment_active === false;
              return (
                <div
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedCaseId(row.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedCaseId(row.id);
                    }
                  }}
                  className={cn(
                    'touch-manipulation cursor-pointer rounded-xl border px-4 py-4 text-left transition-all hover:border-blue-200 hover:bg-blue-50/40 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:px-5 sm:py-5',
                    selectedCaseId === row.id
                      ? 'border-blue-200 bg-blue-50 shadow-sm ring-1 ring-inset ring-blue-100'
                      : studentRemoved
                        ? 'border-amber-200 bg-amber-50/40'
                        : 'border-gray-100 bg-white'
                  )}
                >
                  <div className="flex flex-col gap-3">
                    <div className="min-w-0 flex-1 text-left">
                      <p className="break-words text-lg font-bold leading-tight text-slate-900">{row.patient_name}</p>
                      <p className="mt-1 text-sm text-slate-500">{row.patient_code} • Student: {row.student_name}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={studentRemoved ? 'warning' : caseVariant(row.status)}>{studentRemoved ? 'STUDENT REMOVED' : row.status}</Badge>
                    </div>
                  </div>
                  {studentRemoved && (
                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-relaxed text-amber-800">
                      This patient has been removed from the student. Delete is available in the selected case details below.
                    </div>
                  )}
                  <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm text-slate-600">
                    <span>Tasks: {row.total_tasks}</span>
                    <span>Done: {row.completed_tasks}</span>
                    <span>Reviewed: {row.reviewed_tasks}</span>
                    <span>Overdue: {row.overdue_tasks}</span>
                  </div>
                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                      <span>Task progress</span>
                      <span>{row.progress_percentage || 0}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full bg-blue-600 transition-all"
                        style={{ width: `${Math.max(0, Math.min(100, row.progress_percentage || 0))}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

          {!selectedCase && (
            <Card className="p-5 text-sm text-slate-500 sm:p-6">
              Select a case to view assigned tasks, deadlines, student completion state, and supervisor review.
            </Card>
          )}

          {selectedCase && (
            <>
              <Card className="p-5 sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-bold text-slate-900">{selectedCase.patient_name}</h3>
                      <Badge variant={selectedCaseStudentRemoved ? 'warning' : caseVariant(selectedCase.status)}>
                        {selectedCaseStudentRemoved ? 'STUDENT REMOVED' : selectedCase.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-500">
                      {selectedCase.patient_code} • Student: {selectedCase.student_name} • Supervisor: {selectedCase.supervisor_name}
                    </p>
                  </div>
                  <Button variant="secondary" onClick={() => navigate(`/patients/${selectedCase.patient_id}`)}>
                    <FolderOpen className="mr-2 h-4 w-4" />
                    Open Patient
                  </Button>
                </div>

                {selectedCaseStudentRemoved && (
                  <div className="mt-5 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
                    <p className="font-semibold">
                      This patient has been removed from {selectedCase.student_name}. Delete this student case when it is no longer needed.
                    </p>
                    {(isSupervisor || isAdmin) && (
                      <Button variant="danger" onClick={() => deleteCase(selectedCase)} disabled={savingAssignment}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Case
                      </Button>
                    )}
                  </div>
                )}

                <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
                  <MetricCard label="Assigned Tasks" value={selectedCase.total_tasks} />
                  <MetricCard label="Completed" value={selectedCase.completed_tasks} tone="text-emerald-600" />
                  <MetricCard label="Pending" value={selectedCase.pending_tasks} tone="text-amber-600" />
                  <MetricCard label="Overdue" value={selectedCase.overdue_tasks} tone="text-red-600" />
                </div>

                {loadingDetail && <p className="mt-4 text-sm text-slate-500">Loading task workspace...</p>}
              </Card>

              {isSupervisor && !selectedCaseStudentRemoved && (
                <Card className="p-5 sm:p-6">
                  <h4 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                    <Plus className="h-5 w-5 text-blue-600" />
                    Assign New Task
                  </h4>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    Give the student one clear action at a time. Reviewed tasks are archived below, so the active list stays focused.
                  </p>
                  <div className="mt-5 space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Task title</label>
                      <Input value={taskForm.title} onChange={(e) => setTaskForm((prev) => ({ ...prev, title: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Description</label>
                      <textarea
                        value={taskForm.description}
                        onChange={(e) => setTaskForm((prev) => ({ ...prev, description: e.target.value }))}
                        className="min-h-28 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Deadline</label>
                      <Input
                        type="datetime-local"
                        value={taskForm.deadline_at}
                        onChange={(e) => setTaskForm((prev) => ({ ...prev, deadline_at: e.target.value }))}
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button className="w-full sm:w-auto" onClick={assignTask} disabled={savingAssignment}>
                        <Plus className="mr-2 h-4 w-4" />
                        {savingAssignment ? 'Assigning...' : 'Assign Task'}
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              <Card className="p-5 sm:p-6">
                <h4 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                  <ClipboardList className="h-5 w-5 text-blue-600" />
                  Task Progress
                </h4>
                <div className="mt-5 space-y-4">
                  {activeTasks.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                      No active tasks.
                    </div>
                  )}
                  {activeTasks.map((task) => (
                    <div key={task.id} className="rounded-xl border border-slate-200 p-4 sm:p-5">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="break-words font-semibold text-slate-900">{task.title}</p>
                            <Badge variant={taskVariant(task.status, task.is_overdue) as any}>
                              {task.is_overdue ? 'OVERDUE' : task.status}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm text-slate-600">{task.description || 'No description provided.'}</p>
                          <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
                            <span>Deadline: {formatDateTime(task.deadline_at)}</span>
                            <span>Completed: {formatDateTime(task.completed_at)}</span>
                            <span>Reviewed: {formatDateTime(task.reviewed_at)}</span>
                          </div>
                        </div>
                        {isSupervisor && (
                          <div className="flex justify-end">
                            <Button
                              variant="danger"
                              className="w-full sm:w-auto"
                              onClick={() => deleteTask(task.id, task.title)}
                              disabled={savingAssignment}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete Task
                            </Button>
                          </div>
                        )}
                      </div>

                      {task.completion_notes && (
                        <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Student notes</p>
                          <p className="mt-1 whitespace-pre-wrap">{task.completion_notes}</p>
                        </div>
                      )}

                      {task.review_notes && (
                        <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-slate-700">
                          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Supervisor review</p>
                          <p className="mt-1 whitespace-pre-wrap">{task.review_notes}</p>
                          <p className="mt-1 text-xs text-emerald-700">Reviewed by {task.reviewed_by_name || 'Supervisor'}</p>
                        </div>
                      )}

                      {isStudent && (
                        <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
                          <p className="text-sm font-semibold text-slate-900">Update your task progress</p>
                          <div className="mt-3 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_auto]">
                            <select
                              className="min-h-11 rounded-md border border-gray-200 bg-white px-3 text-base sm:min-h-10 sm:text-sm"
                              value={taskUpdates[task.id]?.status || ''}
                              onChange={(e) => setTaskUpdates((prev) => ({
                                ...prev,
                                [task.id]: {
                                  ...(prev[task.id] || { completion_notes: '' }),
                                  status: e.target.value as '' | TaskStatus
                                }
                              }))}
                            >
                              <option value="">Select progress</option>
                              <option value="ASSIGNED">Assigned</option>
                              <option value="IN_PROGRESS">In Progress</option>
                              <option value="COMPLETED">Completed</option>
                            </select>
                            <textarea
                              value={taskUpdates[task.id]?.completion_notes || ''}
                              onChange={(e) => setTaskUpdates((prev) => ({
                                ...prev,
                                [task.id]: {
                                  status: prev[task.id]?.status || '',
                                  completion_notes: e.target.value
                                }
                              }))}
                              className="min-h-24 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
                              placeholder="Explain what was completed for this task."
                            />
                            <div className="flex items-end">
                              <Button className="w-full sm:w-auto" onClick={() => updateTask(task.id)} disabled={savingTask}>
                                {savingTask ? 'Saving...' : 'Update Task'}
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      {isSupervisor && (
                        <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
                          <p className="text-sm font-semibold text-slate-900">Supervisor review</p>
                          <div className="mt-3 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_auto]">
                            <select
                              className="min-h-11 rounded-md border border-gray-200 bg-white px-3 text-base sm:min-h-10 sm:text-sm"
                              value={taskReviews[task.id]?.status || ''}
                              onChange={(e) => setTaskReviews((prev) => ({
                                ...prev,
                                [task.id]: {
                                  ...(prev[task.id] || { review_notes: '' }),
                                  status: e.target.value as '' | TaskStatus
                                }
                              }))}
                            >
                              <option value="">Select review result</option>
                              <option value="IN_PROGRESS">Needs More Work</option>
                              <option value="COMPLETED">Completed</option>
                              <option value="REVIEWED">Reviewed / Accepted</option>
                            </select>
                            <textarea
                              value={taskReviews[task.id]?.review_notes || ''}
                              onChange={(e) => setTaskReviews((prev) => ({
                                ...prev,
                                [task.id]: {
                                  status: prev[task.id]?.status || '',
                                  review_notes: e.target.value
                                }
                              }))}
                              className="min-h-24 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
                              placeholder="Review the student’s work on this task."
                            />
                            <div className="flex items-end">
                              <Button className="w-full sm:w-auto" onClick={() => reviewTask(task.id)} disabled={savingReview}>
                                {savingReview ? 'Saving...' : 'Save Review'}
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>

              {reviewedTasks.length > 0 && (
                <Card className="p-5 sm:p-6">
                  <h4 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    Reviewed Tasks
                  </h4>
                  <p className="mt-1 text-sm text-slate-500">
                    Accepted tasks are kept here as part of the case record after they leave the active student and supervisor task bars.
                  </p>
                  <div className="mt-5 space-y-4">
                    {reviewedTasks.map((task) => (
                      <div key={task.id} className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 sm:p-5">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <p className="break-words font-semibold text-slate-900">{task.title}</p>
                          <Badge variant="success">REVIEWED</Badge>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">{task.description || 'No description provided.'}</p>
                        <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
                          <span>Deadline: {formatDateTime(task.deadline_at)}</span>
                          <span>Completed: {formatDateTime(task.completed_at)}</span>
                          <span>Reviewed: {formatDateTime(task.reviewed_at)}</span>
                        </div>
                        {task.completion_notes && (
                          <div className="mt-3 rounded-lg bg-white/80 p-3 text-sm text-slate-700">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Student notes</p>
                            <p className="mt-1 whitespace-pre-wrap">{task.completion_notes}</p>
                          </div>
                        )}
                        {task.review_notes && (
                          <div className="mt-3 rounded-lg bg-white/80 p-3 text-sm text-slate-700">
                            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Supervisor review</p>
                            <p className="mt-1 whitespace-pre-wrap">{task.review_notes}</p>
                            <p className="mt-1 text-xs text-emerald-700">Reviewed by {task.reviewed_by_name || 'Supervisor'}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              <Card className="p-5 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h4 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                    <BookOpen className="h-5 w-5 text-slate-600" />
                    Chronological Logbook
                  </h4>
                  <div className="inline-flex w-fit overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
                    <button
                      type="button"
                      onClick={() => setLogbookOrder('latest')}
                      className={cn(
                        'rounded-md px-3 py-1.5 text-sm font-semibold transition-colors',
                        logbookOrder === 'latest'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      )}
                    >
                      Latest first
                    </button>
                    <button
                      type="button"
                      onClick={() => setLogbookOrder('oldest')}
                      className={cn(
                        'rounded-md px-3 py-1.5 text-sm font-semibold transition-colors',
                        logbookOrder === 'oldest'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      )}
                    >
                      Oldest first
                    </button>
                  </div>
                </div>
                <div className="mt-5 space-y-4">
                  {sortedLogbookEntries.length ? sortedLogbookEntries.map((entry) => (
                    <div key={entry.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">{entry.title}</p>
                          <p className="text-xs text-slate-500">
                            {entry.actor_name} • {entry.actor_role.replace(/_/g, ' ')}
                          </p>
                        </div>
                        <p className="text-xs text-slate-500">{formatDateTime(entry.created_at)}</p>
                      </div>
                      {entry.entry_text && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{entry.entry_text}</p>}
                      {entry.evaluation && (
                        <p className="mt-3 text-xs font-medium text-slate-500">Result: {entry.evaluation}</p>
                      )}
                    </div>
                  )) : (
                    <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                      No logbook entries yet.
                    </div>
                  )}
                </div>
              </Card>

              {isAdmin && (
                <Card className="p-5 text-sm text-slate-600">
                  Admin access is read-only for student task progress and supervisor review. Removed student cases can be deleted when cleanup is needed.
                </Card>
              )}
            </>
          )}
      </div>

      {confirmDialog.open && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/45 px-4 py-6 backdrop-blur-[1px]">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-red-100 bg-red-50 px-5 py-4">
              <h3 className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                {confirmDialog.title}
              </h3>
              <Button
                variant="secondary"
                size="icon"
                className="h-9 w-9 border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                onClick={closeConfirmDialog}
                disabled={confirmDialog.processing}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800">
                {confirmDialog.message}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={closeConfirmDialog} disabled={confirmDialog.processing}>
                  Cancel
                </Button>
                <Button variant="danger" onClick={runConfirmDialog} disabled={confirmDialog.processing}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  {confirmDialog.processing ? 'Processing...' : confirmDialog.confirmText}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, tone = 'text-slate-900' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cn('mt-2 text-3xl font-black', tone)}>{value}</p>
    </div>
  );
}
