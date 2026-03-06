import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Table, Button, Input, Badge } from '../components/UI';
import { Search, Filter, UserPlus, Pencil, Trash2, ChevronDown, RefreshCcw } from 'lucide-react';
import { useNavigate } from 'react-router';
import { apiService } from '../services/api';
import { useAuth } from '../context/AuthContext';

type PatientRecord = {
  id: number;
  patient_code: string;
  first_name: string;
  last_name: string;
  date_of_birth?: string;
  age?: number;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  province?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  status: 'ACTIVE' | 'COMPLETED' | 'CONSULTATION' | 'MAINTENANCE' | 'INACTIVE';
  display_status?: 'ACTIVE' | 'COMPLETED' | 'CONSULTATION' | 'MAINTENANCE' | 'INACTIVE';
  is_inactive?: boolean;
  last_visit?: string | null;
  assigned_orthodontist_name?: string | null;
  assigned_surgeon_name?: string | null;
  assigned_student_name?: string | null;
  assignment_request_status?: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
};

type StaffMember = {
  id: number;
  name: string;
  email: string;
  role?: 'ORTHODONTIST' | 'DENTAL_SURGEON' | 'NURSE' | 'STUDENT';
};

type DirectoryFilters = {
  assignedOrthodontist: string;
  registrationDate: string;
};

type MultiSelectOption = {
  id: number | string;
  name: string;
  email?: string;
};

const initialForm = {
  first_name: '',
  last_name: '',
  registration_date: '',
  date_of_birth: '',
  age: '',
  gender: 'FEMALE',
  phone: '',
  email: '',
  address: '',
  province: ''
};

const calculateAgeFromDob = (dobValue: string) => {
  if (!dobValue) return '';
  const dob = new Date(dobValue);
  if (Number.isNaN(dob.getTime())) return '';
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age -= 1;
  }
  if (age < 0) return '';
  return String(age);
};

const toDateTimeLocalValue = (value?: string | null) => {
  if (!value) return '';
  const raw = String(value).trim();
  const direct = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);
  if (direct) {
    const [, datePart, hh, mm] = direct;
    return `${datePart}T${hh}:${mm}`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const hour = String(parsed.getHours()).padStart(2, '0');
  const minute = String(parsed.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
};

const getCurrentDateTimeLocal = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
};

