import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
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

  const respond = async (requestId: number, decision: 'APPROVE' | 'REJECT') => {
    setProcessingId(requestId);
    try {
      await apiService.patients.respondToAssignmentRequest(String(requestId), decision);
      await loadRequests();
    } catch (err: any) {
      setError(err?.message || 'Failed to submit approval decision');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Request Approvals</h2>
        <p className="text-gray-500">Review receptionist-requested assignment changes for your account.</p>
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
            const patientName = `${req.first_name || ''} ${req.last_name || ''}`.trim() || `Patient #${req.patient_id}`;
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
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate(`/patients/${req.patient_id}`)}
                  >
                    Open Patient
                  </Button>
                  <Button
                    size="sm"
                    className="bg-red-600 border-red-600 hover:bg-red-700 active:bg-red-800"
                    onClick={() => respond(req.id, 'REJECT')}
                    disabled={processingId === req.id}
                  >
                    <XCircle className="w-4 h-4 mr-1" />
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    className="bg-green-600 border-green-600 hover:bg-green-700 active:bg-green-800"
                    onClick={() => respond(req.id, 'APPROVE')}
                    disabled={processingId === req.id}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    {processingId === req.id ? 'Submitting...' : 'Approve'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
