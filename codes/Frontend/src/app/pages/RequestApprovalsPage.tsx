import { useEffect, useState } from 'react';
import { CheckCircle2, FolderOpen, XCircle } from 'lucide-react';
import { Card, Badge, Button, RefreshButton } from '../components/UI';
import { apiService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Navigate, useNavigate } from 'react-router';

type PendingRequest = {
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

export function RequestApprovalsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [confirmDecision, setConfirmDecision] = useState<{
    request: PendingRequest | null;
    decision: 'APPROVE' | 'REJECT' | null;
  }>({ request: null, decision: null });

  const canView = ['ORTHODONTIST', 'DENTAL_SURGEON'].includes(user?.role || '');
  if (!canView) return <Navigate to="/" replace />;

  const loadRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiService.patients.getPendingAssignmentRequests();
      const rows = response.data || [];
      setRequests(rows);
      window.dispatchEvent(
        new CustomEvent('assignment-requests-updated', {
          detail: { count: Array.isArray(rows) ? rows.length : 0 }
        })
      );
    } catch (err: any) {
      setError(err?.message || 'Failed to load pending assignment requests');
      setRequests([]);
      window.dispatchEvent(
        new CustomEvent('assignment-requests-updated', {
          detail: { count: 0 }
        })
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const getPatientName = (request: PendingRequest) => (
    `${request.first_name || ''} ${request.last_name || ''}`.trim() || `Patient #${request.patient_id}`
  );

  const respond = async (requestId: number, decision: 'APPROVE' | 'REJECT') => {
    setProcessingId(requestId);
    try {
      await apiService.patients.respondToAssignmentRequest(String(requestId), decision);
      await loadRequests();
      return true;
    } catch (err: any) {
      setError(err?.message || 'Failed to submit approval decision');
      return false;
    } finally {
      setProcessingId(null);
    }
  };

  const closeConfirmDialog = () => {
    if (processingId !== null) return;
    setConfirmDecision({ request: null, decision: null });
  };

  const runConfirmedDecision = async () => {
    if (!confirmDecision.request || !confirmDecision.decision) return;
    const success = await respond(confirmDecision.request.id, confirmDecision.decision);
    if (success) {
      setConfirmDecision({ request: null, decision: null });
    }
  };

  const confirmRequest = confirmDecision.request;
  const confirmIsApprove = confirmDecision.decision === 'APPROVE';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Request Approvals</h2>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <Card className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Pending Requests: <span className="font-semibold text-gray-900">{requests.length}</span>
          </div>
          <RefreshButton size="sm" onClick={loadRequests} loading={loading} />
        </div>
        <div className="divide-y divide-gray-100">
          {!loading && requests.length === 0 && (
            <div className="px-6 py-12 text-center text-gray-500">No pending assignment requests.</div>
          )}

          {requests.map((req) => {
            const patientName = getPatientName(req);
            const isAssign = req.action_type === 'ASSIGN';
            return (
              <div
                key={req.id}
                className={`px-6 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                  isAssign ? 'bg-green-50 border-l-4 border-green-500' : 'bg-red-50 border-l-4 border-red-500'
                }`}
              >
                <div className="space-y-1">
                  <p className="font-semibold text-gray-900">
                    {patientName} {req.patient_code ? `(${req.patient_code})` : ''}
                  </p>
                  <p className="text-sm text-gray-600">
                    Requested by {req.requested_by_name || 'Reception'} • {String(req.created_at || '').slice(0, 16).replace('T', ' ')}
                  </p>
                  <div className="flex items-center gap-2">
                    <Badge variant={isAssign ? 'success' : 'error'}>
                      {isAssign ? 'Assignment Request' : 'Removal Request'}
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {!isAssign && (
                    <Button
                      size="sm"
                      className="bg-blue-600 border-blue-600 text-white shadow-sm hover:bg-blue-700 active:bg-blue-800"
                      onClick={() => navigate(`/patients/${req.patient_id}`)}
                    >
                      <FolderOpen className="w-4 h-4 mr-1" />
                      Open Patient
                    </Button>
                  )}
                  <Button
                    size="sm"
                    className="bg-green-600 border-green-600 hover:bg-green-700 active:bg-green-800"
                    onClick={() => setConfirmDecision({ request: req, decision: 'APPROVE' })}
                    disabled={processingId === req.id}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    {processingId === req.id ? 'Submitting...' : 'Approve'}
                  </Button>
                  <Button
                    size="sm"
                    className="bg-red-600 border-red-600 hover:bg-red-700 active:bg-red-800"
                    onClick={() => setConfirmDecision({ request: req, decision: 'REJECT' })}
                    disabled={processingId === req.id}
                  >
                    <XCircle className="w-4 h-4 mr-1" />
                    Reject
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {confirmRequest && confirmDecision.decision && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/45 backdrop-blur-[1px] p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            <div className={`px-5 py-4 border-b ${confirmIsApprove ? 'border-green-100 bg-green-50' : 'border-red-100 bg-red-50'}`}>
              <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                {confirmIsApprove ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600" />
                )}
                {confirmIsApprove ? 'Approve Request' : 'Reject Request'}
              </h3>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className={`rounded-lg border px-3 py-3 text-sm ${
                confirmIsApprove
                  ? 'border-green-200 bg-green-50 text-green-800'
                  : 'border-red-200 bg-red-50 text-red-800'
              }`}>
                Confirm that you want to {confirmIsApprove ? 'approve' : 'reject'} this{' '}
                {confirmRequest.action_type === 'ASSIGN' ? 'assignment' : 'removal'} request for{' '}
                <strong>{getPatientName(confirmRequest)}</strong>
                {confirmRequest.patient_code ? ` (${confirmRequest.patient_code})` : ''}.
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={closeConfirmDialog} disabled={processingId !== null}>
                  Cancel
                </Button>
                <Button
                  className={
                    confirmIsApprove
                      ? 'bg-green-600 border-green-600 hover:bg-green-700 active:bg-green-800'
                      : 'bg-red-600 border-red-600 hover:bg-red-700 active:bg-red-800'
                  }
                  onClick={runConfirmedDecision}
                  disabled={processingId !== null}
                >
                  {confirmIsApprove ? (
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                  ) : (
                    <XCircle className="w-4 h-4 mr-1" />
                  )}
                  {processingId !== null ? 'Submitting...' : confirmIsApprove ? 'Approve' : 'Reject'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
