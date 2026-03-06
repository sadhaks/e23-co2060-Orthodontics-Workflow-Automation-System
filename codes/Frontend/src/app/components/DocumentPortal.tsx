import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, Button, Badge } from './UI';
import { Upload, File, Image as ImageIcon, FileText, Download, RefreshCw, Trash2, RotateCcw, Loader2 } from 'lucide-react';
import { apiService } from '../services/api';
import { toast } from 'sonner';

type PatientDocument = {
  id: number;
  type: 'RADIOGRAPH' | 'NOTE' | 'SCAN' | 'PHOTO';
  original_filename: string;
  file_size: number;
  mime_type: string;
  created_at: string;
  uploaded_by_name?: string;
  deleted_at?: string | null;
  deleted_by_name?: string | null;
};

type Props = {
  patientId: string;
  canUpload: boolean;
  canDelete: boolean;
};

const MAX_FILES_PER_BATCH = 10;
const MAX_BATCH_SIZE_BYTES = 100 * 1024 * 1024;

const getDocType = (file: File): PatientDocument['type'] => {
  if (file.type.startsWith('image/')) {
    return file.type.includes('dicom') ? 'RADIOGRAPH' : 'PHOTO';
  }
  if (file.type.includes('pdf') || file.type.includes('word') || file.type.includes('text')) {
    return 'NOTE';
  }
  return 'SCAN';
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export function DocumentPortal({ patientId, canUpload, canDelete }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [documents, setDocuments] = useState<PatientDocument[]>([]);
  const [downloadingDocId, setDownloadingDocId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'active' | 'trashed'>('active');
  const [trashCount, setTrashCount] = useState(0);
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

  const refreshTrashCount = async () => {
    if (!canDelete) return;
    try {
      const response = await apiService.documents.getPatientDocuments(patientId, {
        page: 1,
        limit: 1,
        deleted: 'trashed',
      });
      const total = response.data?.pagination?.total_records;
      setTrashCount(typeof total === 'number' ? total : (response.data?.documents || []).length);
    } catch {
      setTrashCount(0);
    }
  };

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const response = await apiService.documents.getPatientDocuments(patientId, {
        page: 1,
        limit: 100,
        deleted: viewMode,
      });
      setDocuments(response.data?.documents || response.data?.items || []);
      await refreshTrashCount();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load documents');
      setDocuments([]);
      setTrashCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [patientId, viewMode]);

  const uploadFiles = async (files: File[]) => {
    if (!canUpload || viewMode === 'trashed') {
      toast.error('You do not have permission to upload documents');
      return;
    }

    if (!files.length) return;
    if (files.length > MAX_FILES_PER_BATCH) {
      toast.error(`You can upload up to ${MAX_FILES_PER_BATCH} files at a time`);
      return;
    }
    const batchSize = files.reduce((sum, file) => sum + file.size, 0);
    if (batchSize > MAX_BATCH_SIZE_BYTES) {
      toast.error('Total selected file size exceeds 100 MB limit');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    try {
      const perFileProgress = new Array(files.length).fill(0);
      await Promise.all(
        files.map((file, index) =>
          apiService.documents.upload(
            patientId,
            file,
            {
              type: getDocType(file),
              description: `Uploaded via patient document portal: ${file.name}`,
            },
            (percent) => {
              perFileProgress[index] = Math.min(100, Math.max(0, percent));
              const overall = Math.round(
                perFileProgress.reduce((sum, value) => sum + value, 0) / files.length
              );
              setUploadProgress(Math.min(100, Math.max(0, overall)));
            }
          )
        )
      );
      toast.success(`${files.length} document(s) uploaded successfully`);
      await loadDocuments();
    } catch (error: any) {
      toast.error(error?.message || 'Document upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files || []);
    uploadFiles(dropped);
  }, [patientId, canUpload, viewMode]);

  const onInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    await uploadFiles(selected);
    e.target.value = '';
  };

  const onDownload = async (id: number) => {
    setDownloadingDocId(id);
    try {
      await apiService.documents.download(String(id));
      toast.success('Download started');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to download document');
    } finally {
      setDownloadingDocId(null);
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
      acknowledged: false,
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
      title: permanent ? 'Permanently Delete Document' : 'Delete Document',
      message: permanent
        ? 'This will permanently delete this document from the recycle bin. This action cannot be undone.'
        : 'This document will be moved to the recycle bin. You can restore it later.',
      confirmText: permanent ? 'Delete Permanently' : 'Delete Document',
      tone: permanent ? 'danger' : 'warning',
      requireAcknowledge: permanent,
      acknowledgeText: 'I understand this permanent deletion cannot be undone.',
      onConfirm: async () => {
        try {
          await apiService.documents.delete(String(id), permanent);
          toast.success(permanent ? 'Document permanently deleted' : 'Document moved to trash');
          await loadDocuments();
        } catch (error: any) {
          toast.error(error?.message || (permanent ? 'Failed to permanently delete document' : 'Failed to move document to trash'));
          throw error;
        }
      }
    });
  };

  const onRestore = (id: number) => {
    openConfirmDialog({
      title: 'Restore Document',
      message: 'This document will be restored to active documents.',
      confirmText: 'Restore Document',
      tone: 'info',
      onConfirm: async () => {
        try {
          await apiService.documents.restore(String(id));
          toast.success('Document restored');
          await loadDocuments();
        } catch (error: any) {
          toast.error(error?.message || 'Failed to restore document');
          throw error;
        }
      }
    });
  };

  const summary = useMemo(() => {
    return {
      total: documents.length,
    };
  }, [documents]);

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (canUpload) setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={`relative border-2 border-dashed rounded-2xl p-10 text-center transition-all ${
            canUpload
              ? isDragging
                ? 'border-blue-500 bg-blue-50'
                : 'border-slate-300 bg-slate-50'
              : 'border-slate-200 bg-slate-50 opacity-80'
          }`}
        >
          <Upload className="w-10 h-10 mx-auto text-slate-500 mb-3" />
          <h3 className="text-lg font-bold text-slate-900">Patient Documents</h3>
          <p className="text-sm text-slate-500 mt-2">
            Drag and drop files, or click to upload. Up to 10 files per batch (max 100MB total).
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Badge variant="blue">Any File Type</Badge>
            <Badge variant="neutral">Stored in Database</Badge>
            <Badge variant="success">Download Enabled</Badge>
          </div>
          {uploading && (
            <div className="mt-4 max-w-md mx-auto">
              <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                <span>Uploading...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-[width] duration-150"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
          <input
            type="file"
            multiple
            disabled={!canUpload || uploading || viewMode === 'trashed'}
            className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
            onChange={onInputChange}
          />
        </div>

        <Card>
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h4 className="font-bold text-slate-900">Recent Documents</h4>
            <div className="flex items-center gap-2">
              {canDelete && (
                <Button
                  variant={viewMode === 'trashed' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setViewMode(viewMode === 'active' ? 'trashed' : 'active')}
                  disabled={loading}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  {viewMode === 'active' ? 'View Trash' : 'View Active'}
                  {viewMode === 'active' && trashCount > 0 && (
                    <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {trashCount}
                    </span>
                  )}
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={loadDocuments} disabled={loading}>
                <RefreshCw className="w-4 h-4 mr-1" />
                Refresh
              </Button>
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {loading && <div className="p-6 text-sm text-gray-500">Loading documents...</div>}
            {!loading && documents.length === 0 && (
              <div className="p-6 text-sm text-gray-500">
                {viewMode === 'trashed'
                  ? 'Trash is empty for this patient.'
                  : 'No documents uploaded for this patient yet.'}
              </div>
            )}
            {!loading && documents.map((doc) => (
              <div key={doc.id} className="p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center">
                  {doc.mime_type?.startsWith('image/') ? (
                    <ImageIcon className="w-4 h-4 text-blue-600" />
                  ) : doc.type === 'NOTE' ? (
                    <FileText className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <File className="w-4 h-4 text-slate-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{doc.original_filename}</p>
                  <p className="text-xs text-slate-500">
                    {formatFileSize(doc.file_size)} • {doc.type} • {String(doc.created_at).slice(0, 10)}
                    {doc.uploaded_by_name ? ` • ${doc.uploaded_by_name}` : ''}
                    {doc.deleted_at ? ` • deleted ${String(doc.deleted_at).slice(0, 10)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {viewMode === 'active' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onDownload(doc.id)}
                      disabled={downloadingDocId === doc.id}
                    >
                      {downloadingDocId === doc.id ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                          Preparing...
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4 mr-1" />
                          Download
                        </>
                      )}
                    </Button>
                  )}
                  {canDelete && viewMode === 'active' && (
                    <Button variant="danger" size="sm" onClick={() => onDelete(doc.id, false)}>
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
                        onClick={() => onRestore(doc.id)}
                      >
                        <RotateCcw className="w-4 h-4 mr-1" />
                        Restore
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => onDelete(doc.id, true)}>
                        <Trash2 className="w-4 h-4 mr-1" />
                        Delete Permanently
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="p-5">
          <h4 className="text-xs font-bold text-slate-500 uppercase mb-4">Summary</h4>
          <div className="space-y-2 text-sm text-slate-700">
            <p>Total documents: <span className="font-bold">{summary.total}</span></p>
          </div>
        </Card>
      </div>
      </div>

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
    </>
  );
}
