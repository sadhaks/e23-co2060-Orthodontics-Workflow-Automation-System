import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Card, Badge, Button, Table, Input } from '../components/UI';
import { ArrowLeft, User, Calendar, FileText, Grid, Upload, Plus, RefreshCw, Trash2, RotateCcw } from 'lucide-react';
import { DentalChart } from '../components/DentalChart';
import { DocumentPortal } from '../components/DocumentPortal';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { toast } from 'sonner';

type TabId = 'overview' | 'visits' | 'history' | 'chart' | 'documents' | 'diagnosis' | 'notes';

const canEditMedical = (role?: string) => ['ORTHODONTIST', 'DENTAL_SURGEON', 'STUDENT'].includes(role || '');
const canCreateNotes = (role?: string) => ['ORTHODONTIST', 'DENTAL_SURGEON', 'STUDENT'].includes(role || '');
const canDeleteNotes = (role?: string) => role === 'ORTHODONTIST';
const canUploadDocuments = (role?: string) => ['ORTHODONTIST', 'DENTAL_SURGEON', 'STUDENT'].includes(role || '');
const canDeleteDocuments = (role?: string) => role === 'ORTHODONTIST';
const canManageAppointments = (role?: string) => ['RECEPTION'].includes(role || '');
const canReadDentalChart = (role?: string) => ['ORTHODONTIST', 'DENTAL_SURGEON', 'STUDENT', 'ADMIN'].includes(role || '');
const canReadDocuments = (role?: string) => ['ORTHODONTIST', 'DENTAL_SURGEON', 'STUDENT', 'ADMIN'].includes(role || '');
const canReadDiagnosis = (role?: string) => ['ORTHODONTIST', 'DENTAL_SURGEON', 'STUDENT', 'ADMIN'].includes(role || '');
const canSeeDiagnosisTab = (role?: string) => ['ORTHODONTIST', 'DENTAL_SURGEON', 'STUDENT', 'ADMIN', 'NURSE', 'RECEPTION'].includes(role || '');
const canReadTreatmentNotes = (role?: string) => ['ORTHODONTIST', 'DENTAL_SURGEON', 'STUDENT', 'ADMIN', 'RECEPTION'].includes(role || '');
const canReadPatientHistory = (role?: string) => ['ORTHODONTIST', 'DENTAL_SURGEON', 'STUDENT', 'ADMIN'].includes(role || '');

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

  const tabs = [
    { id: 'overview', label: 'Overview', icon: User },
    { id: 'visits', label: 'Visits', icon: Calendar },
    { id: 'history', label: 'Patient History', icon: FileText },
    { id: 'chart', label: 'Dental Chart', icon: Grid },
    { id: 'documents', label: 'Documents', icon: Upload },
    ...(canSeeDiagnosisTab(user?.role) ? [{ id: 'diagnosis', label: 'Diagnosis', icon: FileText }] : []),
    { id: 'notes', label: 'Treatment Plan & Notes', icon: FileText },
  ];

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
        {tabs.map((tab) => (
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
            <Input
              type="datetime-local"
              value={appointmentDate}
              onChange={(e) => setAppointmentDate(e.target.value)}
            />
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
              <td className="px-6 py-4"><Badge variant={statusVariant(v.status)}>{v.status}</Badge></td>
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

  const addDiagnosis = async () => {
    if (viewMode !== 'active') {
      toast.info('Switch to active view to add diagnosis details');
      return;
    }
    if (!content.trim()) return;
    setSaving(true);
    try {
      await apiService.clinicalNotes.create(patientId, { content: content.trim(), note_type: 'DIAGNOSIS' });
      setContent('');
      toast.success('Diagnosis note added');
      await onCreated();
      await loadNotes(viewMode);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to add diagnosis note');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: number, permanent = false) => {
    const confirmed = window.confirm(
      permanent
        ? 'Permanently delete this diagnosis note? This cannot be undone.'
        : 'Move this diagnosis note to bin?'
    );
    if (!confirmed) return;

    try {
      await apiService.clinicalNotes.delete(String(id), permanent);
      toast.success(permanent ? 'Diagnosis note permanently deleted' : 'Diagnosis note moved to bin');
      await loadNotes(viewMode);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete diagnosis note');
    }
  };

  const onRestore = async (id: number) => {
    try {
      await apiService.clinicalNotes.restore(String(id));
      toast.success('Diagnosis note restored');
      await loadNotes(viewMode);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to restore diagnosis note');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <div className="lg:col-span-3 space-y-4">
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
            <Button variant="secondary" size="sm" onClick={() => loadNotes(viewMode)} disabled={loading}>
              <RefreshCw className="w-4 h-4 mr-1" />
              Refresh
            </Button>
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
            {canDelete && viewMode === 'active' && (
              <div className="mt-3">
                <Button variant="danger" size="sm" onClick={() => onDelete(note.id, false)}>
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete
                </Button>
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

      <div>
        <Card className="p-5">
          <h4 className="text-xs font-bold text-gray-400 uppercase mb-4">New Diagnosis</h4>
          {canCreate && viewMode === 'active' ? (
            <div className="space-y-3">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Enter diagnosis details clearly..."
                className="w-full min-h-[220px] resize-y rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
              <Button size="sm" className="w-full" onClick={addDiagnosis} disabled={saving || !content.trim()}>
                {saving ? 'Saving...' : 'Add Diagnosis'}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-gray-500">
              {viewMode === 'trashed'
                ? 'Bin mode is read-only for diagnosis creation.'
                : 'You can view diagnosis details but do not have permission to create them.'}
            </p>
          )}
        </Card>
      </div>
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
  const [content, setContent] = useState('');
  const [noteType, setNoteType] = useState('PROGRESS');
  const [planProcedure, setPlanProcedure] = useState('');
  const [plannedFor, setPlannedFor] = useState('');
  const [executedAt, setExecutedAt] = useState('');
  const [executionStatus, setExecutionStatus] = useState('PLANNED');
  const [outcomeNotes, setOutcomeNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'active' | 'trashed'>('active');
  const [trashCount, setTrashCount] = useState(0);
  const [notesData, setNotesData] = useState<any[]>(notes || []);
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

  const addNote = async () => {
    if (!content.trim() && !planProcedure.trim()) return;
    setSaving(true);
    try {
      await apiService.clinicalNotes.create(patientId, {
        content: content.trim() || 'Treatment plan entry',
        note_type: noteType,
        plan_procedure: planProcedure.trim() || undefined,
        planned_for: plannedFor || undefined,
        executed_at: executedAt || undefined,
        execution_status: executionStatus || undefined,
        outcome_notes: outcomeNotes.trim() || undefined
      });
      setContent('');
      setNoteType('PROGRESS');
      setPlanProcedure('');
      setPlannedFor('');
      setExecutedAt('');
      setExecutionStatus('PLANNED');
      setOutcomeNotes('');
      toast.success('Treatment plan entry added');
      await onCreated();
      await loadNotes(viewMode);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to add treatment plan entry');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: number, permanent = false) => {
    const confirmed = window.confirm(
      permanent
        ? 'Permanently delete this treatment plan note? This cannot be undone.'
        : 'Move this treatment plan note to bin?'
    );
    if (!confirmed) return;
    try {
      await apiService.clinicalNotes.delete(String(id), permanent);
      toast.success(permanent ? 'Treatment plan note permanently deleted' : 'Treatment plan note moved to bin');
      await loadNotes(viewMode);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete treatment plan note');
    }
  };

  const onRestore = async (id: number) => {
    try {
      await apiService.clinicalNotes.restore(String(id));
      toast.success('Treatment plan note restored');
      await loadNotes(viewMode);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to restore treatment plan note');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <div className="lg:col-span-3 space-y-6">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-gray-900">Treatment Plan Timeline</h4>
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
            <Button variant="secondary" size="sm" onClick={() => loadNotes(viewMode)} disabled={loading}>
              <RefreshCw className="w-4 h-4 mr-1" />
              Refresh
            </Button>
            {canCreate && viewMode === 'active' && (
              <Button size="sm" className="flex items-center gap-2" onClick={addNote} disabled={saving || (!content.trim() && !planProcedure.trim())}>
                <Plus className="w-4 h-4" />
                {saving ? 'Saving...' : 'Add Plan Entry'}
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
              {Boolean(note.is_verified) && <p className="text-xs text-green-700 mt-3">Verified by {note.verifier_name || 'Supervisor'}</p>}
              {canDelete && viewMode === 'active' && (
                <div className="mt-3">
                  <Button variant="danger" size="sm" onClick={() => onDelete(note.id, false)}>
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
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

      <div className="space-y-6">
        <Card className="p-5">
          <h4 className="text-xs font-bold text-gray-400 uppercase mb-4">New Plan Entry</h4>
          {canCreate && viewMode === 'active' ? (
            <div className="space-y-3">
              <select
                className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                value={noteType}
                onChange={(e) => setNoteType(e.target.value)}
              >
                <option value="PROGRESS">Progress</option>
                <option value="TREATMENT">Treatment</option>
                <option value="OBSERVATION">Observation</option>
                {role === 'ORTHODONTIST' && <option value="SUPERVISOR_REVIEW">Supervisor Review</option>}
              </select>
              <Input
                placeholder="Planned procedure"
                value={planProcedure}
                onChange={(e) => setPlanProcedure(e.target.value)}
              />
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Planned date/time</label>
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
                    className="h-9 w-9 p-0"
                    onClick={() => openDateTimePicker(plannedForRef.current)}
                    title={plannedFor || 'Select planned date and time'}
                  >
                    <Calendar className="w-4 h-4" />
                  </Button>
                  <span className="text-xs text-gray-600 flex-1">{formatDateTime(plannedFor)}</span>
                  {plannedFor && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      onClick={() => setPlannedFor('')}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Executed date/time</label>
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
                    className="h-9 w-9 p-0"
                    onClick={() => openDateTimePicker(executedAtRef.current)}
                    title={executedAt || 'Select executed date and time'}
                  >
                    <Calendar className="w-4 h-4" />
                  </Button>
                  <span className="text-xs text-gray-600 flex-1">{formatDateTime(executedAt)}</span>
                  {executedAt && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      onClick={() => setExecutedAt('')}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>
              <select
                className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
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
              <textarea
                value={outcomeNotes}
                onChange={(e) => setOutcomeNotes(e.target.value)}
                placeholder="Outcome/success notes..."
                className="w-full min-h-[80px] resize-y rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Treatment plan and notes..."
                className="w-full min-h-[120px] resize-y rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>
          ) : (
            <p className="text-xs text-gray-500">
              {viewMode === 'trashed'
                ? 'Bin mode is read-only for note creation.'
                : 'You can view treatment plan and notes but do not have permission to create them.'}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
