import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Card, Badge, Button, Table, Input, RefreshButton } from '../components/UI';
import { ArrowLeft, User, Calendar, FileText, Grid, Upload, Plus, Trash2, RotateCcw, Receipt, Pencil, X, Package } from 'lucide-react';
import { DentalChart } from '../components/DentalChart';
import { DocumentPortal } from '../components/DocumentPortal';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { toast } from 'sonner';

type TabId = 'overview' | 'visits' | 'history' | 'chart' | 'documents' | 'diagnosis' | 'notes' | 'materials' | 'payments';

const canEditMedical = (role?: string) => ['ORTHODONTIST', 'DENTAL_SURGEON', 'STUDENT'].includes(role || '');
const canCreateNotes = (role?: string) => ['ORTHODONTIST', 'DENTAL_SURGEON', 'STUDENT'].includes(role || '');
const canDeleteNotes = (role?: string) => role === 'ORTHODONTIST';
const canUploadDocuments = (role?: string) => ['ORTHODONTIST', 'DENTAL_SURGEON', 'STUDENT'].includes(role || '');
const canDeleteDocuments = (role?: string) => role === 'ORTHODONTIST';
const canManageAppointments = (role?: string) => ['RECEPTION'].includes(role || '');
const canReadDentalChart = (role?: string) => ['ORTHODONTIST', 'DENTAL_SURGEON', 'STUDENT', 'ADMIN'].includes(role || '');
const canReadDocuments = (role?: string) => ['ORTHODONTIST', 'DENTAL_SURGEON', 'STUDENT', 'ADMIN'].includes(role || '');
const canReadDiagnosis = (role?: string) => ['ORTHODONTIST', 'DENTAL_SURGEON', 'STUDENT', 'ADMIN'].includes(role || '');
const canReadTreatmentNotes = (role?: string) => ['ORTHODONTIST', 'DENTAL_SURGEON', 'STUDENT', 'ADMIN', 'RECEPTION'].includes(role || '');
const canReadPatientHistory = (role?: string) => ['ORTHODONTIST', 'DENTAL_SURGEON', 'STUDENT', 'ADMIN'].includes(role || '');
const canReadPaymentRecords = (role?: string) => ['ADMIN', 'RECEPTION', 'ORTHODONTIST', 'DENTAL_SURGEON'].includes(role || '');
const canManagePaymentRecords = (role?: string) => role === 'RECEPTION';
const canDeletePaymentRecords = (role?: string) => role === 'ADMIN';
const canReadPatientMaterials = (role?: string) => ['ADMIN', 'NURSE', 'ORTHODONTIST', 'DENTAL_SURGEON', 'STUDENT'].includes(role || '');
const canManagePatientMaterials = (role?: string) => ['ORTHODONTIST', 'DENTAL_SURGEON', 'STUDENT'].includes(role || '');
const canDeletePatientMaterials = (role?: string) => role === 'ADMIN';

type TabConfig = {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  canView: (role?: string) => boolean;
};

export function PatientProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [patient, setPatient] = useState<any>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [visits, setVisits] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [historyAuto, setHistoryAuto] = useState<any>(null);
  const [historyData, setHistoryData] = useState<Record<string, any>>({});
  const [historyMeta, setHistoryMeta] = useState<any>(null);

  const patientId = String(id || '');

  const loadPatient = async () => {
    if (!patientId) return;
    setLoading(true);
    setError(null);
    try {
      const patientResponse = await apiService.patients.getById(patientId);
      const [visitResponse, noteResponse, historyResponse] = await Promise.allSettled([
        apiService.visits.getPatientVisits(patientId, { page: 1, limit: 100 }),
        apiService.clinicalNotes.getPatientNotes(patientId, { page: 1, limit: 100 }),
        apiService.patients.getHistory(patientId),
      ]);

      const payload = patientResponse.data || {};
      setPatient(payload.patient || null);
      setAssignments(payload.assignments || []);
      setVisits(visitResponse.status === 'fulfilled' ? (visitResponse.value.data?.visits || visitResponse.value.data?.items || []) : []);
      setNotes(noteResponse.status === 'fulfilled' ? (noteResponse.value.data?.notes || noteResponse.value.data?.items || []) : []);
      if (historyResponse.status === 'fulfilled') {
        setHistoryAuto(historyResponse.value.data?.auto || null);
        setHistoryData(historyResponse.value.data?.history || {});
        setHistoryMeta(historyResponse.value.data?.metadata || null);
      } else {
        setHistoryAuto(null);
        setHistoryData({});
        setHistoryMeta(null);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load patient profile');
      setPatient(null);
      setAssignments([]);
      setVisits([]);
      setNotes([]);
      setHistoryAuto(null);
      setHistoryData({});
      setHistoryMeta(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPatient();
  }, [patientId]);

  const tabs = useMemo<TabConfig[]>(() => ([
    { id: 'overview', label: 'Overview', icon: User, canView: () => true },
    { id: 'visits', label: 'Visits', icon: Calendar, canView: () => true },
    { id: 'history', label: 'Patient History', icon: FileText, canView: canReadPatientHistory },
    { id: 'chart', label: 'Dental Chart', icon: Grid, canView: canReadDentalChart },
    { id: 'documents', label: 'Documents', icon: Upload, canView: canReadDocuments },
    { id: 'diagnosis', label: 'Diagnosis', icon: FileText, canView: canReadDiagnosis },
    { id: 'notes', label: 'Treatment Plans & Notes', icon: FileText, canView: canReadTreatmentNotes },
    { id: 'materials', label: 'Materials Used', icon: Package, canView: canReadPatientMaterials },
    { id: 'payments', label: 'Payment Records', icon: Receipt, canView: canReadPaymentRecords },
  ]), []);

  const visibleTabs = useMemo(
    () => tabs.filter((tab) => tab.canView(user?.role)),
    [tabs, user?.role]
  );

  const attendingOrthodontist = useMemo(() => {
    const names = assignments
      .filter((a) => a.assignment_role === 'ORTHODONTIST')
      .map((a) => a.user_name)
      .filter(Boolean);
    return names.length ? names.join(', ') : 'Unassigned';
  }, [assignments]);
  const assignedStudent = useMemo(() => {
    const names = assignments
      .filter((a) => a.assignment_role === 'STUDENT')
      .map((a) => a.user_name)
      .filter(Boolean);
    return names.length ? names.join(', ') : 'Unassigned';
  }, [assignments]);
  const assignedSurgeon = useMemo(() => {
    const names = assignments
      .filter((a) => a.assignment_role === 'DENTAL_SURGEON')
      .map((a) => a.user_name)
      .filter(Boolean);
    return names.length ? names.join(', ') : 'Unassigned';
  }, [assignments]);

  useEffect(() => {
    if (visibleTabs.some((tab) => tab.id === activeTab)) return;
    if (visibleTabs.length > 0) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [activeTab, visibleTabs]);

  if (loading) {
    return <div className="p-6 text-gray-500">Loading patient profile...</div>;
  }

  if (error || !patient) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/patients')} className="w-fit">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Patients
        </Button>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 text-sm">
          {error || 'Patient not found'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/patients')} className="p-2">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-gray-900">{patient.first_name} {patient.last_name}</h2>
            <Badge variant="blue">MRN: {patient.patient_code}</Badge>
            <Badge variant={patient.status === 'ACTIVE' ? 'success' : 'neutral'}>{patient.status}</Badge>
          </div>
          <p className="text-gray-500 text-sm">Born {String(patient.date_of_birth).slice(0, 10)} ({patient.age ?? '-'}y) • {patient.gender}</p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-gray-200 overflow-x-auto">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabId)}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all relative whitespace-nowrap ${
              activeTab === tab.id ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full" />}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {activeTab === 'overview' && (
          <OverviewTab
            patientId={patientId}
            role={user?.role}
            patient={patient}
            attendingOrthodontist={attendingOrthodontist}
            assignedSurgeon={assignedSurgeon}
            assignedStudent={assignedStudent}
            visits={visits}
            onChanged={loadPatient}
          />
        )}
        {activeTab === 'visits' && <VisitsTab visits={visits} role={user?.role} onChanged={loadPatient} />}
        {activeTab === 'history' && (
          canReadPatientHistory(user?.role)
            ? (
              <HistoryTab
                patientId={patientId}
                role={user?.role}
                auto={historyAuto}
                history={historyData}
                metadata={historyMeta}
                onSaved={loadPatient}
              />
            )
            : <AccessDeniedSection />
        )}
        {activeTab === 'chart' && (
          canReadDentalChart(user?.role)
            ? <DentalChart patientId={patientId} canEdit={canEditMedical(user?.role)} role={user?.role} />
            : <AccessDeniedSection />
        )}
        {activeTab === 'documents' && (
          canReadDocuments(user?.role)
            ? (
              <DocumentPortal
                patientId={patientId}
                canUpload={canUploadDocuments(user?.role)}
                canDelete={canDeleteDocuments(user?.role)}
              />
            )
            : <AccessDeniedSection />
        )}
        {activeTab === 'notes' && (
          canReadTreatmentNotes(user?.role)
            ? (
              <TreatmentPlanNotesTab
                notes={notes}
                patientId={patientId}
                role={user?.role}
                canCreate={canCreateNotes(user?.role)}
                canDelete={canDeleteNotes(user?.role)}
                onCreated={loadPatient}
              />
            )
            : <AccessDeniedSection />
        )}
        {activeTab === 'diagnosis' && (
          canReadDiagnosis(user?.role)
            ? (
              <DiagnosisTab
                notes={notes}
                patientId={patientId}
                canCreate={canCreateNotes(user?.role)}
                canDelete={canDeleteNotes(user?.role)}
                onCreated={loadPatient}
              />
            )
            : <AccessDeniedSection />
        )}
        {activeTab === 'payments' && (
          canReadPaymentRecords(user?.role)
            ? <PaymentRecordsTab patientId={patientId} role={user?.role} />
            : <AccessDeniedSection />
        )}
        {activeTab === 'materials' && (
          canReadPatientMaterials(user?.role)
            ? <PatientMaterialUsageTab patientId={patientId} role={user?.role} />
            : <AccessDeniedSection />
        )}
      </div>
    </div>
  );
}

