import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { AlertCircle, CheckCircle2, UserCheck, UserX } from 'lucide-react';
import { apiService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Button } from './UI';
import { toast } from 'sonner';

type PendingAssignmentRequest = {
  id: number;
  patient_id: number;
  patient_code?: string;
  first_name?: string;
  last_name?: string;
  target_role: 'ORTHODONTIST' | 'DENTAL_SURGEON';
  action_type: 'ASSIGN' | 'REMOVE';
  requested_by_name?: string;
  created_at?: string;
};

export function AssignmentRequestPrompt() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState<PendingAssignmentRequest[]>([]);
  const [processingId, setProcessingId] = useState<number | null>(null);

  const canReviewRequests = ['ORTHODONTIST', 'DENTAL_SURGEON'].includes(user?.role || '');

  const loadPending = async () => {
    if (!canReviewRequests) return;
    setLoading(true);
    try {
      const response = await apiService.patients.getPendingAssignmentRequests();
      setRequests(response.data || []);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canReviewRequests) return;
    loadPending();
    const timer = window.setInterval(loadPending, 30000);
    return () => window.clearInterval(timer);
  }, [canReviewRequests]);

  const current = useMemo(() => requests[0] || null, [requests]);

  const respond = async (decision: 'APPROVE' | 'REJECT') => {
    if (!current) return;
    setProcessingId(current.id);
    try {
      await apiService.patients.respondToAssignmentRequest(String(current.id), decision);
      toast.success(
        decision === 'APPROVE'
          ? 'Assignment change approved'
          : 'Assignment change rejected'
      );
      await loadPending();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to submit response');
    } finally {
      setProcessingId(null);
    }
  };

  if (!canReviewRequests || !current) return null;

  const patientLabel = `${current.first_name || ''} ${current.last_name || ''}`.trim() || `Patient #${current.patient_id}`;
  const actionLabel = current.action_type === 'ASSIGN' ? 'assign you to' : 'remove you from';
  const isAssignRequest = current.action_type === 'ASSIGN';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 backdrop-blur-[1px] p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        <div className={`px-5 py-4 border-b ${isAssignRequest ? 'border-green-100 bg-green-50' : 'border-red-100 bg-red-50'}`}>
          <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
            <AlertCircle className={`w-5 h-5 ${isAssignRequest ? 'text-green-600' : 'text-red-600'}`} />
            Assignment Confirmation Required
          </h3>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className={`rounded-lg border px-3 py-3 text-sm ${
            isAssignRequest
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}>
            Receptionist <strong>{current.requested_by_name || 'staff member'}</strong> requested to{' '}
            <strong>{actionLabel}</strong> <strong>{patientLabel}</strong>
            {current.patient_code ? ` (${current.patient_code})` : ''}.
            {' '}Please approve or reject this change.
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => navigate(`/patients/${current.patient_id}`)}
            >
              Open Patient Record
            </Button>
            <span className="text-xs text-slate-500">
              {loading ? 'Refreshing requests...' : `${requests.length} pending`}
            </span>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              className="bg-red-600 border-red-600 hover:bg-red-700 active:bg-red-800"
              onClick={() => respond('REJECT')}
              disabled={processingId === current.id}
            >
              <UserX className="w-4 h-4 mr-1" />
              Reject
            </Button>
            <Button
              className="bg-green-600 border-green-600 hover:bg-green-700 active:bg-green-800"
              onClick={() => respond('APPROVE')}
              disabled={processingId === current.id}
            >
              <UserCheck className="w-4 h-4 mr-1" />
              {processingId === current.id ? 'Submitting...' : 'Approve'}
            </Button>
          </div>
          <p className="text-xs text-slate-500 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            This popup appears only for orthodontists and dental surgeons for receptionist-requested assignment changes.
          </p>
        </div>
      </div>
    </div>
  );
}