function MultiSelectDropdown({
  label,
  options,
  selectedIds,
  onChange,
  placeholder,
  testIdPrefix
}: {
  label: string;
  options: MultiSelectOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
  testIdPrefix: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((option) =>
      `${option.name} ${option.email || ''}`.toLowerCase().includes(normalized)
    );
  }, [options, query]);

  const selectedLabels = useMemo(() => (
    options
      .filter((option) => selectedSet.has(String(option.id)))
      .map((option) => option.name)
  ), [options, selectedSet]);

  const toggleOption = (id: string) => {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((value) => value !== id));
    } else {
      onChange([...selectedIds, id]);
    }
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <label className="block text-sm text-gray-600 mb-1">{label}</label>
      <button
        type="button"
        data-testid={`${testIdPrefix}-trigger`}
        aria-expanded={open}
        className="h-11 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-left focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="truncate">
          {selectedIds.length === 0 ? placeholder : `${selectedIds.length} selected`}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {selectedIds.length > 0 && (
        <p className="text-xs text-gray-500 mt-1 truncate">{selectedLabels.join(', ')}</p>
      )}

      {open && (
        <div className="absolute z-20 mt-2 w-full rounded-md border border-gray-200 bg-white shadow-lg">
          <div className="p-2 border-b border-gray-100">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search..."
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {filteredOptions.length === 0 && (
              <p className="px-2 py-2 text-xs text-gray-500">No matching options.</p>
            )}
            {filteredOptions.map((option) => {
              const id = String(option.id);
              const checked = selectedSet.has(id);
              return (
                <button
                  key={id}
                  type="button"
                  data-testid={`${testIdPrefix}-option-${id}`}
                  className={`w-full rounded px-2 py-2 text-left text-sm flex items-start gap-2 ${checked ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'}`}
                  onClick={() => toggleOption(id)}
                >
                  <input type="checkbox" readOnly checked={checked} className="mt-1" />
                  <span className="truncate">{option.name} ({option.email})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function PatientListPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [orthodontists, setOrthodontists] = useState<StaffMember[]>([]);
  const [assignableStaff, setAssignableStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [adminDeletedFilter, setAdminDeletedFilter] = useState<'active' | 'inactive'>('active');
  const [showFilters, setShowFilters] = useState(false);
  const [activeFilters, setActiveFilters] = useState<DirectoryFilters>({
    assignedOrthodontist: '',
    registrationDate: ''
  });
  const [draftFilters, setDraftFilters] = useState<DirectoryFilters>({
    assignedOrthodontist: '',
    registrationDate: ''
  });
  const [patientCounts, setPatientCounts] = useState({ active: 0, inactive: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmText: string;
    tone: 'info' | 'warning' | 'danger';
    requireAcknowledge: boolean;
    acknowledgeText: string;
    acknowledged: boolean;
    onConfirm: null | (() => Promise<void> | void);
    processing: boolean;
  }>({
    open: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    tone: 'info',
    requireAcknowledge: false,
    acknowledgeText: '',
    acknowledged: false,
    onConfirm: null,
    processing: false
  });

  const [createForm, setCreateForm] = useState(initialForm);
  const [editForm, setEditForm] = useState(initialForm);
  const [assignOrthodontistIds, setAssignOrthodontistIds] = useState<string[]>([]);
  const [assignSurgeonIds, setAssignSurgeonIds] = useState<string[]>([]);
  const [assignStudentIds, setAssignStudentIds] = useState<string[]>([]);

  const navigate = useNavigate();
  const { user } = useAuth();

  const canCreatePatients = user?.role === 'RECEPTION';
  const canManagePatientDirectory = user?.role === 'RECEPTION';
  const canDeletePatients = user?.role === 'ADMIN';
  const canOrthoAssignCareTeam = user?.role === 'ORTHODONTIST';
  const canAssignCareTeam = ['RECEPTION', 'ORTHODONTIST'].includes(user?.role || '');
  const canFilterByAssignedOrthodontist = ['ADMIN', 'RECEPTION', 'DENTAL_SURGEON', 'STUDENT', 'NURSE'].includes(user?.role || '');

  const loadPatients = async (
    search = '',
    deletedFilter = adminDeletedFilter,
    showLoader = true,
    filtersOverride?: DirectoryFilters
  ) => {
    if (showLoader) {
      setLoading(true);
      setError(null);
    }
    const filters = filtersOverride || activeFilters;
    try {
      const response = await apiService.patients.getList({
        page: 1,
        limit: 100,
        search: search || undefined,
        deleted: canDeletePatients ? deletedFilter : 'active',
        sort: 'id',
        order: 'DESC',
        assigned_orthodontist: canFilterByAssignedOrthodontist ? (filters.assignedOrthodontist || undefined) : undefined,
        registered_from: filters.registrationDate || undefined,
        registered_to: filters.registrationDate || undefined
      });
      const rows = response.data?.patients || response.data?.items || [];
      setPatients(rows);
    } catch (err: any) {
      if (showLoader) {
        setError(err?.message || 'Failed to load patients');
      }
      setPatients([]);
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  };

  const loadOrthodontists = async () => {
    if (!canFilterByAssignedOrthodontist) return;
    try {
      const response = await apiService.patients.getOrthodontists();
      const rows = response.data || [];
      setOrthodontists(rows);
    } catch {
      setOrthodontists([]);
    }
  };

  const loadAssignableStaff = async () => {
    if (!canAssignCareTeam) return;
    try {
      const response = await apiService.patients.getAssignableStaff(['DENTAL_SURGEON', 'STUDENT']);
      const rows = response.data || [];
      setAssignableStaff(rows);
    } catch {
      setAssignableStaff([]);
    }
  };

  const loadPatientCounts = async () => {
    try {
      const statsResponse = await apiService.patients.getStats();
      const activeCount = Number(statsResponse.data?.overview?.total_patients || 0);

      let inactiveCount = 0;
      if (canDeletePatients) {
        const inactiveResponse = await apiService.patients.getList({
          page: 1,
          limit: 1,
          deleted: 'inactive'
        });
        inactiveCount = Number(inactiveResponse.data?.pagination?.total_records || 0);
      }

      setPatientCounts({ active: activeCount, inactive: inactiveCount });
    } catch {
      setPatientCounts({ active: 0, inactive: 0 });
    }
  };

  useEffect(() => {
    loadPatients('', adminDeletedFilter);
    loadOrthodontists();
    loadAssignableStaff();
    loadPatientCounts();
  }, [user?.role]);

  useEffect(() => {
    const refreshPatients = () => {
      if (document.visibilityState !== 'visible') return;
      if (createOpen || editOpen || assignOpen) return;
      loadPatients(searchTerm, adminDeletedFilter, false);
    };

    window.addEventListener('focus', refreshPatients);
    document.addEventListener('visibilitychange', refreshPatients);

    return () => {
      window.removeEventListener('focus', refreshPatients);
      document.removeEventListener('visibilitychange', refreshPatients);
    };
  }, [searchTerm, adminDeletedFilter, createOpen, editOpen, assignOpen, activeFilters]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'patients_updated_at') {
        loadPatients(searchTerm, adminDeletedFilter, false);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [searchTerm, adminDeletedFilter, activeFilters]);

  const applyFilters = async () => {
    setActiveFilters(draftFilters);
    await loadPatients(searchTerm, adminDeletedFilter, true, draftFilters);
    setShowFilters(false);
  };

  const resetFilters = async () => {
    const emptyFilters = {
      assignedOrthodontist: '',
      registrationDate: ''
    };
    setDraftFilters(emptyFilters);
    setActiveFilters(emptyFilters);
    await loadPatients(searchTerm, adminDeletedFilter, true, emptyFilters);
    setShowFilters(false);
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (canFilterByAssignedOrthodontist && activeFilters.assignedOrthodontist) count += 1;
    if (activeFilters.registrationDate) count += 1;
    return count;
  }, [activeFilters, canFilterByAssignedOrthodontist]);

  const filteredPatients = patients;

  useEffect(() => {
    if (createOpen || editOpen || assignOpen) return;
    const handle = window.setTimeout(() => {
      loadPatients(searchTerm, adminDeletedFilter, false);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [searchTerm, adminDeletedFilter, activeFilters, createOpen, editOpen, assignOpen]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const createPayload = {
        first_name: createForm.first_name,
        last_name: createForm.last_name,
        registration_date: createForm.registration_date || undefined,
        date_of_birth: createForm.date_of_birth || undefined,
        age: createForm.age ? Number(createForm.age) : undefined,
        gender: createForm.gender,
        phone: createForm.phone || undefined,
        email: createForm.email || undefined,
        address: createForm.address || undefined,
        province: createForm.province || undefined
      };

      const created = await apiService.patients.create(createPayload);
      void created;

      setCreateForm(initialForm);
      setCreateOpen(false);
      await loadPatients(searchTerm);
      await loadPatientCounts();
    } catch (err: any) {
      setError(err?.message || 'Failed to create patient');
    } finally {
      setSaving(false);
    }
  };

  const openCreateModal = () => {
    setCreateForm({
      ...initialForm,
      registration_date: getCurrentDateTimeLocal()
    });
    setCreateOpen(true);
  };

  const openEditModal = async (patientId: number) => {
    setSaving(true);
    setError(null);
    try {
      const response = await apiService.patients.getById(String(patientId));
      const patient = response.data?.patient;
      if (!patient) throw new Error('Patient details not found');
      setSelectedPatientId(patientId);
      setEditForm({
        first_name: patient.first_name || '',
        last_name: patient.last_name || '',
        registration_date: toDateTimeLocalValue(patient.created_at),
        date_of_birth: patient.date_of_birth ? String(patient.date_of_birth).slice(0, 10) : '',
        age: patient.age ? String(patient.age) : '',
        gender: patient.gender || 'FEMALE',
        phone: patient.phone || '',
        email: patient.email || '',
        address: patient.address || '',
        province: patient.province || ''
      });
      setEditOpen(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to load patient details');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId) return;
    setSaving(true);
    setError(null);
    try {
      await apiService.patients.update(String(selectedPatientId), {
        first_name: editForm.first_name,
        last_name: editForm.last_name,
        registration_date: editForm.registration_date || undefined,
        date_of_birth: editForm.date_of_birth || undefined,
        age: editForm.age ? Number(editForm.age) : undefined,
        gender: editForm.gender,
        phone: editForm.phone || undefined,
        email: editForm.email || undefined,
        address: editForm.address || undefined,
        province: editForm.province || undefined
      });
      setEditOpen(false);
      setSelectedPatientId(null);
      await loadPatients(searchTerm);
      await loadPatientCounts();
    } catch (err: any) {
      setError(err?.message || 'Failed to update patient');
    } finally {
      setSaving(false);
    }
  };

  const openAssignModal = async (patientId: number) => {
    if (!canAssignCareTeam) return;
    setSelectedPatientId(patientId);
    setAssignOrthodontistIds([]);
    setAssignSurgeonIds([]);
    setAssignStudentIds([]);
    setAssignOpen(true);

    try {
      const response = await apiService.patients.getAssignments(String(patientId));
      const assignments = response.data || [];
      const orthodontistIds = assignments
        .filter((entry: any) => entry.assignment_role === 'ORTHODONTIST')
        .map((entry: any) => String(entry.user_id));
      const surgeonIds = assignments
        .filter((entry: any) => entry.assignment_role === 'DENTAL_SURGEON')
        .map((entry: any) => String(entry.user_id));
      const studentIds = assignments
        .filter((entry: any) => entry.assignment_role === 'STUDENT')
        .map((entry: any) => String(entry.user_id));

      if (canOrthoAssignCareTeam) {
        setAssignSurgeonIds(surgeonIds);
        setAssignStudentIds(studentIds);
      } else {
        setAssignOrthodontistIds(orthodontistIds);
        setAssignSurgeonIds(surgeonIds);
      }
    } catch {
      // keep modal open even if load fails
    }
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId) return;

    const assignments = canOrthoAssignCareTeam
      ? [
          ...assignSurgeonIds.map((id) => ({ user_id: Number(id), assignment_role: 'DENTAL_SURGEON' as const })),
          ...assignStudentIds.map((id) => ({ user_id: Number(id), assignment_role: 'STUDENT' as const }))
        ]
      : [
          ...assignOrthodontistIds.map((id) => ({ user_id: Number(id), assignment_role: 'ORTHODONTIST' as const })),
          ...assignSurgeonIds.map((id) => ({ user_id: Number(id), assignment_role: 'DENTAL_SURGEON' as const }))
        ];
    setSaving(true);
    setError(null);
    try {
      await apiService.patients.bulkAssign(String(selectedPatientId), assignments, true);
      setAssignOpen(false);
      setSelectedPatientId(null);
      setAssignOrthodontistIds([]);
      setAssignSurgeonIds([]);
      setAssignStudentIds([]);
      await loadPatients(searchTerm);
      await loadPatientCounts();
    } catch (err: any) {
      const rawMessage = String(err?.message || '');
      if (rawMessage.toLowerCase().includes('validation failed')) {
        setError('Assignment update validation failed. Please restart the backend server and try again.');
      } else {
        setError(rawMessage || 'Failed to update care team assignment');
      }
    } finally {
      setSaving(false);
    }
  };

  const assignableSurgeons = useMemo(
    () => assignableStaff.filter((s) => s.role === 'DENTAL_SURGEON'),
    [assignableStaff]
  );
  const assignableStudents = useMemo(
    () => assignableStaff.filter((s) => s.role === 'STUDENT'),
    [assignableStaff]
  );

  const openConfirmDialog = (config: {
    title: string;
    message: string;
    confirmText: string;
    tone?: 'info' | 'warning' | 'danger';
    requireAcknowledge?: boolean;
    acknowledgeText?: string;
    onConfirm: () => Promise<void> | void;
  }) => {
    setConfirmDialog({
      open: true,
      title: config.title,
      message: config.message,
      confirmText: config.confirmText,
      tone: config.tone || 'info',
      requireAcknowledge: Boolean(config.requireAcknowledge),
      acknowledgeText: config.acknowledgeText || '',
      acknowledged: !config.requireAcknowledge,
      onConfirm: config.onConfirm,
      processing: false
    });
  };

  const closeConfirmDialog = () => {
    if (confirmDialog.processing) return;
    setConfirmDialog((prev) => ({
      ...prev,
      open: false,
      onConfirm: null,
      acknowledged: false
    }));
  };

  const runConfirmDialog = async () => {
    if (!confirmDialog.onConfirm || confirmDialog.processing) return;
    setConfirmDialog((prev) => ({ ...prev, processing: true }));
    try {
      await confirmDialog.onConfirm();
      setConfirmDialog((prev) => ({ ...prev, open: false, onConfirm: null, acknowledged: false, processing: false }));
    } catch {
      setConfirmDialog((prev) => ({ ...prev, processing: false }));
    }
  };

  const handleDeletePatient = async (patientId: number, patientName: string, permanent = false) => {
    openConfirmDialog({
      title: permanent ? 'Permanently Delete Patient' : 'Delete Patient',
      message: permanent
        ? `You are permanently deleting "${patientName}". This action cannot be undone.`
        : `You are deleting "${patientName}". This will move the patient record to inactive state.`,
      confirmText: permanent ? 'Delete Permanently' : 'Delete Patient',
      tone: permanent ? 'danger' : 'warning',
      requireAcknowledge: true,
      acknowledgeText: permanent
        ? 'I understand this permanent deletion cannot be undone.'
        : 'I understand this will deactivate the patient record.',
      onConfirm: async () => {
        setSaving(true);
        setError(null);
        try {
          await apiService.patients.delete(String(patientId), permanent);
          localStorage.setItem('patients_updated_at', String(Date.now()));
          await loadPatients(searchTerm, adminDeletedFilter);
          await loadPatientCounts();
        } catch (err: any) {
          setError(err?.message || (permanent ? 'Failed to permanently delete patient' : 'Failed to delete patient'));
        } finally {
          setSaving(false);
        }
      }
    });
  };

  const handleReactivatePatient = async (patientId: number, patientName: string) => {
    openConfirmDialog({
      title: 'Reactivate Patient',
      message: `Reactivate patient "${patientName}" and restore active access?`,
      confirmText: 'Reactivate',
      tone: 'info',
      onConfirm: async () => {
        setSaving(true);
        setError(null);
        try {
          await apiService.patients.reactivate(String(patientId));
          localStorage.setItem('patients_updated_at', String(Date.now()));
          await loadPatients(searchTerm, adminDeletedFilter);
          await loadPatientCounts();
        } catch (err: any) {
          setError(err?.message || 'Failed to reactivate patient');
        } finally {
          setSaving(false);
        }
      }
    });
  };

  const statusVariant = (status: PatientRecord['status']) => {
    if (status === 'ACTIVE') return 'blue';
    if (status === 'INACTIVE') return 'neutral';
    if (status === 'COMPLETED') return 'success';
    return 'neutral';
  };

  const requestStatusVariant = (status?: PatientRecord['assignment_request_status'] | null) => {
    if (status === 'PENDING') return 'warning';
    if (status === 'APPROVED') return 'success';
    if (status === 'REJECTED') return 'error';
    return 'neutral';
  };

  const genderLabel = (gender: PatientRecord['gender']) => {
    if (gender === 'MALE') return 'M';
    if (gender === 'FEMALE') return 'F';
    return 'O';
  };

  const handleManualRefresh = async () => {
    const startedAt = Date.now();
    setRefreshing(true);
    try {
      await Promise.all([
        loadPatients(searchTerm, adminDeletedFilter, true),
        loadPatientCounts()
      ]);
    } finally {
      const elapsed = Date.now() - startedAt;
      const minVisibleMs = 650;
      if (elapsed < minVisibleMs) {
        await new Promise((resolve) => setTimeout(resolve, minVisibleMs - elapsed));
      }
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Patient Directory</h2>
          <p className="text-gray-500">Manage hospital patient records and cases.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="success">Active Patients: {patientCounts.active}</Badge>
            <Badge variant="neutral">
              Inactive Patients: {canDeletePatients ? patientCounts.inactive : 'Restricted'}
            </Badge>
          </div>
        </div>
        {canCreatePatients && (
          <Button className="flex items-center gap-2" onClick={openCreateModal}>
            <UserPlus className="w-4 h-4" />
            Add New Patient
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      <Card>
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-4 justify-between bg-gray-50/50">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search by name or MRN..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            {canDeletePatients && (
              <div className="inline-flex rounded-md border border-gray-200 overflow-hidden">
                <button
                  type="button"
                  className={`px-3 h-10 text-sm ${adminDeletedFilter === 'active' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700'}`}
                  onClick={() => {
                    setAdminDeletedFilter('active');
                    loadPatients(searchTerm, 'active');
                  }}
                >
                  Active
                </button>
                <button
                  type="button"
                  className={`px-3 h-10 text-sm border-l border-gray-200 ${adminDeletedFilter === 'inactive' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700'}`}
                  onClick={() => {
                    setAdminDeletedFilter('inactive');
                    loadPatients(searchTerm, 'inactive');
                  }}
                >
                  Inactive
                </button>
              </div>
            )}
            <Button
              variant="secondary"
              className="flex items-center gap-2"
              onClick={() => setShowFilters((prev) => !prev)}
            >
              <Filter className="w-4 h-4" />
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </Button>
            <Button
              variant="secondary"
              className={`flex items-center gap-2 transition-all ${refreshing ? 'ring-2 ring-blue-200 bg-blue-50 border-blue-200 text-blue-700' : ''}`}
              onClick={handleManualRefresh}
              disabled={refreshing}
              aria-busy={refreshing}
            >
              <RefreshCcw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
        </div>
        {showFilters && (
          <div className="px-4 pb-4 border-b border-gray-100 bg-gray-50/40">
            <div className={`grid grid-cols-1 ${canFilterByAssignedOrthodontist ? 'md:grid-cols-2' : 'md:grid-cols-1'} gap-3`}>
              {canFilterByAssignedOrthodontist && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Assigned Orthodontist</label>
                  <select
                    className="w-full h-10 rounded-md border border-gray-200 px-3 text-sm"
                    value={draftFilters.assignedOrthodontist}
                    onChange={(e) => setDraftFilters((prev) => ({ ...prev, assignedOrthodontist: e.target.value }))}
                  >
                    <option value="">All</option>
                    <option value="unassigned">Unassigned</option>
                    {orthodontists.map((o) => (
                      <option key={o.id} value={String(o.id)}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Registration Date</label>
                <Input
                  type="date"
                  value={draftFilters.registrationDate}
                  onChange={(e) => setDraftFilters((prev) => ({ ...prev, registrationDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <Button variant="secondary" onClick={resetFilters}>
                Reset
              </Button>
              <Button onClick={applyFilters}>
                Apply Filters
              </Button>
            </div>
          </div>
        )}

        <Table tableClassName="w-full min-w-max text-sm text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-8 py-4 font-semibold text-gray-600 align-middle whitespace-nowrap">Patient ID</th>
              <th className="px-8 py-4 font-semibold text-gray-600 align-middle whitespace-nowrap">Full Name</th>
              <th className="px-8 py-4 font-semibold text-gray-600 align-middle whitespace-nowrap">Age / Sex</th>
              <th className="px-8 py-4 font-semibold text-gray-600 align-middle whitespace-nowrap">Assigned Care Team</th>
              <th className="px-8 py-4 font-semibold text-gray-600 align-middle whitespace-nowrap">Status</th>
              {canManagePatientDirectory && (
                <th className="px-8 py-4 font-semibold text-gray-600 align-middle whitespace-nowrap">Request Status</th>
              )}
              <th className="px-8 py-4 font-semibold text-gray-600 align-middle text-center whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {!loading && filteredPatients.map((p) => (
              <tr
                key={p.id}
                className="hover:bg-blue-50/30 transition-colors cursor-pointer"
                onClick={() => {
                  if (p.is_inactive) return;
                  navigate(`/patients/${p.id}`);
                }}
              >
                <td className="px-8 py-4 font-mono text-xs font-bold text-blue-600 align-middle whitespace-nowrap">#{p.patient_code}</td>
                <td className="px-8 py-4 font-medium text-gray-900 align-middle whitespace-nowrap">{p.first_name} {p.last_name}</td>
                <td className="px-8 py-4 text-black align-middle whitespace-nowrap">{p.age ?? '-'}y / {genderLabel(p.gender)}</td>
                <td className="px-8 py-4 text-gray-600 align-middle whitespace-nowrap">
                  <div className="space-y-0.5">
                    <div>
                      <span className="text-blue-700 font-semibold">Ortho:</span>{' '}
                      <span className={p.assigned_orthodontist_name ? 'text-blue-700 font-medium' : 'text-red-600 font-semibold'}>
                        {p.assigned_orthodontist_name || 'Unassigned'}
                      </span>
                    </div>
                    <div>
                      <span className="text-emerald-700 font-semibold">Surgeon:</span>{' '}
                      <span className={p.assigned_surgeon_name ? 'text-emerald-700 font-medium' : 'text-red-600 font-semibold'}>
                        {p.assigned_surgeon_name || 'Unassigned'}
                      </span>
                    </div>
                    <div>
                      <span className="text-violet-700 font-semibold">Student:</span>{' '}
                      <span className={p.assigned_student_name ? 'text-violet-700 font-medium' : 'text-red-600 font-semibold'}>
                        {p.assigned_student_name || 'Unassigned'}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="px-8 py-4 align-middle whitespace-nowrap">
                  <Badge variant={statusVariant((p.display_status || p.status) as PatientRecord['status'])}>
                    {p.display_status || p.status}
                  </Badge>
                </td>
                {canManagePatientDirectory && (
                  <td className="px-8 py-4 align-middle whitespace-nowrap">
                    <Badge variant={requestStatusVariant(p.assignment_request_status) as any}>
                      {p.assignment_request_status || 'NONE'}
                    </Badge>
                  </td>
                )}
                <td className="px-8 py-4 align-middle text-center whitespace-nowrap">
                  {canManagePatientDirectory && (
                    <div className="flex justify-center items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditModal(p.id);
                        }}
                      >
                        <Pencil className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                      {canAssignCareTeam && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            openAssignModal(p.id);
                          }}
                        >
                          Assign Team
                        </Button>
                      )}
                    </div>
                  )}
                  {canOrthoAssignCareTeam && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        openAssignModal(p.id);
                      }}
                    >
                      Assign Team
                    </Button>
                  )}
                  {canDeletePatients && (
                    <div className="flex justify-end gap-2">
                      {adminDeletedFilter === 'inactive' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="bg-green-600 text-white border border-green-600 hover:bg-green-700 active:bg-green-800"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReactivatePatient(p.id, `${p.first_name} ${p.last_name}`);
                          }}
                          disabled={saving}
                        >
                          <RefreshCcw className="w-3 h-3 mr-1" />
                          Reactivate
                        </Button>
                      )}
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePatient(p.id, `${p.first_name} ${p.last_name}`, adminDeletedFilter === 'inactive');
                        }}
                        disabled={saving}
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        {adminDeletedFilter === 'inactive' ? 'Delete Permanently' : 'Delete'}
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>

        {loading && (
          <div className="p-12 text-center text-gray-500">
            Loading patients...
          </div>
        )}

        {!loading && filteredPatients.length === 0 && (
          <div className="p-12 text-center text-gray-500">
            No patients found matching "{searchTerm}"
          </div>
        )}
      </Card>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Add New Patient</h3>
            <form className="space-y-4" onSubmit={handleCreate}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  placeholder="First name"
                  value={createForm.first_name}
                  onChange={(e) => setCreateForm((s) => ({ ...s, first_name: e.target.value }))}
                  required
                />
                <Input
                  placeholder="Last name"
                  value={createForm.last_name}
                  onChange={(e) => setCreateForm((s) => ({ ...s, last_name: e.target.value }))}
                  required
                />
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-600">Registration Date &amp; Time</label>
                  <Input
                    type="datetime-local"
                    value={createForm.registration_date}
                    onChange={(e) => setCreateForm((s) => ({ ...s, registration_date: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-600">Birth Date</label>
                  <Input
                    type="date"
                    value={createForm.date_of_birth}
                    onChange={(e) =>
                      setCreateForm((s) => {
                        const date_of_birth = e.target.value;
                        return {
                          ...s,
                          date_of_birth,
                          age: calculateAgeFromDob(date_of_birth)
                        };
                      })
                    }
                    required
                  />
                </div>
                <Input
                  type="number"
                  min={0}
                  max={130}
                  placeholder="Age"
                  value={createForm.age}
                  readOnly
                />
                <select
                  className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={createForm.gender}
                  onChange={(e) => setCreateForm((s) => ({ ...s, gender: e.target.value }))}
                >
                  <option value="FEMALE">Female</option>
                  <option value="MALE">Male</option>
                  <option value="OTHER">Other</option>
                </select>
                <Input
                  placeholder="Phone"
                  value={createForm.phone}
                  onChange={(e) => setCreateForm((s) => ({ ...s, phone: e.target.value }))}
                />
                <Input
                  type="email"
                  placeholder="Email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm((s) => ({ ...s, email: e.target.value }))}
                />
              </div>
              <Input
                placeholder="Address"
                value={createForm.address}
                onChange={(e) => setCreateForm((s) => ({ ...s, address: e.target.value }))}
              />
              <Input
                placeholder="Province"
                value={createForm.province}
                onChange={(e) => setCreateForm((s) => ({ ...s, province: e.target.value }))}
              />

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Create Patient'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Edit Patient (General Details)</h3>
            <form className="space-y-4" onSubmit={handleEdit}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  placeholder="First name"
                  value={editForm.first_name}
                  onChange={(e) => setEditForm((s) => ({ ...s, first_name: e.target.value }))}
                  required
                />
                <Input
                  placeholder="Last name"
                  value={editForm.last_name}
                  onChange={(e) => setEditForm((s) => ({ ...s, last_name: e.target.value }))}
                  required
                />
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-600">Registration Date &amp; Time</label>
                  <Input
                    type="datetime-local"
                    value={editForm.registration_date}
                    onChange={(e) => setEditForm((s) => ({ ...s, registration_date: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-600">Birth Date</label>
                  <Input
                    type="date"
                    value={editForm.date_of_birth}
                    onChange={(e) =>
                      setEditForm((s) => {
                        const date_of_birth = e.target.value;
                        return {
                          ...s,
                          date_of_birth,
                          age: calculateAgeFromDob(date_of_birth)
                        };
                      })
                    }
                  />
                </div>
                <Input
                  type="number"
                  min={0}
                  max={130}
                  placeholder="Age"
                  value={editForm.age}
                  readOnly
                />
                <select
                  className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={editForm.gender}
                  onChange={(e) => setEditForm((s) => ({ ...s, gender: e.target.value }))}
                >
                  <option value="FEMALE">Female</option>
                  <option value="MALE">Male</option>
                  <option value="OTHER">Other</option>
                </select>
                <Input
                  placeholder="Phone"
                  value={editForm.phone}
                  onChange={(e) => setEditForm((s) => ({ ...s, phone: e.target.value }))}
                />
                <Input
                  type="email"
                  placeholder="Email"
                  value={editForm.email}
                  onChange={(e) => setEditForm((s) => ({ ...s, email: e.target.value }))}
                />
                <Input
                  placeholder="Province"
                  value={editForm.province}
                  onChange={(e) => setEditForm((s) => ({ ...s, province: e.target.value }))}
                />
              </div>
              <Input
                placeholder="Address"
                value={editForm.address}
                onChange={(e) => setEditForm((s) => ({ ...s, address: e.target.value }))}
              />

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setEditOpen(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Update Patient'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {assignOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              {canOrthoAssignCareTeam ? 'Assign Care Team' : 'Assign Care Team'}
            </h3>
            <form className="space-y-4" onSubmit={handleAssign}>
              {canOrthoAssignCareTeam && (
                <>
                  <MultiSelectDropdown
                    label="Assign Dental Surgeons"
                    options={assignableSurgeons}
                    selectedIds={assignSurgeonIds}
                    onChange={setAssignSurgeonIds}
                    placeholder="Select dental surgeons"
                    testIdPrefix="assign-surgeons"
                  />
                  <MultiSelectDropdown
                    label="Assign Students"
                    options={assignableStudents}
                    selectedIds={assignStudentIds}
                    onChange={setAssignStudentIds}
                    placeholder="Select students"
                    testIdPrefix="assign-students"
                  />
                </>
              )}
              {!canOrthoAssignCareTeam && (
                <>
                  <MultiSelectDropdown
                    label="Assign Orthodontists"
                    options={orthodontists}
                    selectedIds={assignOrthodontistIds}
                    onChange={setAssignOrthodontistIds}
                    placeholder="Select orthodontists"
                    testIdPrefix="assign-orthodontists"
                  />
                  <MultiSelectDropdown
                    label="Assign Dental Surgeons"
                    options={assignableSurgeons}
                    selectedIds={assignSurgeonIds}
                    onChange={setAssignSurgeonIds}
                    placeholder="Select dental surgeons"
                    testIdPrefix="assign-surgeons"
                  />
                </>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setAssignOpen(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Update Assignments'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDialog.open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/45 backdrop-blur-[1px] p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            <div
              className={`px-5 py-4 border-b ${
                confirmDialog.tone === 'danger'
                  ? 'bg-red-50 border-red-100'
                  : confirmDialog.tone === 'warning'
                    ? 'bg-amber-50 border-amber-100'
                    : 'bg-blue-50 border-blue-100'
              }`}
            >
              <h3 className="text-lg font-extrabold text-slate-900">{confirmDialog.title}</h3>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div
                className={`rounded-lg border px-3 py-2 text-sm ${
                  confirmDialog.tone === 'danger'
                    ? 'border-red-200 bg-red-50 text-red-800'
                    : confirmDialog.tone === 'warning'
                      ? 'border-amber-200 bg-amber-50 text-amber-800'
                      : 'border-blue-200 bg-blue-50 text-blue-800'
                }`}
              >
                {confirmDialog.message}
              </div>
              {confirmDialog.requireAcknowledge && (
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={confirmDialog.acknowledged}
                    onChange={(e) =>
                      setConfirmDialog((prev) => ({ ...prev, acknowledged: e.target.checked }))
                    }
                    disabled={confirmDialog.processing}
                  />
                  <span>{confirmDialog.acknowledgeText}</span>
                </label>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  variant="secondary"
                  onClick={closeConfirmDialog}
                  disabled={confirmDialog.processing}
                >
                  Cancel
                </Button>
                <Button
                  className={
                    confirmDialog.tone === 'danger'
                      ? 'bg-red-600 border-red-600 hover:bg-red-700 active:bg-red-800'
                      : confirmDialog.tone === 'warning'
                        ? 'bg-amber-600 border-amber-600 hover:bg-amber-700 active:bg-amber-800'
                        : ''
                  }
                  onClick={runConfirmDialog}
                  disabled={confirmDialog.processing || (confirmDialog.requireAcknowledge && !confirmDialog.acknowledged)}
                >
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