function AccessDeniedSection() {
  return (
    <Card className="p-6">
      <p className="text-sm text-red-600 font-medium">You do not have access to this section.</p>
    </Card>
  );
}

function OverviewTab({ patientId, role, patient, attendingOrthodontist, assignedSurgeon, assignedStudent, visits, onChanged }: any) {
  const [appointmentDate, setAppointmentDate] = useState('');
  const [procedureType, setProcedureType] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const [sendingReminderId, setSendingReminderId] = useState<number | null>(null);
  const [reminderStatus, setReminderStatus] = useState<Record<number, 'sent' | 'already' | 'simulated'>>({});
  const appointmentDateRef = useRef<HTMLInputElement | null>(null);

  const canManage = canManageAppointments(role);
  const upcoming = (visits || []).filter((v: any) => v.status === 'SCHEDULED').slice(0, 5);

  const scheduleAppointment = async () => {
    if (!appointmentDate) {
      toast.error('Please choose an appointment date and time');
      return;
    }
    setScheduling(true);
    try {
      await apiService.visits.create(String(patientId), {
        visit_date: appointmentDate,
        procedure_type: procedureType || 'Follow-up',
        status: 'SCHEDULED'
      });
      toast.success('Appointment scheduled');
      setAppointmentDate('');
      setProcedureType('');
      await onChanged();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to schedule appointment');
    } finally {
      setScheduling(false);
    }
  };

  const sendReminder = async (visitId: number) => {
    setSendingReminderId(visitId);
    try {
      const response = await apiService.visits.sendReminder(String(visitId));
      const delivery = response?.data?.delivery;
      setReminderStatus((prev) => ({
        ...prev,
        [visitId]:
          delivery === 'already_sent'
            ? 'already'
            : delivery === 'simulated'
              ? 'simulated'
              : 'sent'
      }));
      if (delivery === 'already_sent') {
        toast.info('Reminder was already sent earlier');
      } else if (delivery === 'simulated') {
        toast.warning('Reminder simulated (not sent by SMTP)');
      } else {
        toast.success('Reminder Sent Successfully');
      }
    } catch (error: any) {
      toast.error(error?.message || 'Failed to send reminder');
    } finally {
      setSendingReminderId(null);
    }
  };

  const openDateTimePicker = (input: HTMLInputElement | null) => {
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }
    input.focus();
    input.click();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-2 p-6 space-y-8">
        <div>
          <h4 className="font-bold text-gray-900 mb-4">Patient Information</h4>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase">Contact Email</p>
              <p className="text-sm font-medium mt-1">{patient.email || '-'}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase">Contact Phone</p>
              <p className="text-sm font-medium mt-1">{patient.phone || '-'}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase">Attending Orthodontist</p>
              <p className="text-sm font-medium mt-1">{attendingOrthodontist}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase">Assigned Dental Surgeon</p>
              <p className="text-sm font-medium mt-1">{assignedSurgeon}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase">Assigned Student</p>
              <p className="text-sm font-medium mt-1">{assignedStudent}</p>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h4 className="font-bold text-gray-900 mb-4">Upcoming Appointments</h4>
        {canManage && (
          <div className="space-y-2 mb-4">
            <div className="flex items-center gap-3 rounded-md border border-gray-200 bg-white px-3 py-2">
              <input
                ref={appointmentDateRef}
                type="datetime-local"
                value={appointmentDate}
                onChange={(e) => setAppointmentDate(e.target.value)}
                className="sr-only"
              />
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="h-10 w-10 border-gray-200"
                onClick={() => openDateTimePicker(appointmentDateRef.current)}
                title={appointmentDate || 'Select appointment date and time'}
              >
                <Calendar className="w-4 h-4" />
              </Button>
              <span className="text-sm text-gray-600">
                {appointmentDate ? formatDateTime(appointmentDate) : 'Select appointment date and time'}
              </span>
            </div>
            <Input
              placeholder="Appointment type (optional)"
              value={procedureType}
              onChange={(e) => setProcedureType(e.target.value)}
            />
            <Button onClick={scheduleAppointment} disabled={scheduling || !appointmentDate} className="w-full">
              {scheduling ? 'Scheduling...' : 'Schedule Appointment'}
            </Button>
          </div>
        )}
        <div className="space-y-3">
          {upcoming.length === 0 && <p className="text-sm text-gray-500">No upcoming visits.</p>}
          {upcoming.map((visit: any) => (
            <div key={visit.id} className="p-3 border border-gray-100 rounded-lg">
              <p className="text-sm font-semibold text-gray-900">{visit.procedure_type || 'Visit'}</p>
              <p className="text-xs text-gray-500 mt-1">{String(visit.visit_date).slice(0, 16).replace('T', ' ')}</p>
              {canManage && (
                <div className="mt-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="bg-green-600 text-white hover:bg-green-700 active:bg-green-800 border border-green-600"
                    onClick={() => sendReminder(visit.id)}
                    disabled={sendingReminderId === visit.id}
                  >
                    {sendingReminderId === visit.id ? 'Sending...' : 'Send Reminder'}
                  </Button>
                  {reminderStatus[visit.id] === 'sent' && (
                    <p className="text-xs text-green-700 mt-1 font-semibold">Reminder Sent Successfully</p>
                  )}
                  {reminderStatus[visit.id] === 'already' && (
                    <p className="text-xs text-amber-700 mt-1 font-semibold">Reminder was already sent earlier</p>
                  )}
                  {reminderStatus[visit.id] === 'simulated' && (
                    <p className="text-xs text-amber-700 mt-1 font-semibold">Reminder simulated (SMTP not used)</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function VisitsTab({
  visits,
  role,
  onChanged
}: {
  visits: any[];
  role?: string;
  onChanged: () => Promise<void>;
}) {
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const canManage = canManageAppointments(role);
  const formatStatusLabel = (status: string) => String(status || '').replace(/_/g, ' ');

  const statusVariant = (status: string) => {
    if (status === 'COMPLETED') return 'success';
    if (status === 'DID_NOT_ATTEND') return 'error';
    if (status === 'SCHEDULED') return 'blue';
    return 'neutral';
  };

  const markVisit = async (visitId: number, status: 'COMPLETED' | 'DID_NOT_ATTEND') => {
    setUpdatingId(visitId);
    try {
      await apiService.visits.update(String(visitId), { status });
      toast.success(status === 'COMPLETED' ? 'Marked as attended' : 'Marked as did not attend');
      await onChanged();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update visit');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <Card>
      <Table>
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100 text-left">
            <th className="px-6 py-4 font-semibold text-gray-600">Date</th>
            <th className="px-6 py-4 font-semibold text-gray-600">Type</th>
            <th className="px-6 py-4 font-semibold text-gray-600">Provider</th>
            <th className="px-6 py-4 font-semibold text-gray-600">Notes</th>
            <th className="px-6 py-4 font-semibold text-gray-600">Status</th>
            {canManage && <th className="px-6 py-4 font-semibold text-gray-600">Reception Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {visits.length === 0 && (
            <tr>
              <td className="px-6 py-6 text-sm text-gray-500" colSpan={canManage ? 6 : 5}>No visits found for this patient.</td>
            </tr>
          )}
          {visits.map((v) => (
            <tr key={v.id} className="hover:bg-gray-50/50">
              <td className="px-6 py-4 font-medium">{String(v.visit_date).slice(0, 16).replace('T', ' ')}</td>
              <td className="px-6 py-4"><Badge variant="blue">{v.procedure_type || 'Visit'}</Badge></td>
              <td className="px-6 py-4 text-gray-600">{v.provider_name || '-'}</td>
              <td className="px-6 py-4 text-gray-500 max-w-xs truncate">{v.notes || '-'}</td>
              <td className="px-6 py-4">
                <Badge variant={statusVariant(v.status)} className="whitespace-nowrap">
                  {formatStatusLabel(v.status)}
                </Badge>
              </td>
              {canManage && (
                <td className="px-6 py-4">
                  {v.status === 'SCHEDULED' ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => markVisit(v.id, 'COMPLETED')}
                        disabled={updatingId === v.id}
                      >
                        Attended
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => markVisit(v.id, 'DID_NOT_ATTEND')}
                        disabled={updatingId === v.id}
                      >
                        Did Not Attend
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">Finalized</span>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

function HistoryTab({
  patientId,
  role,
  auto,
  history,
  metadata,
  onSaved
}: {
  patientId: string;
  role?: string;
  auto: any;
  history: Record<string, any>;
  metadata: any;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const canEdit = canEditMedical(role);

  useEffect(() => {
    setForm(history || {});
  }, [history]);

  const setValue = (key: string, value: any) => setForm((prev) => ({ ...prev, [key]: value }));

  const saveHistory = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      await apiService.patients.updateHistory(patientId, form);
      toast.success('Patient history saved');
      await onSaved();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save patient history');
    } finally {
      setSaving(false);
    }
  };

  const investigationOptions = ['Periapical', 'Upper Standard Occlusal', 'OPG', 'Cephalometric', 'CBCT'];
  const selectedInvestigations: string[] = Array.isArray(form.special_investigations) ? form.special_investigations : [];
  const selectedReferrals: string[] = Array.isArray(form.referral_targets) ? form.referral_targets : [];
  const selectedTakeUpModes: string[] = Array.isArray(form.consultant_take_up_treatment_modes)
    ? form.consultant_take_up_treatment_modes
    : [];
  const canEditConsultantOnly = role === 'ORTHODONTIST';

  const toggleArrayValue = (key: string, value: string) => {
    const current = Array.isArray(form[key]) ? form[key] : [];
    if (current.includes(value)) {
      setValue(key, current.filter((v: string) => v !== value));
    } else {
      setValue(key, [...current, value]);
    }
  };

  const labelize = (value: string) =>
    value
      .split('_')
      .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
      .join(' ');

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Orthodontics Case History</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div><span className="font-semibold text-gray-600">Name:</span> {auto?.name || '-'}</div>
          <div><span className="font-semibold text-gray-600">Age:</span> {auto?.age ?? '-'}</div>
          <div><span className="font-semibold text-gray-600">Birthday:</span> {auto?.birthday || '-'}</div>
          <div><span className="font-semibold text-gray-600">Address:</span> {auto?.address || '-'}</div>
          <div><span className="font-semibold text-gray-600">Sex:</span> {auto?.sex || '-'}</div>
          <div><span className="font-semibold text-gray-600">Telephone No:</span> {auto?.telephone || '-'}</div>
          <div><span className="font-semibold text-gray-600">Province:</span> {auto?.province || '-'}</div>
          <div><span className="font-semibold text-gray-600">Date of Examination:</span> {auto?.date_of_examination || '-'}</div>
          {metadata?.updated_at && (
            <div><span className="font-semibold text-gray-600">Last Updated:</span> {String(metadata.updated_at).slice(0, 16).replace('T', ' ')}</div>
          )}
        </div>
      </Card>

      <Card className="p-6 space-y-5">
        <h4 className="font-bold text-gray-900">Past History</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Past Dental History</label>
            <Input value={form.past_dental_history || ''} onChange={(e) => setValue('past_dental_history', e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Fractures</label>
            <Input value={form.fractures || ''} onChange={(e) => setValue('fractures', e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Orthodontics Treatments</label>
            <Input value={form.orthodontics_treatments || ''} onChange={(e) => setValue('orthodontics_treatments', e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Others</label>
            <Input value={form.other_history || ''} onChange={(e) => setValue('other_history', e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Past Medical History</label>
            <Input value={form.past_medical_history || ''} onChange={(e) => setValue('past_medical_history', e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Family History</label>
            <Input value={form.family_history || ''} onChange={(e) => setValue('family_history', e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Social History</label>
            <Input value={form.social_history || ''} onChange={(e) => setValue('social_history', e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Allergies</label>
            <Input value={form.allergies || ''} onChange={(e) => setValue('allergies', e.target.value)} disabled={!canEdit} />
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-5">
        <h4 className="font-bold text-gray-900">Clinical Examination</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Periodontal Health</label>
            <select
              className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
              value={form.periodontal_health || ''}
              onChange={(e) => setValue('periodontal_health', e.target.value)}
              disabled={!canEdit}
            >
              <option value="">Select</option>
              <option value="SATISFACTORY">Satisfactory</option>
              <option value="PLAQUE">Plaque</option>
              <option value="CALCULUS">Calculus</option>
              <option value="PERIODONTAL_DISEASE">Periodontal Disease</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Teeth Present</label>
            <Input value={form.teeth_present || ''} onChange={(e) => setValue('teeth_present', e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Caries</label>
            <Input value={form.caries || ''} onChange={(e) => setValue('caries', e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Habits</label>
            <Input value={form.habits || ''} onChange={(e) => setValue('habits', e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Facial Profile</label>
            <select className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm" value={form.facial_profile || ''} onChange={(e) => setValue('facial_profile', e.target.value)} disabled={!canEdit}>
              <option value="">Select</option>
              <option value="STRAIGHT">Straight</option>
              <option value="CONVEX">Convex</option>
              <option value="CONCAVE">Concave</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Facial Asymmetry</label>
            <select className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm" value={form.facial_asymmetry || ''} onChange={(e) => setValue('facial_asymmetry', e.target.value)} disabled={!canEdit}>
              <option value="">Select</option>
              <option value="PRESENT">Present</option>
              <option value="ABSENT">Absent</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Airway</label>
            <select className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm" value={form.airway || ''} onChange={(e) => setValue('airway', e.target.value)} disabled={!canEdit}>
              <option value="">Select</option>
              <option value="NASAL_BREATHING">Nasal Breathing</option>
              <option value="MOUTH_BREATHING">Mouth Breathing</option>
            </select>
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-5">
        <h4 className="font-bold text-gray-900">Skeletal Relationships</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Antero Posterior Skeletal Pattern</label>
            <select className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm" value={form.skeletal_pattern || ''} onChange={(e) => setValue('skeletal_pattern', e.target.value)} disabled={!canEdit}>
              <option value="">Select</option>
              <option value="CLASS_1">Class 1</option>
              <option value="CLASS_2_MILD">Class 2 Mild</option>
              <option value="CLASS_2_MODERATE">Class 2 Moderate</option>
              <option value="CLASS_2_SEVERE">Class 2 Severe</option>
              <option value="CLASS_3_MILD">Class 3 Mild</option>
              <option value="CLASS_3_MODERATE">Class 3 Moderate</option>
              <option value="CLASS_3_SEVERE">Class 3 Severe</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Vertical (FMPA)</label>
            <select className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm" value={form.vertical_fmpa || ''} onChange={(e) => setValue('vertical_fmpa', e.target.value)} disabled={!canEdit}>
              <option value="">Select</option>
              <option value="LOW">Low</option>
              <option value="AVERAGE">Average</option>
              <option value="HIGH">High</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Transverse Discrepancy</label>
            <select className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm" value={form.transverse_discrepancy || ''} onChange={(e) => setValue('transverse_discrepancy', e.target.value)} disabled={!canEdit}>
              <option value="">Select</option>
              <option value="PRESENT">Present</option>
              <option value="ABSENT">Absent</option>
            </select>
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-5">
        <h4 className="font-bold text-gray-900">Soft Tissues</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Lips Competency</label>
            <select className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm" value={form.lips_competency || ''} onChange={(e) => setValue('lips_competency', e.target.value)} disabled={!canEdit}>
              <option value="">Select</option>
              <option value="COMPETENT">Competent</option>
              <option value="INCOMPETENT_SLIGHT">Incompetent - Slight</option>
              <option value="INCOMPETENT_GROSS">Incompetent - Gross</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Lip Line</label>
            <select className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm" value={form.lip_line || ''} onChange={(e) => setValue('lip_line', e.target.value)} disabled={!canEdit}>
              <option value="">Select</option>
              <option value="NORMAL">Normal</option>
              <option value="LOW">Low</option>
              <option value="HIGH">High</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Lip Contour</label>
            <select className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm" value={form.lip_contour || ''} onChange={(e) => setValue('lip_contour', e.target.value)} disabled={!canEdit}>
              <option value="">Select</option>
              <option value="NORMAL">Normal</option>
              <option value="EVERETT">Everett</option>
              <option value="VERTICAL">Vertical</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Tongue Size</label>
            <select className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm" value={form.tongue_size || ''} onChange={(e) => setValue('tongue_size', e.target.value)} disabled={!canEdit}>
              <option value="">Select</option>
              <option value="NORMAL">Normal</option>
              <option value="LARGE">Large</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Tongue at Rest</label>
            <Input value={form.tongue_rest || ''} onChange={(e) => setValue('tongue_rest', e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Tongue During Activity / Thrust</label>
            <Input value={form.tongue_thrust || ''} onChange={(e) => setValue('tongue_thrust', e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-semibold text-gray-600">Mandibular Path of Closure</label>
            <Input value={form.mandibular_path_of_closure || ''} onChange={(e) => setValue('mandibular_path_of_closure', e.target.value)} disabled={!canEdit} />
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-5">
        <h4 className="font-bold text-gray-900">Dento Alveolar</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Lower Anterior Segment</label>
            <Input value={form.lower_anterior_segment || ''} onChange={(e) => setValue('lower_anterior_segment', e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Lower Buccal Segment</label>
            <Input value={form.lower_buccal_segment || ''} onChange={(e) => setValue('lower_buccal_segment', e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Upper Anterior Segment</label>
            <Input value={form.upper_anterior_segment || ''} onChange={(e) => setValue('upper_anterior_segment', e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Upper Buccal Segment</label>
            <Input value={form.upper_buccal_segment || ''} onChange={(e) => setValue('upper_buccal_segment', e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Canine Angulation</label>
            <select className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm" value={form.canine_angulation || ''} onChange={(e) => setValue('canine_angulation', e.target.value)} disabled={!canEdit}>
              <option value="">Select</option>
              <option value="NOT_RECORDABLE">Not Recordable</option>
              <option value="VERTICAL">Vertical</option>
              <option value="MESIALLY_ANGULATED">Mesially Angulated</option>
              <option value="DISTALLY_ANGULATED">Distally Angulated</option>
            </select>
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h4 className="font-bold text-gray-900">Occlusion, IOTN & Suitability</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Incisor Relationship</label>
            <select className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm" value={form.incisor_relationship || ''} onChange={(e) => setValue('incisor_relationship', e.target.value)} disabled={!canEdit}>
              <option value="">Select</option>
              <option value="CLASS_1">Class 1</option>
              <option value="CLASS_2_DIV_1">Class 2 Division 1</option>
              <option value="CLASS_2_DIV_2">Class 2 Division 2</option>
              <option value="CLASS_3">Class 3</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Right Molar Relationship</label>
            <Input value={form.right_molar_relationship || ''} onChange={(e) => setValue('right_molar_relationship', e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Left Molar Relationship</label>
            <Input value={form.left_molar_relationship || ''} onChange={(e) => setValue('left_molar_relationship', e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Canine Relationship (Right / Left)</label>
            <Input value={form.canine_relationship || ''} onChange={(e) => setValue('canine_relationship', e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Over Jet</label>
            <Input value={form.overjet || ''} onChange={(e) => setValue('overjet', e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Over Bite</label>
            <Input value={form.overbite || ''} onChange={(e) => setValue('overbite', e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Cross Bites / Scissor Bites</label>
            <Input value={form.cross_scissor_bites || ''} onChange={(e) => setValue('cross_scissor_bites', e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Center Line</label>
            <Input value={form.centre_line || ''} onChange={(e) => setValue('centre_line', e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Classification</label>
            <Input value={form.classification || ''} onChange={(e) => setValue('classification', e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">IOTN Dental Health Component Grade</label>
            <Input value={form.iotn_dhc_grade || ''} onChange={(e) => setValue('iotn_dhc_grade', e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">IOTN Aesthetic Component Grade</label>
            <Input value={form.iotn_ac_grade || ''} onChange={(e) => setValue('iotn_ac_grade', e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Suitability</label>
            <select className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm" value={form.suitability || ''} onChange={(e) => setValue('suitability', e.target.value)} disabled={!canEdit}>
              <option value="">Select</option>
              <option value="SUITABLE_FOR_CONSULTATION">Suitable for Consultation</option>
              <option value="NOT_SUITABLE">Not Suitable</option>
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-600">Refer To (Further Management)</p>
          <div className="flex flex-wrap gap-4">
            {['PAEDO', 'RESTORATIVE', 'PERIO', 'ORAL_SURGERY', 'BASE_HOSPITAL', 'LOCAL_HOSPITAL', 'SCHOOL_DENTAL_THERAPIST'].map((item) => (
              <label key={item} className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={selectedReferrals.includes(item)}
                  disabled={!canEdit}
                  onChange={() => canEdit && toggleArrayValue('referral_targets', item)}
                />
                {item === 'ORAL_SURGERY' ? 'Oral Surgery Department' : labelize(item)}
              </label>
            ))}
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h4 className="font-bold text-gray-900">Special Investigations</h4>
        <div className="flex flex-wrap gap-4">
          {investigationOptions.map((item) => {
            const checked = selectedInvestigations.includes(item);
            return (
              <label key={item} className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!canEdit}
                  onChange={(e) => {
                    if (!canEdit) return;
                    if (e.target.checked) {
                      setValue('special_investigations', [...selectedInvestigations, item]);
                    } else {
                      setValue('special_investigations', selectedInvestigations.filter((v) => v !== item));
                    }
                  }}
                />
                {item}
              </label>
            );
          })}
        </div>
      </Card>

      <Card className="p-6 space-y-4 border-yellow-200 bg-yellow-50/40">
        <h4 className="font-bold text-gray-900">For Consultant Use Only</h4>
        {!canEditConsultantOnly && (
          <p className="text-xs text-gray-600">Read-only: only the assigned orthodontist can edit this subsection.</p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Not Taken Up for Treatment Prognosis</label>
            <select className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm" value={form.consultant_not_taken_prognosis || ''} onChange={(e) => setValue('consultant_not_taken_prognosis', e.target.value)} disabled={!canEditConsultantOnly}>
              <option value="">Select</option>
              <option value="ACCEPTABLE">Acceptable</option>
              <option value="POOR_PROGNOSIS">Poor Prognosis</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Placed on Waiting List</label>
            <select className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm" value={form.consultant_waiting_list_mode || ''} onChange={(e) => setValue('consultant_waiting_list_mode', e.target.value)} disabled={!canEditConsultantOnly}>
              <option value="">Select</option>
              <option value="REMOVABLE">Removable</option>
              <option value="FUNCTIONAL">Functional</option>
              <option value="FIXED">Fixed</option>
            </select>
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-semibold text-gray-600">Take Up Treatment</label>
            <div className="flex flex-wrap gap-4">
              {['REMOVABLE_APPLIANCE', 'FUNCTIONAL_APPLIANCE', 'FIXED_APPLIANCE'].map((item) => (
                <label key={item} className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={selectedTakeUpModes.includes(item)}
                    disabled={!canEditConsultantOnly}
                    onChange={() => canEditConsultantOnly && toggleArrayValue('consultant_take_up_treatment_modes', item)}
                  />
                  {labelize(item)}
                </label>
              ))}
            </div>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={Boolean(form.consultant_mixed_dentition_review)}
              disabled={!canEditConsultantOnly}
              onChange={(e) => setValue('consultant_mixed_dentition_review', e.target.checked)}
            />
            Mixed Dentition Review
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={Boolean(form.consultant_urgent_interceptive_treatment)}
              disabled={!canEditConsultantOnly}
              onChange={(e) => setValue('consultant_urgent_interceptive_treatment', e.target.checked)}
            />
            Urgent Interceptive Treatment
          </label>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Priority</label>
            <select className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm" value={form.consultant_priority || ''} onChange={(e) => setValue('consultant_priority', e.target.value)} disabled={!canEditConsultantOnly}>
              <option value="">Select</option>
              <option value="URGENT">Urgent</option>
              <option value="SEVERE_MALOCCLUSION">Severe Malocclusion</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Consultant Date</label>
            <Input type="date" value={form.consultant_date || ''} onChange={(e) => setValue('consultant_date', e.target.value)} disabled={!canEditConsultantOnly} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-semibold text-gray-600">Consultant Signature</label>
            <Input value={form.consultant_signature || ''} onChange={(e) => setValue('consultant_signature', e.target.value)} disabled={!canEditConsultantOnly} />
          </div>
        </div>
      </Card>

      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={saveHistory} disabled={saving}>
            {saving ? 'Saving...' : 'Save Patient History'}
          </Button>
        </div>
      )}
    </div>
  );
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  return String(value).slice(0, 16).replace('T', ' ');
}

function toDateTimeLocalValue(value?: string | null) {
  if (!value) return '';
  return String(value).replace(' ', 'T').slice(0, 16);
}

function formatCurrency(amount: string | number | null | undefined, currency?: string | null) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return '-';

  try {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: currency || 'LKR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(numericAmount);
  } catch (_error) {
    return `${currency || 'LKR'} ${numericAmount.toFixed(2)}`;
  }
}

function formatStatusLabel(value?: string | null) {
  return String(value || '').replace(/_/g, ' ') || '-';
}

function RecordAuditDetails({ record }: { record: any }) {
  const createdBy = record?.author_name || 'Unknown User';
  const updatedBy = record?.updated_by_name || createdBy;

  return (
    <div className="mt-3 space-y-1 text-xs text-gray-500">
      <p>Created by {createdBy} on {formatDateTime(record?.created_at)}</p>
      <p>Last edited by {updatedBy} on {formatDateTime(record?.updated_at)}</p>
    </div>
  );
}

function EntryEditorModal({
  open,
  title,
  onClose,
  children,
  widthClassName = 'max-w-3xl'
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  widthClassName?: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/45 px-4 py-6">
      <div className={`w-full ${widthClassName} max-h-[90vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-10 w-10 border border-red-200 bg-red-50 text-red-600 hover:border-red-300 hover:bg-red-100 active:bg-red-200"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="max-h-[calc(90vh-73px)] overflow-y-auto px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  );
}

function PatientMaterialUsageTab({
  patientId,
  role
}: {
  patientId: string;
  role?: string;
}) {
  const canCreate = canManagePatientMaterials(role);
  const canDelete = canDeletePatientMaterials(role);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'active' | 'trashed'>('active');
  const [trashCount, setTrashCount] = useState(0);
  const [records, setRecords] = useState<any[]>([]);
  const [inventoryOptions, setInventoryOptions] = useState<any[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [inventoryItemId, setInventoryItemId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [usedAt, setUsedAt] = useState('');
  const [purpose, setPurpose] = useState('');
  const [notes, setNotes] = useState('');
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

  const selectedMaterial = useMemo(
    () => inventoryOptions.find((item) => String(item.id) === String(inventoryItemId)),
    [inventoryOptions, inventoryItemId]
  );
  const requestedQuantity = Number(quantity);
  const availableQuantity = Number(selectedMaterial?.quantity ?? 0);
  const exceedsAvailableQuantity = Boolean(
    selectedMaterial &&
    quantity &&
    Number.isFinite(requestedQuantity) &&
    requestedQuantity > availableQuantity
  );

  const loadRecords = async (mode: 'active' | 'trashed' = viewMode) => {
    setLoading(true);
    try {
      const [response, trashResponse] = await Promise.all([
        apiService.patientMaterials.getPatientRecords(patientId, { page: 1, limit: 100, deleted: mode }),
        canDelete
          ? apiService.patientMaterials.getPatientRecords(patientId, { page: 1, limit: 1, deleted: 'trashed' })
          : Promise.resolve(null)
      ]);
      setRecords(response.data?.records || []);
      if (trashResponse) {
        const total = trashResponse.data?.pagination?.total_records;
        setTrashCount(typeof total === 'number' ? total : (trashResponse.data?.records || []).length);
      } else {
        setTrashCount(0);
      }
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load patient materials');
      setRecords([]);
      setTrashCount(0);
    } finally {
      setLoading(false);
    }
  };

  const loadInventoryOptions = async () => {
    if (!canCreate) return;
    setInventoryLoading(true);
    try {
      const pageSize = 100;
      let page = 1;
      let totalPages = 1;
      const allItems: any[] = [];

      do {
        const response = await apiService.inventory.getList({ page, limit: pageSize, deleted: 'active' });
        allItems.push(...(response.data?.inventory || []));
        totalPages = Number(response.data?.pagination?.total_pages || 1);
        page += 1;
      } while (page <= totalPages);

      setInventoryOptions(allItems);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load inventory materials');
      setInventoryOptions([]);
    } finally {
      setInventoryLoading(false);
    }
  };

  useEffect(() => {
    loadRecords(viewMode);
  }, [patientId, viewMode]);

  useEffect(() => {
    if (editorOpen && canCreate && inventoryOptions.length === 0) {
      loadInventoryOptions();
    }
  }, [editorOpen, canCreate, inventoryOptions.length]);

  const resetForm = () => {
    setEditingId(null);
    setInventoryItemId('');
    setQuantity('');
    setUsedAt('');
    setPurpose('');
    setNotes('');
  };

  const closeEditor = () => {
    if (saving) return;
    setEditorOpen(false);
    resetForm();
  };

  const openCreateEditor = async () => {
    resetForm();
    if (inventoryOptions.length === 0) {
      await loadInventoryOptions();
    }
    setEditorOpen(true);
  };

  const startEdit = async (record: any) => {
    if (inventoryOptions.length === 0) {
      await loadInventoryOptions();
    }
    setEditingId(record.id);
    setInventoryItemId(String(record.inventory_item_id || ''));
    setQuantity(String(record.quantity || ''));
    setUsedAt(toDateTimeLocalValue(record.used_at) || new Date().toISOString().slice(0, 16));
    setPurpose(String(record.purpose || ''));
    setNotes(String(record.notes || ''));
    setEditorOpen(true);
  };

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

  const saveUsage = async () => {
    if (!inventoryItemId || !quantity) {
      toast.error('Please select a material and quantity');
      return;
    }

    if (exceedsAvailableQuantity) {
      toast.error(`Only ${availableQuantity} ${selectedMaterial?.unit || 'units'} available for ${selectedMaterial?.name || 'this material'}`);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        inventory_item_id: Number(inventoryItemId),
        quantity: Number(quantity),
        used_at: editingId ? (usedAt || undefined) : undefined,
        purpose: purpose.trim() || undefined,
        notes: notes.trim() || undefined
      };

      if (editingId) {
        await apiService.patientMaterials.update(String(editingId), payload);
        toast.success('Patient material usage updated');
      } else {
        await apiService.patientMaterials.create(patientId, payload);
        toast.success('Patient material usage recorded');
      }

      setEditorOpen(false);
      resetForm();
      await loadRecords(viewMode);
    } catch (error: any) {
      toast.error(error?.message || (editingId ? 'Failed to update patient material usage' : 'Failed to record patient material usage'));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = (record: any, permanent = false) => {
    openConfirmDialog({
      title: permanent ? 'Permanently Delete Material Usage' : 'Delete Material Usage',
      message: permanent
        ? `${record.material_name || 'This material usage'} will be permanently deleted from the recycle bin. This action cannot be undone.`
        : `${record.material_name || 'This material usage'} will be moved to the recycle bin and its stock will be restored to inventory.`,
      confirmText: permanent ? 'Delete Permanently' : 'Delete Material Usage',
      tone: permanent ? 'danger' : 'warning',
      requireAcknowledge: permanent,
      acknowledgeText: 'I understand this permanent deletion cannot be undone.',
      onConfirm: async () => {
        try {
          await apiService.patientMaterials.delete(String(record.id), permanent);
          toast.success(permanent ? 'Patient material usage permanently deleted' : 'Patient material usage moved to recycle bin');
          await loadRecords(viewMode);
        } catch (error: any) {
          toast.error(error?.message || 'Failed to delete patient material usage');
          throw error;
        }
      }
    });
  };

  const onRestore = (record: any) => {
    openConfirmDialog({
      title: 'Restore Material Usage',
      message: `${record.material_name || 'This material usage'} will be restored and the used quantity will be deducted from inventory again.`,
      confirmText: 'Restore Material Usage',
      tone: 'info',
      onConfirm: async () => {
        try {
          await apiService.patientMaterials.restore(String(record.id));
          toast.success('Patient material usage restored');
          await loadRecords(viewMode);
        } catch (error: any) {
          toast.error(error?.message || 'Failed to restore patient material usage');
          throw error;
        }
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-gray-900">Patient Materials Used</h4>
        <div className="flex items-center gap-2">
          {canDelete && (
            <Button
              variant={viewMode === 'trashed' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setViewMode(viewMode === 'active' ? 'trashed' : 'active')}
              disabled={loading}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              {viewMode === 'active' ? 'View Bin' : 'View Active'}
              {viewMode === 'active' && (
                <span
                  className={`ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white ${
                    trashCount > 0 ? '' : 'invisible'
                  }`}
                >
                  {trashCount}
                </span>
              )}
            </Button>
          )}
          <RefreshButton
            size="sm"
            className="h-9 px-3 border-slate-300"
            onClick={() => loadRecords(viewMode)}
            loading={loading}
          />
          {canCreate && viewMode === 'active' && (
            <Button size="sm" className="flex items-center gap-2" onClick={openCreateEditor}>
              <Plus className="w-4 h-4" />
              Add Material Usage
            </Button>
          )}
        </div>
      </div>

      {loading && (
        <Card className="p-6 text-sm text-gray-500">Loading patient materials...</Card>
      )}

      {!loading && records.length === 0 && (
        <Card className="p-6 text-sm text-gray-500">
          {viewMode === 'trashed' ? 'Material usage recycle bin is empty.' : 'No materials have been recorded for this patient yet.'}
        </Card>
      )}

      <div className="space-y-4">
        {records.map((record) => (
          <Card key={record.id} className="p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-bold text-gray-900">{record.material_name || 'Unknown Material'}</span>
                  <Badge variant="warning">{record.quantity} {record.material_unit || 'units'}</Badge>
                  <Badge variant="blue">{record.material_category || 'Inventory'}</Badge>
                </div>
                <div className="grid grid-cols-1 gap-2 text-xs text-gray-600 md:grid-cols-2">
                  <div><span className="font-semibold text-gray-700">Used Date:</span> {formatDateTime(record.used_at)}</div>
                  <div><span className="font-semibold text-gray-700">Purpose:</span> {record.purpose || '-'}</div>
                  <div><span className="font-semibold text-gray-700">Recorded By:</span> {record.author_name || '-'}</div>
                  <div><span className="font-semibold text-gray-700">Last Updated By:</span> {record.updated_by_name || record.author_name || '-'}</div>
                </div>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{record.notes || 'No additional notes recorded.'}</p>
                <RecordAuditDetails record={record} />
                {record.deleted_at && (
                  <p className="text-xs text-red-600">
                    Moved to recycle bin on {formatDateTime(record.deleted_at)} by {record.deleted_by_name || 'System'}
                  </p>
                )}
              </div>
              {(canCreate || canDelete) && (
                <div className="flex flex-wrap items-center gap-2">
                  {canCreate && viewMode === 'active' && (
                    <Button variant="secondary" size="sm" className="h-9 px-3" onClick={() => startEdit(record)}>
                      <Pencil className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                  )}
                  {canDelete && viewMode === 'active' && (
                    <Button variant="danger" size="sm" className="h-9 px-3" onClick={() => onDelete(record, false)}>
                      <Trash2 className="w-4 h-4 mr-1" />
                      Delete
                    </Button>
                  )}
                  {canDelete && viewMode === 'trashed' && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="bg-green-600 text-white hover:bg-green-700 active:bg-green-800 border-0"
                        onClick={() => onRestore(record)}
                      >
                        <RotateCcw className="w-4 h-4 mr-1" />
                        Restore
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => onDelete(record, true)}>
                        <Trash2 className="w-4 h-4 mr-1" />
                        Delete Permanently
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      <EntryEditorModal
        open={editorOpen}
        title={editingId ? 'Edit Patient Material Usage' : 'Add Patient Material Usage'}
        onClose={closeEditor}
        widthClassName="max-w-2xl"
      >
        <div className="space-y-5">
          <div className="rounded-xl border border-orange-100 bg-orange-50/60 p-5 space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-600">Material</label>
              <select
                className="h-11 w-full rounded-md border border-gray-200 bg-white px-4 py-2 text-sm"
                value={inventoryItemId}
                onChange={(e) => setInventoryItemId(e.target.value)}
                disabled={inventoryLoading || saving}
              >
                <option value="">{inventoryLoading ? 'Loading materials...' : 'Select a material'}</option>
                {inventoryOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.quantity} {item.unit})
                  </option>
                ))}
              </select>
              {selectedMaterial && (
                <p className="text-xs text-gray-600">
                  Available stock: {selectedMaterial.quantity} {selectedMaterial.unit} • Category: {selectedMaterial.category}
                </p>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-1">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-600">Used Quantity</label>
                <Input
                  type="number"
                  min={1}
                  className="h-11 px-4"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
                {selectedMaterial && (
                  <p className={`text-xs ${exceedsAvailableQuantity ? 'font-semibold text-red-600' : 'text-gray-600'}`}>
                    Available: {availableQuantity} {selectedMaterial.unit}
                    {exceedsAvailableQuantity ? ` - requested quantity exceeds current stock.` : ''}
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-600">Purpose or Procedure</label>
              <Input className="h-11 px-4" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-600">Usage Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[140px] w-full resize-y rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeEditor} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveUsage} disabled={saving || !inventoryItemId || !quantity || exceedsAvailableQuantity}>
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Material Usage'}
            </Button>
          </div>
        </div>
      </EntryEditorModal>

      {confirmDialog.open && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
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
                    onChange={(e) => setConfirmDialog((prev) => ({ ...prev, acknowledged: e.target.checked }))}
                    disabled={confirmDialog.processing}
                  />
                  <span>{confirmDialog.acknowledgeText}</span>
                </label>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="secondary" onClick={closeConfirmDialog} disabled={confirmDialog.processing}>
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

function PaymentRecordsTab({
  patientId,
  role
}: {
  patientId: string;
  role?: string;
}) {
  const canCreate = canManagePaymentRecords(role);
  const canDelete = canDeletePaymentRecords(role);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'active' | 'trashed'>('active');
  const [trashCount, setTrashCount] = useState(0);
  const [records, setRecords] = useState<any[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
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
  const [form, setForm] = useState({
    payment_date: '',
    amount: '',
    currency: 'LKR',
    payment_method: 'CASH',
    status: 'PAID',
    reference_number: '',
    notes: ''
  });
  const paymentDateRef = useRef<HTMLInputElement | null>(null);

  const openDateTimePicker = (input: HTMLInputElement | null) => {
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }
    input.focus();
    input.click();
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({
      payment_date: '',
      amount: '',
      currency: 'LKR',
      payment_method: 'CASH',
      status: 'PAID',
      reference_number: '',
      notes: ''
    });
  };

  const closeEditor = () => {
    if (saving) return;
    setEditorOpen(false);
    resetForm();
  };

  const openCreateEditor = () => {
    resetForm();
    setEditorOpen(true);
  };

  const loadRecords = async (mode: 'active' | 'trashed' = viewMode) => {
    setLoading(true);
    try {
      const [response, trashResponse] = await Promise.all([
        apiService.paymentRecords.getPatientRecords(patientId, { page: 1, limit: 100, deleted: mode }),
        canDelete
          ? apiService.paymentRecords.getPatientRecords(patientId, { page: 1, limit: 1, deleted: 'trashed' })
          : Promise.resolve(null)
      ]);

      setRecords(response.data?.records || []);
      if (trashResponse) {
        const total = trashResponse.data?.pagination?.total_records;
        setTrashCount(typeof total === 'number' ? total : (trashResponse.data?.records || []).length);
      } else {
        setTrashCount(0);
      }
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load payment records');
      setRecords([]);
      setTrashCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords(viewMode);
  }, [patientId, viewMode]);

  const startEdit = (record: any) => {
    setEditingId(record.id);
    setForm({
      payment_date: toDateTimeLocalValue(record.payment_date),
      amount: String(record.amount ?? ''),
      currency: String(record.currency || 'LKR'),
      payment_method: String(record.payment_method || 'CASH'),
      status: String(record.status || 'PAID'),
      reference_number: String(record.reference_number || ''),
      notes: String(record.notes || '')
    });
    setEditorOpen(true);
  };

  const saveRecord = async () => {
    if (!form.payment_date) {
      toast.error('Payment date is required');
      return;
    }

    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Amount must be greater than zero');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        payment_date: form.payment_date,
        amount,
        currency: form.currency.trim().toUpperCase() || 'LKR',
        payment_method: form.payment_method,
        status: form.status,
        reference_number: form.reference_number.trim() || undefined,
        notes: form.notes.trim() || undefined
      };

      if (editingId) {
        await apiService.paymentRecords.update(String(editingId), payload);
        toast.success('Payment record updated');
      } else {
        await apiService.paymentRecords.create(patientId, payload);
        toast.success('Payment record created');
      }

      setEditorOpen(false);
      resetForm();
      await loadRecords(viewMode);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save payment record');
    } finally {
      setSaving(false);
    }
  };

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

  const onDelete = (id: number, permanent = false) => {
    openConfirmDialog({
      title: permanent ? 'Permanently Delete Payment Record' : 'Delete Payment Record',
      message: permanent
        ? 'This will permanently delete this payment record from the recycle bin. This action cannot be undone.'
        : 'This payment record will be moved to the recycle bin. You can restore it later.',
      confirmText: permanent ? 'Delete Permanently' : 'Delete Payment Record',
      tone: permanent ? 'danger' : 'warning',
      requireAcknowledge: permanent,
      acknowledgeText: 'I understand this permanent deletion cannot be undone.',
      onConfirm: async () => {
        try {
          await apiService.paymentRecords.delete(String(id), permanent);
          toast.success(permanent ? 'Payment record permanently deleted' : 'Payment record moved to recycle bin');
          await loadRecords(viewMode);
        } catch (error: any) {
          toast.error(error?.message || 'Failed to delete payment record');
          throw error;
        }
      }
    });
  };

  const onRestore = (id: number) => {
    openConfirmDialog({
      title: 'Restore Payment Record',
      message: 'This payment record will be restored to active payment records.',
      confirmText: 'Restore Payment Record',
      tone: 'info',
      onConfirm: async () => {
        try {
          await apiService.paymentRecords.restore(String(id));
          toast.success('Payment record restored');
          await loadRecords(viewMode);
        } catch (error: any) {
          toast.error(error?.message || 'Failed to restore payment record');
          throw error;
        }
      }
    });
  };

  const statusVariant = (status?: string) => {
    if (status === 'PAID') return 'success';
    if (status === 'PARTIAL') return 'warning';
    if (status === 'REFUNDED' || status === 'VOID') return 'neutral';
    return 'blue';
  };

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-gray-900">Payment Records</h4>
          <div className="flex items-center gap-2">
            {canDelete && (
              <Button
                variant={viewMode === 'trashed' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setViewMode(viewMode === 'active' ? 'trashed' : 'active')}
                disabled={loading}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                {viewMode === 'active' ? 'View Recycle Bin' : 'View Active'}
                {viewMode === 'active' && (
                  <span
                    className={`ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white ${
                      trashCount > 0 ? '' : 'invisible'
                    }`}
                  >
                    {trashCount}
                  </span>
                )}
              </Button>
            )}
            <RefreshButton size="sm" onClick={() => loadRecords(viewMode)} loading={loading} />
            {canCreate && viewMode === 'active' && (
              <Button size="sm" className="flex items-center gap-2" onClick={openCreateEditor}>
                <Plus className="w-4 h-4" />
                Add Payment Record
              </Button>
            )}
          </div>
        </div>

        {loading && (
          <Card className="p-6 text-sm text-gray-500">Loading payment records...</Card>
        )}

        {!loading && records.length === 0 && (
          <Card className="p-6 text-sm text-gray-500">
            {viewMode === 'trashed' ? 'The payment recycle bin is empty.' : 'No payment records found for this patient.'}
          </Card>
        )}

        <div className="space-y-4">
          {records.map((record) => (
            <Card key={record.id} className="p-4 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-gray-900">{formatCurrency(record.amount, record.currency)}</span>
                    <Badge variant={statusVariant(record.status)}>{formatStatusLabel(record.status)}</Badge>
                    <Badge variant="neutral">{formatStatusLabel(record.payment_method)}</Badge>
                  </div>
                  <div className="grid grid-cols-1 gap-2 text-xs text-gray-600 md:grid-cols-2">
                    <div><span className="font-semibold text-gray-700">Payment Date:</span> {formatDateTime(record.payment_date)}</div>
                    <div><span className="font-semibold text-gray-700">Reference:</span> {record.reference_number || '-'}</div>
                    <div><span className="font-semibold text-gray-700">Created By:</span> {record.created_by_name || '-'}</div>
                    <div><span className="font-semibold text-gray-700">Last Updated By:</span> {record.updated_by_name || '-'}</div>
                  </div>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{record.notes || 'No notes recorded.'}</p>
                  {record.deleted_at && (
                    <p className="text-xs text-red-600">
                      Moved to recycle bin on {formatDateTime(record.deleted_at)} by {record.deleted_by_name || 'Admin'}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {canCreate && viewMode === 'active' && (
                    <Button variant="secondary" size="sm" onClick={() => startEdit(record)}>
                      <Pencil className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                  )}
                  {canDelete && viewMode === 'active' && (
                    <Button variant="danger" size="sm" onClick={() => onDelete(record.id, false)}>
                      <Trash2 className="w-4 h-4 mr-1" />
                      Delete
                    </Button>
                  )}
                  {canDelete && viewMode === 'trashed' && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="bg-green-600 text-white hover:bg-green-700 active:bg-green-800 border-0"
                        onClick={() => onRestore(record.id)}
                      >
                        <RotateCcw className="w-4 h-4 mr-1" />
                        Restore
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => onDelete(record.id, true)}>
                        <Trash2 className="w-4 h-4 mr-1" />
                        Delete Permanently
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <EntryEditorModal
        open={editorOpen}
        title={editingId ? 'Edit Payment Record' : 'Add Payment Record'}
        onClose={closeEditor}
        widthClassName="max-w-2xl"
      >
        <div className="space-y-5">
          <div className="rounded-xl border border-purple-100 bg-purple-50/50 p-5 space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-600">Payment Date and Time</label>
              <div className="flex items-center gap-2">
                <input
                  ref={paymentDateRef}
                  type="datetime-local"
                  value={form.payment_date}
                  onChange={(e) => setForm((prev) => ({ ...prev, payment_date: e.target.value }))}
                  className="sr-only"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="h-11 w-11 border-gray-200"
                  onClick={() => openDateTimePicker(paymentDateRef.current)}
                  title={form.payment_date || 'Select payment date and time'}
                >
                  <Calendar className="w-4 h-4" />
                </Button>
                <span className="flex-1 text-sm text-gray-600">{formatDateTime(form.payment_date)}</span>
                {form.payment_date && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-9 px-3"
                    onClick={() => setForm((prev) => ({ ...prev, payment_date: '' }))}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-600">Amount</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                className="h-11 px-4"
                value={form.amount}
                onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-600">Currency</label>
                <Input
                  maxLength={3}
                  className="h-11 px-4"
                  value={form.currency}
                  onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value.toUpperCase() }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-600">Status</label>
                <select
                  className="h-11 w-full rounded-md border border-gray-200 bg-white px-4 py-2 text-sm"
                  value={form.status}
                  onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                >
                  <option value="PAID">Paid</option>
                  <option value="PENDING">Pending</option>
                  <option value="PARTIAL">Partial</option>
                  <option value="REFUNDED">Refunded</option>
                  <option value="VOID">Void</option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-600">Payment Method</label>
              <select
                className="h-11 w-full rounded-md border border-gray-200 bg-white px-4 py-2 text-sm"
                value={form.payment_method}
                onChange={(e) => setForm((prev) => ({ ...prev, payment_method: e.target.value }))}
              >
                <option value="CASH">Cash</option>
                <option value="CARD">Card</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="ONLINE">Online</option>
                <option value="CHEQUE">Cheque</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-600">Reference Number</label>
              <Input
                className="h-11 px-4"
                value={form.reference_number}
                onChange={(e) => setForm((prev) => ({ ...prev, reference_number: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-600">Payment Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                className="w-full min-h-[140px] resize-y rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeEditor} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveRecord} disabled={saving}>
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Payment Record'}
            </Button>
          </div>
        </div>
      </EntryEditorModal>

      {confirmDialog.open && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
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
                    onChange={(e) => setConfirmDialog((prev) => ({ ...prev, acknowledged: e.target.checked }))}
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

function DiagnosisTab({
  notes,
  patientId,
  canCreate,
  canDelete,
  onCreated
}: {
  notes: any[];
  patientId: string;
  canCreate: boolean;
  canDelete: boolean;
  onCreated: () => Promise<void>;
}) {
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'active' | 'trashed'>('active');
  const [trashCount, setTrashCount] = useState(0);
  const [notesData, setNotesData] = useState<any[]>(notes || []);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
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

  const loadNotes = async (mode: 'active' | 'trashed' = viewMode) => {
    setLoading(true);
    try {
      const [response, trashResponse] = await Promise.all([
        apiService.clinicalNotes.getPatientNotes(patientId, { page: 1, limit: 100, deleted: mode }),
        canDelete
          ? apiService.clinicalNotes.getPatientNotes(patientId, { page: 1, limit: 1, deleted: 'trashed' })
          : Promise.resolve(null)
      ]);
      setNotesData(response.data?.notes || []);
      if (trashResponse) {
        const total = trashResponse.data?.pagination?.total_records;
        setTrashCount(typeof total === 'number' ? total : (trashResponse.data?.notes || []).length);
      } else {
        setTrashCount(0);
      }
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load diagnosis notes');
      setNotesData([]);
      setTrashCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotes(viewMode);
  }, [patientId, viewMode]);

  const diagnosisNotes = useMemo(
    () => (notesData || [])
      .filter((note) => note.note_type === 'DIAGNOSIS')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [notesData]
  );

  const resetEditor = () => {
    setEditingId(null);
    setContent('');
  };

  const closeEditor = () => {
    if (saving) return;
    setEditorOpen(false);
    resetEditor();
  };

  const openCreateEditor = () => {
    resetEditor();
    setEditorOpen(true);
  };

  const startEdit = (note: any) => {
    setEditingId(note.id);
    setContent(String(note.content || ''));
    setEditorOpen(true);
  };

  const addDiagnosis = async () => {
    if (viewMode !== 'active') {
      toast.info('Switch to active view to add diagnosis details');
      return;
    }
    if (!content.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await apiService.clinicalNotes.update(String(editingId), { content: content.trim(), note_type: 'DIAGNOSIS' });
        toast.success('Diagnosis note updated');
      } else {
        await apiService.clinicalNotes.create(patientId, { content: content.trim(), note_type: 'DIAGNOSIS' });
        toast.success('Diagnosis note added');
      }
      setEditorOpen(false);
      resetEditor();
      await onCreated();
      await loadNotes(viewMode);
    } catch (error: any) {
      toast.error(error?.message || (editingId ? 'Failed to update diagnosis note' : 'Failed to add diagnosis note'));
    } finally {
      setSaving(false);
    }
  };

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

  const onDelete = (id: number, permanent = false) => {
    openConfirmDialog({
      title: permanent ? 'Permanently Delete Diagnosis Note' : 'Delete Diagnosis Note',
      message: permanent
        ? 'This will permanently delete this diagnosis note from the bin. This action cannot be undone.'
        : 'This diagnosis note will be moved to the bin. You can restore it later.',
      confirmText: permanent ? 'Delete Permanently' : 'Delete Diagnosis Note',
      tone: permanent ? 'danger' : 'warning',
      requireAcknowledge: permanent,
      acknowledgeText: 'I understand this permanent deletion cannot be undone.',
      onConfirm: async () => {
        try {
          await apiService.clinicalNotes.delete(String(id), permanent);
          toast.success(permanent ? 'Diagnosis note permanently deleted' : 'Diagnosis note moved to bin');
          await loadNotes(viewMode);
        } catch (error: any) {
          toast.error(error?.message || 'Failed to delete diagnosis note');
          throw error;
        }
      }
    });
  };

  const onRestore = (id: number) => {
    openConfirmDialog({
      title: 'Restore Diagnosis Note',
      message: 'This diagnosis note will be restored to active notes.',
      confirmText: 'Restore Diagnosis Note',
      tone: 'info',
      onConfirm: async () => {
        try {
          await apiService.clinicalNotes.restore(String(id));
          toast.success('Diagnosis note restored');
          await loadNotes(viewMode);
        } catch (error: any) {
          toast.error(error?.message || 'Failed to restore diagnosis note');
          throw error;
        }
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-gray-900">Diagnosis Details</h4>
          <div className="flex items-center gap-2">
            {canDelete && (
              <Button
                variant={viewMode === 'trashed' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setViewMode(viewMode === 'active' ? 'trashed' : 'active')}
                disabled={loading}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                {viewMode === 'active' ? 'View Bin' : 'View Active'}
                {viewMode === 'active' && (
                  <span
                    className={`ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white ${
                      trashCount > 0 ? '' : 'invisible'
                    }`}
                  >
                    {trashCount}
                  </span>
                )}
              </Button>
            )}
            <RefreshButton
              size="sm"
              className="h-9 px-3 border-slate-300"
              onClick={() => loadNotes(viewMode)}
              loading={loading}
            />
            {canCreate && viewMode === 'active' && (
              <Button size="sm" className="flex items-center gap-2" onClick={openCreateEditor}>
                <Plus className="w-4 h-4" />
                Add Diagnosis
              </Button>
            )}
          </div>
        </div>
        {loading && (
          <Card className="p-6 text-sm text-gray-500">Loading diagnosis notes...</Card>
        )}
        {!loading && diagnosisNotes.length === 0 && (
          <Card className="p-6 text-sm text-gray-500">
            {viewMode === 'trashed' ? 'Diagnosis bin is empty.' : 'No diagnosis details recorded for this patient.'}
          </Card>
        )}
        {diagnosisNotes.map((note) => (
          <Card key={note.id} className="p-4 shadow-sm">
            <div className="flex justify-between items-start mb-2">
              <div>
                <span className="font-bold text-sm text-gray-900">{note.author_name || 'Unknown Author'}</span>
                <Badge variant="neutral" className="ml-2">DIAGNOSIS</Badge>
              </div>
              <span className="text-xs text-gray-400">{formatDateTime(note.created_at)}</span>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{note.content}</p>
            <RecordAuditDetails record={note} />
            {(canCreate || canDelete) && viewMode === 'active' && (
              <div className="mt-3 flex items-center gap-2">
                {canCreate && (
                  <Button variant="secondary" size="sm" className="h-9 px-3" onClick={() => startEdit(note)}>
                    <Pencil className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                )}
                {canDelete && (
                  <Button variant="danger" size="sm" className="h-9 px-3" onClick={() => onDelete(note.id, false)}>
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                )}
              </div>
            )}
            {canDelete && viewMode === 'trashed' && (
              <div className="mt-3 flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="bg-green-600 text-white hover:bg-green-700 active:bg-green-800 border-0"
                  onClick={() => onRestore(note.id)}
                >
                  <RotateCcw className="w-4 h-4 mr-1" />
                  Restore
                </Button>
                <Button variant="danger" size="sm" onClick={() => onDelete(note.id, true)}>
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete Permanently
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>

      {confirmDialog.open && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
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
                    onChange={(e) => setConfirmDialog((prev) => ({ ...prev, acknowledged: e.target.checked }))}
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

      <EntryEditorModal
        open={editorOpen}
        title={editingId ? 'Edit Diagnosis' : 'Add Diagnosis'}
        onClose={closeEditor}
        widthClassName="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-5 space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-600">Diagnosis details</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full min-h-[280px] resize-y rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeEditor} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={addDiagnosis} disabled={saving || !content.trim()}>
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Diagnosis'}
            </Button>
          </div>
        </div>
      </EntryEditorModal>
    </div>
  );
}

function TreatmentPlanNotesTab({
  notes,
  patientId,
  role,
  canCreate,
  canDelete,
  onCreated,
}: {
  notes: any[];
  patientId: string;
  role?: string;
  canCreate: boolean;
  canDelete: boolean;
  onCreated: () => Promise<void>;
}) {
  const canEditEntries = canCreate;
  const [content, setContent] = useState('');
  const [noteType, setNoteType] = useState('PROGRESS');
  const [planProcedure, setPlanProcedure] = useState('');
  const [plannedFor, setPlannedFor] = useState('');
  const [executedAt, setExecutedAt] = useState('');
  const [executionStatus, setExecutionStatus] = useState('PLANNED');
  const [outcomeNotes, setOutcomeNotes] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'active' | 'trashed'>('active');
  const [trashCount, setTrashCount] = useState(0);
  const [notesData, setNotesData] = useState<any[]>(notes || []);
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
  const plannedForRef = useRef<HTMLInputElement | null>(null);
  const executedAtRef = useRef<HTMLInputElement | null>(null);

  const openDateTimePicker = (input: HTMLInputElement | null) => {
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }
    input.focus();
    input.click();
  };

  const loadNotes = async (mode: 'active' | 'trashed' = viewMode) => {
    setLoading(true);
    try {
      const [response, trashResponse] = await Promise.all([
        apiService.clinicalNotes.getPatientNotes(patientId, { page: 1, limit: 100, deleted: mode }),
        canDelete
          ? apiService.clinicalNotes.getPatientNotes(patientId, { page: 1, limit: 1, deleted: 'trashed' })
          : Promise.resolve(null)
      ]);
      setNotesData(response.data?.notes || []);
      if (trashResponse) {
        const total = trashResponse.data?.pagination?.total_records;
        setTrashCount(typeof total === 'number' ? total : (trashResponse.data?.notes || []).length);
      } else {
        setTrashCount(0);
      }
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load treatment plan notes');
      setNotesData([]);
      setTrashCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotes(viewMode);
  }, [patientId, viewMode]);

  const treatmentPlanNotes = useMemo(
    () => (notesData || [])
      .filter((note) => note.note_type !== 'DIAGNOSIS')
      .sort((a, b) => {
        const aTs = new Date(a.planned_for || a.executed_at || a.created_at).getTime();
        const bTs = new Date(b.planned_for || b.executed_at || b.created_at).getTime();
        return aTs - bTs;
      }),
    [notesData]
  );

  const resetForm = () => {
    setEditingId(null);
    setContent('');
    setNoteType('PROGRESS');
    setPlanProcedure('');
    setPlannedFor('');
    setExecutedAt('');
    setExecutionStatus('PLANNED');
    setOutcomeNotes('');
  };

  const closeEditor = () => {
    if (saving) return;
    setEditorOpen(false);
    resetForm();
  };

  const openCreateEditor = () => {
    resetForm();
    setEditorOpen(true);
  };

  const addNote = async () => {
    if (!content.trim() && !planProcedure.trim()) return;
    setSaving(true);
    try {
      const payload = {
        content: content.trim() || 'Treatment plan entry',
        note_type: noteType,
        plan_procedure: planProcedure.trim() || undefined,
        planned_for: plannedFor || undefined,
        executed_at: executedAt || undefined,
        execution_status: executionStatus || undefined,
        outcome_notes: outcomeNotes.trim() || undefined
      };

      if (editingId) {
        await apiService.clinicalNotes.update(String(editingId), payload);
        toast.success('Treatment plan entry updated');
      } else {
        await apiService.clinicalNotes.create(patientId, payload);
        toast.success('Treatment plan entry added');
      }
      setEditorOpen(false);
      resetForm();
      await onCreated();
      await loadNotes(viewMode);
    } catch (error: any) {
      toast.error(error?.message || (editingId ? 'Failed to update treatment plan entry' : 'Failed to add treatment plan entry'));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (note: any) => {
    setEditingId(note.id);
    setContent(String(note.content || ''));
    setNoteType(String(note.note_type || 'PROGRESS'));
    setPlanProcedure(String(note.plan_procedure || ''));
    setPlannedFor(toDateTimeLocalValue(note.planned_for));
    setExecutedAt(toDateTimeLocalValue(note.executed_at));
    setExecutionStatus(String(note.execution_status || 'PLANNED'));
    setOutcomeNotes(String(note.outcome_notes || ''));
    setEditorOpen(true);
  };

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

  const onDelete = (id: number, permanent = false) => {
    openConfirmDialog({
      title: permanent ? 'Permanently Delete Treatment Plan Note' : 'Delete Treatment Plan Note',
      message: permanent
        ? 'This will permanently delete this treatment plan note from the bin. This action cannot be undone.'
        : 'This treatment plan note will be moved to the bin. You can restore it later.',
      confirmText: permanent ? 'Delete Permanently' : 'Delete Treatment Plan Note',
      tone: permanent ? 'danger' : 'warning',
      requireAcknowledge: permanent,
      acknowledgeText: 'I understand this permanent deletion cannot be undone.',
      onConfirm: async () => {
        try {
          await apiService.clinicalNotes.delete(String(id), permanent);
          toast.success(permanent ? 'Treatment plan note permanently deleted' : 'Treatment plan note moved to bin');
          await loadNotes(viewMode);
        } catch (error: any) {
          toast.error(error?.message || 'Failed to delete treatment plan note');
          throw error;
        }
      }
    });
  };

  const onRestore = (id: number) => {
    openConfirmDialog({
      title: 'Restore Treatment Plan Note',
      message: 'This treatment plan note will be restored to active notes.',
      confirmText: 'Restore Treatment Plan Note',
      tone: 'info',
      onConfirm: async () => {
        try {
          await apiService.clinicalNotes.restore(String(id));
          toast.success('Treatment plan note restored');
          await loadNotes(viewMode);
        } catch (error: any) {
          toast.error(error?.message || 'Failed to restore treatment plan note');
          throw error;
        }
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-gray-900">Treatment Plans Timeline</h4>
          <div className="flex items-center gap-2">
            {canDelete && (
              <Button
                variant={viewMode === 'trashed' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setViewMode(viewMode === 'active' ? 'trashed' : 'active')}
                disabled={loading}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                {viewMode === 'active' ? 'View Bin' : 'View Active'}
                {viewMode === 'active' && (
                  <span
                    className={`ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white ${
                      trashCount > 0 ? '' : 'invisible'
                    }`}
                  >
                    {trashCount}
                  </span>
                )}
              </Button>
            )}
            <RefreshButton
              size="sm"
              className="h-9 px-3 border-slate-300"
              onClick={() => loadNotes(viewMode)}
              loading={loading}
            />
            {canCreate && viewMode === 'active' && (
              <Button size="sm" className="flex items-center gap-2" onClick={openCreateEditor}>
                <Plus className="w-4 h-4" />
                Add Entry
              </Button>
            )}
          </div>
        </div>

        {loading && (
          <Card className="p-6 text-sm text-gray-500">Loading treatment plan notes...</Card>
        )}

        {!loading && treatmentPlanNotes.length === 0 && (
          <Card className="p-6 text-sm text-gray-500">
            {viewMode === 'trashed' ? 'Treatment plan bin is empty.' : 'No treatment plan entries found for this patient.'}
          </Card>
        )}

        <div className="space-y-4">
          {treatmentPlanNotes.map((note) => (
            <Card key={note.id} className="p-4 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className="font-bold text-sm text-gray-900">{note.author_name || 'Unknown Author'}</span>
                  <Badge variant="neutral" className="ml-2">{note.note_type || 'NOTE'}</Badge>
                  {note.execution_status && <Badge variant="blue" className="ml-2">{note.execution_status}</Badge>}
                </div>
                <span className="text-xs text-gray-400">{formatDateTime(note.created_at)}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3 text-xs text-gray-600">
                <div><span className="font-semibold text-gray-700">Procedure:</span> {note.plan_procedure || '-'}</div>
                <div><span className="font-semibold text-gray-700">Planned For:</span> {formatDateTime(note.planned_for)}</div>
                <div><span className="font-semibold text-gray-700">Executed At:</span> {formatDateTime(note.executed_at)}</div>
                <div><span className="font-semibold text-gray-700">Outcome:</span> {note.outcome_notes || '-'}</div>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{note.content}</p>
              <RecordAuditDetails record={note} />
              {Boolean(note.is_verified) && <p className="text-xs text-green-700 mt-3">Verified by {note.verifier_name || 'Supervisor'}</p>}
              {(canEditEntries || canDelete) && viewMode === 'active' && (
                <div className="mt-3 flex items-center gap-2">
                  {canEditEntries && (
                    <Button variant="secondary" size="sm" className="h-9 px-3" onClick={() => startEdit(note)}>
                      <Pencil className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                  )}
                  {canDelete && (
                    <Button variant="danger" size="sm" className="h-9 px-3" onClick={() => onDelete(note.id, false)}>
                      <Trash2 className="w-4 h-4 mr-1" />
                      Delete
                    </Button>
                  )}
                </div>
              )}
              {canDelete && viewMode === 'trashed' && (
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="bg-green-600 text-white hover:bg-green-700 active:bg-green-800 border-0"
                    onClick={() => onRestore(note.id)}
                  >
                    <RotateCcw className="w-4 h-4 mr-1" />
                    Restore
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => onDelete(note.id, true)}>
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete Permanently
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>

      {confirmDialog.open && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
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
                    onChange={(e) => setConfirmDialog((prev) => ({ ...prev, acknowledged: e.target.checked }))}
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

      <EntryEditorModal
        open={editorOpen}
        title={editingId ? 'Edit Treatment Plan Entry' : 'Add Treatment Plan Entry'}
        onClose={closeEditor}
      >
        <div className="space-y-5">
          <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-5 space-y-4">
            <h5 className="text-sm font-semibold text-gray-900">Treatment Plan</h5>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-600">Entry type</label>
              <select
                className="h-11 w-full rounded-md border border-gray-200 bg-white px-4 py-2 text-sm"
                value={noteType}
                onChange={(e) => setNoteType(e.target.value)}
              >
                <option value="PROGRESS">Progress</option>
                <option value="TREATMENT">Treatment</option>
                <option value="OBSERVATION">Observation</option>
                {role === 'ORTHODONTIST' && <option value="SUPERVISOR_REVIEW">Supervisor Review</option>}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-600">Planned procedure</label>
              <Input className="h-11 px-4" value={planProcedure} onChange={(e) => setPlanProcedure(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-600">Planned date and time</label>
                <div className="flex items-center gap-2">
                  <input
                    ref={plannedForRef}
                    type="datetime-local"
                    value={plannedFor}
                    onChange={(e) => setPlannedFor(e.target.value)}
                    className="sr-only"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-11 w-11 p-0 shrink-0"
                    onClick={() => openDateTimePicker(plannedForRef.current)}
                    title={plannedFor || 'Select planned date and time'}
                  >
                    <Calendar className="w-4 h-4" />
                  </Button>
                  <span className="min-h-11 flex-1 rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">{formatDateTime(plannedFor)}</span>
                  {plannedFor && (
                    <Button type="button" variant="secondary" size="sm" className="h-9 px-3" onClick={() => setPlannedFor('')}>
                      Clear
                    </Button>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-600">Executed date and time</label>
                <div className="flex items-center gap-2">
                  <input
                    ref={executedAtRef}
                    type="datetime-local"
                    value={executedAt}
                    onChange={(e) => setExecutedAt(e.target.value)}
                    className="sr-only"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-11 w-11 p-0 shrink-0"
                    onClick={() => openDateTimePicker(executedAtRef.current)}
                    title={executedAt || 'Select executed date and time'}
                  >
                    <Calendar className="w-4 h-4" />
                  </Button>
                  <span className="min-h-11 flex-1 rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">{formatDateTime(executedAt)}</span>
                  {executedAt && (
                    <Button type="button" variant="secondary" size="sm" className="h-9 px-3" onClick={() => setExecutedAt('')}>
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-600">Execution status</label>
              <select
                className="h-11 w-full rounded-md border border-gray-200 bg-white px-4 py-2 text-sm"
                value={executionStatus}
                onChange={(e) => setExecutionStatus(e.target.value)}
              >
                <option value="PLANNED">Planned</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
                <option value="PARTIAL">Partial</option>
                <option value="FAILED">Failed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-5 space-y-4">
            <h5 className="text-sm font-semibold text-gray-900">Treatment Note</h5>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-600">Outcome or success note</label>
              <textarea
                value={outcomeNotes}
                onChange={(e) => setOutcomeNotes(e.target.value)}
                className="w-full min-h-[120px] resize-y rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-600">Detailed treatment note</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full min-h-[190px] resize-y rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeEditor} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={addNote} disabled={saving || (!content.trim() && !planProcedure.trim())}>
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Entry'}
            </Button>
          </div>
        </div>
      </EntryEditorModal>
    </div>
  );
}
