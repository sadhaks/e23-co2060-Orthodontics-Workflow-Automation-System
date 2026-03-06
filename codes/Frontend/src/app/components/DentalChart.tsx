import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Badge, Button, Input } from './UI';
import { AlertCircle, CheckCircle2, Download, Info, Loader2, RotateCcw, Save, Trash2 } from 'lucide-react';
import { apiService } from '../services/api';
import { toast } from 'sonner';

type ToothStatus = 'HEALTHY' | 'PATHOLOGY' | 'PLANNED' | 'TREATED' | 'MISSING';
type ToothType = 'molar' | 'premolar' | 'canine' | 'incisor';
type Dentition = 'ADULT' | 'MILK';

type DentalEntry = {
  tooth_code: string;
  dentition: Dentition;
  notation_x: string;
  notation_y: string;
  status: ToothStatus;
  is_pathology: boolean;
  is_planned: boolean;
  is_treated: boolean;
  is_missing: boolean;
  pathology?: string | null;
  treatment?: string | null;
  event_date?: string | null;
  updated_by_name?: string;
};

type ToothDescriptor = {
  key: string;
  dentition: Dentition;
  notationX: string;
  notationY: string;
  type: ToothType;
};

type Props = {
  patientId: string;
  canEdit: boolean;
  role?: string;
};

type DentalChartVersion = {
  id: number;
  patient_id: number;
  version_label: string;
  entry_count: number;
  annotated_by: number;
  annotated_by_name?: string | null;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
};

const CONDITION_COLORS = {
  pathology: { stroke: '#ef4444', fill: '#fee2e2' },
  planned: { stroke: '#2563eb', fill: '#dbeafe' },
  treated: { stroke: '#16a34a', fill: '#dcfce7' },
  missing: { stroke: '#94a3b8', fill: '#f1f5f9' },
  healthy: { stroke: '#cbd5e1', fill: '#ffffff' },
};

const getAdultToothType = (num: number): ToothType => {
  if ([1, 2, 3, 14, 15, 16, 17, 18, 19, 30, 31, 32].includes(num)) return 'molar';
  if ([4, 5, 12, 13, 20, 21, 28, 29].includes(num)) return 'premolar';
  if ([6, 11, 22, 27].includes(num)) return 'canine';
  return 'incisor';
};

const getMilkToothType = (notationY: string): ToothType => {
  if (notationY === 'E' || notationY === 'D') return 'molar';
  if (notationY === 'C') return 'canine';
  return 'incisor';
};

const getAdultNotation = (num: number): { x: string; y: string } => {
  if (num >= 1 && num <= 8) return { x: '1', y: String(9 - num) };
  if (num >= 9 && num <= 16) return { x: '2', y: String(num - 8) };
  if (num >= 17 && num <= 24) return { x: '3', y: String(25 - num) };
  return { x: '4', y: String(num - 24) };
};

const resolveFlags = (row: any): DentalEntry => {
  const status = String(row.status || 'HEALTHY').toUpperCase() as ToothStatus;
  return {
    tooth_code: String(row.tooth_code || ''),
    dentition: String(row.dentition || 'ADULT').toUpperCase() as Dentition,
    notation_x: String(row.notation_x || ''),
    notation_y: String(row.notation_y || ''),
    status,
    is_pathology: Boolean(row.is_pathology ?? status === 'PATHOLOGY'),
    is_planned: Boolean(row.is_planned ?? status === 'PLANNED'),
    is_treated: Boolean(row.is_treated ?? status === 'TREATED'),
    is_missing: Boolean(row.is_missing ?? status === 'MISSING'),
    pathology: row.pathology || null,
    treatment: row.treatment || null,
    event_date: row.event_date || null,
    updated_by_name: row.updated_by_name || undefined,
  };
};

const ToothSVG = ({
  id,
  entry,
  showConditions = true,
}: {
  id: string;
  entry?: DentalEntry;
  showConditions?: boolean;
}) => {
  const toothPath = 'M50 14C46 14 42 15 39 16.5C36.5 17.8 34.8 19.2 33.2 20.8C31.6 22.4 30.1 23.2 28.2 23.3C26.6 23.4 25 24.2 23.8 26C22 28.6 21 31.8 20.8 35.8C20.5 42 22 48.8 24.6 55C27.2 61.1 30.9 66.8 33 73.2C34.8 78.7 35 84.6 37.8 88.9C39.8 92 43 92.7 44.7 90.8C46.8 88.7 47.4 84.2 48.6 76.6C49 74.3 51 74.3 51.4 76.6C52.6 84.2 53.2 88.7 55.3 90.8C57 92.7 60.2 92 62.2 88.9C65 84.6 65.2 78.7 67 73.2C69.1 66.8 72.8 61.1 75.4 55C78 48.8 79.5 42 79.2 35.8C79 31.8 78 28.6 76.2 26C75 24.2 73.4 23.4 71.8 23.3C69.9 23.2 68.4 22.4 66.8 20.8C65.2 19.2 63.5 17.8 61 16.5C58 15 54 14 50 14Z';

  const colors = [];
  if (showConditions && entry?.is_pathology) colors.push(CONDITION_COLORS.pathology);
  if (showConditions && entry?.is_planned) colors.push(CONDITION_COLORS.planned);
  if (showConditions && entry?.is_treated) colors.push(CONDITION_COLORS.treated);

  const isMissing = Boolean(showConditions && entry?.is_missing);
  const hasConditions = colors.length > 0;
  const gradientId = `${id}-gradient`;
  const strokeGradientId = `${id}-stroke-gradient`;
  const crownGlowId = `${id}-crown-glow`;
  const sideShadeId = `${id}-side-shade`;

  const fillColor = !hasConditions
    ? CONDITION_COLORS.healthy.fill
    : colors.length === 1
      ? colors[0].fill
      : `url(#${gradientId})`;
  const strokeColor = isMissing
    ? CONDITION_COLORS.missing.stroke
    : hasConditions
      ? colors.length === 1
        ? colors[0].stroke
        : `url(#${strokeGradientId})`
      : CONDITION_COLORS.healthy.stroke;

  return (
    <svg viewBox="0 0 100 100" className="w-12 h-[4.1rem] md:w-14 md:h-[4.7rem]">
      <defs>
        {colors.length > 1 && (
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            {colors.map((c, i) => {
              const start = (i / colors.length) * 100;
              const end = ((i + 1) / colors.length) * 100;
              return (
                <React.Fragment key={`${gradientId}-${i}`}>
                  <stop offset={`${start}%`} stopColor={c.fill} />
                  <stop offset={`${end}%`} stopColor={c.fill} />
                </React.Fragment>
              );
            })}
          </linearGradient>
        )}
        {colors.length > 1 && (
          <linearGradient id={strokeGradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            {colors.map((c, i) => {
              const start = (i / colors.length) * 100;
              const end = ((i + 1) / colors.length) * 100;
              return (
                <React.Fragment key={`${strokeGradientId}-${i}`}>
                  <stop offset={`${start}%`} stopColor={c.stroke} />
                  <stop offset={`${end}%`} stopColor={c.stroke} />
                </React.Fragment>
              );
            })}
          </linearGradient>
        )}
        <radialGradient id={crownGlowId} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(50 28) rotate(90) scale(24 28)">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity={isMissing ? 0.16 : 0.75} />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={sideShadeId} x1="62" y1="24" x2="74" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#64748B" stopOpacity={isMissing ? 0.04 : 0.1} />
          <stop offset="100%" stopColor="#334155" stopOpacity={isMissing ? 0.08 : 0.22} />
        </linearGradient>
      </defs>
      <path
        d={toothPath}
        fill={isMissing ? CONDITION_COLORS.missing.fill : fillColor}
        stroke={strokeColor}
        strokeWidth="5"
        strokeDasharray={isMissing ? '4 2' : '0'}
      />
      {!isMissing && (
        <>
          <path
            d="M64 20C68 23 71 30 71 40C71 50 68 61 64 71C62 76 61 82 60 87C61 88 62 88 62 88C65 84 65 79 67 74C69 68 73 62 76 55C80 46 81 36 77 28C75 24 73 21 69 18C67 17 65 16 64 16V20Z"
            fill={`url(#${sideShadeId})`}
          />
          <ellipse cx="50" cy="28" rx="18" ry="14" fill={`url(#${crownGlowId})`} />
          <path
            d="M30 26.8C33.2 23.2 39.6 20.4 46 20.8C47.8 20.9 49 21.5 50 22.2C51 21.5 52.2 20.9 54 20.8C60.4 20.4 66.8 23.2 70 26.8"
            stroke="#FFFFFF"
            strokeOpacity="0.5"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
};

const deriveStatus = (f: { is_missing: boolean; is_pathology: boolean; is_planned: boolean; is_treated: boolean }): ToothStatus => {
  if (f.is_missing) return 'MISSING';
  if (f.is_pathology) return 'PATHOLOGY';
  if (f.is_planned) return 'PLANNED';
  if (f.is_treated) return 'TREATED';
  return 'HEALTHY';
};

const NotationLabel = ({
  x,
  y,
  active = false,
}: {
  x: string;
  y: string;
  active?: boolean;
}) => (
  <span className={`text-[10px] font-bold mb-1 tabular-nums ${active ? 'text-blue-700' : 'text-slate-500'}`}>
    <span className={active ? 'text-blue-700' : 'text-indigo-600'}>{x}</span>
    <span className="text-slate-400">/</span>
    <span className={active ? 'text-emerald-700' : 'text-emerald-600'}>{y}</span>
  </span>
);

const adultUpper = Array.from({ length: 16 }, (_, i) => i + 1).map((n) => {
  const notation = getAdultNotation(n);
  return {
    key: `ADULT-${n}`,
    dentition: 'ADULT' as const,
    notationX: notation.x,
    notationY: notation.y,
    type: getAdultToothType(n),
  };
});

const adultLower = [32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17].map((n) => {
  const notation = getAdultNotation(n);
  return {
    key: `ADULT-${n}`,
    dentition: 'ADULT' as const,
    notationX: notation.x,
    notationY: notation.y,
    type: getAdultToothType(n),
  };
});

const milkUpperNotation = ['5/E', '5/D', '5/C', '5/B', '5/A', '6/A', '6/B', '6/C', '6/D', '6/E'];
const milkLowerNotation = ['8/E', '8/D', '8/C', '8/B', '8/A', '7/A', '7/B', '7/C', '7/D', '7/E'];

const toMilkDescriptor = (notation: string): ToothDescriptor => {
  const [x, y] = notation.split('/');
  return {
    key: `MILK-${x}-${y}`,
    dentition: 'MILK',
    notationX: x,
    notationY: y,
    type: getMilkToothType(y),
  };
};

const milkUpper = milkUpperNotation.map(toMilkDescriptor);
const milkLower = milkLowerNotation.map(toMilkDescriptor);

const allDescriptors = [...milkUpper, ...milkLower, ...adultUpper, ...adultLower];
const descriptorMap = allDescriptors.reduce<Record<string, ToothDescriptor>>((acc, tooth) => {
  acc[tooth.key] = tooth;
  return acc;
}, {});

export function DentalChart({ patientId, canEdit, role }: Props) {
  const [entries, setEntries] = useState<Record<string, DentalEntry>>({});
  const [selectedToothCode, setSelectedToothCode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [versions, setVersions] = useState<DentalChartVersion[]>([]);
  const [versionsMode, setVersionsMode] = useState<'active' | 'trashed'>('active');
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [savingVersion, setSavingVersion] = useState(false);
  const [versionActionId, setVersionActionId] = useState<number | null>(null);
  const [downloadingVersionId, setDownloadingVersionId] = useState<number | null>(null);
  const [versionsTrashCount, setVersionsTrashCount] = useState(0);
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
  const [toothPopover, setToothPopover] = useState<{ open: boolean; left: number; top: number }>({
    open: false,
    left: 0,
    top: 0
  });
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{ dragging: boolean; offsetX: number; offsetY: number; moved: boolean; startX: number; startY: number }>({
    dragging: false,
    offsetX: 0,
    offsetY: 0,
    moved: false,
    startX: 0,
    startY: 0
  });
  const [form, setForm] = useState({
    is_pathology: false,
    is_planned: false,
    is_treated: false,
    is_missing: false,
    pathology: '',
    treatment: '',
    event_date: '',
  });

  const syncFormFromEntry = (toothCode: string | null) => {
    if (!toothCode) return;
    const current = entries[toothCode];
    if (!current) return;
    setForm({
      is_pathology: Boolean(current.is_pathology),
      is_planned: Boolean(current.is_planned),
      is_treated: Boolean(current.is_treated),
      is_missing: Boolean(current.is_missing),
      pathology: current.pathology || '',
      treatment: current.treatment || '',
      event_date: current.event_date ? String(current.event_date).slice(0, 10) : '',
    });
  };

  const loadChart = async () => {
    setLoading(true);
    try {
      const response = await apiService.patients.getCustomDentalChart(patientId);
      const rows = response.data || [];
      const map: Record<string, DentalEntry> = {};
      for (const row of rows) {
        const normalized = resolveFlags(row);
        map[normalized.tooth_code] = normalized;
      }
      setEntries(map);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load dental chart');
      setEntries({});
    } finally {
      setLoading(false);
    }
  };

  const loadVersions = async (mode: 'active' | 'trashed' = versionsMode) => {
    setVersionsLoading(true);
    try {
      const canViewBin = role === 'ORTHODONTIST';
      const listResponse = await apiService.patients.getDentalChartVersions(patientId, { page: 1, limit: 100, deleted: mode });

      setVersions((listResponse.data?.versions || []) as DentalChartVersion[]);

      if (canViewBin) {
        const trashCountResponse = await apiService.patients.getDentalChartVersions(patientId, { page: 1, limit: 1, deleted: 'trashed' });
        setVersionsTrashCount(Number(trashCountResponse.data?.pagination?.total_records || 0));
      } else {
        setVersionsTrashCount(0);
      }
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load chart versions');
      setVersions([]);
      setVersionsTrashCount(0);
    } finally {
      setVersionsLoading(false);
    }
  };

  useEffect(() => {
    loadChart();
    loadVersions('active');
  }, [patientId]);

  useEffect(() => {
    if (!selectedToothCode) return;
    const current = entries[selectedToothCode];
    if (!current) {
      setSelectedToothCode(null);
      return;
    }
    syncFormFromEntry(selectedToothCode);
  }, [selectedToothCode, entries]);

  useEffect(() => {
    if (!selectedToothCode) {
      setToothPopover((prev) => ({ ...prev, open: false }));
    }
  }, [selectedToothCode]);

  useEffect(() => {
    if (!toothPopover.open) return;
    const closePopover = () => {
      syncFormFromEntry(selectedToothCode);
      setToothPopover((prev) => ({ ...prev, open: false }));
    };
    window.addEventListener('scroll', closePopover, true);
    window.addEventListener('resize', closePopover);
    return () => {
      window.removeEventListener('scroll', closePopover, true);
      window.removeEventListener('resize', closePopover);
    };
  }, [toothPopover.open, selectedToothCode, entries]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!dragStateRef.current.dragging) return;
      const rect = popoverRef.current?.getBoundingClientRect();
      const panelWidth = rect?.width || 350;
      const panelHeight = rect?.height || 560;
      const minGap = 12;
      const maxLeft = Math.max(minGap, window.innerWidth - panelWidth - minGap);
      const maxTop = Math.max(minGap, window.innerHeight - panelHeight - minGap);

      const deltaX = Math.abs(event.clientX - dragStateRef.current.startX);
      const deltaY = Math.abs(event.clientY - dragStateRef.current.startY);
      if (deltaX > 3 || deltaY > 3) {
        dragStateRef.current.moved = true;
      }

      const nextLeft = Math.min(maxLeft, Math.max(minGap, event.clientX - dragStateRef.current.offsetX));
      const nextTop = Math.min(maxTop, Math.max(minGap, event.clientY - dragStateRef.current.offsetY));

      setToothPopover((prev) => ({ ...prev, left: nextLeft, top: nextTop }));
    };

    const stopDragging = () => {
      if (!dragStateRef.current.dragging) return;
      dragStateRef.current.dragging = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.setTimeout(() => {
        dragStateRef.current.moved = false;
      }, 0);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
  }, []);

  const openToothPopover = (_event: React.MouseEvent<HTMLButtonElement>) => {
    const panelWidth = 350;
    const panelHeight = 560;
    let left = 16;
    if (left < 12) left = 12;
    const minGap = 12;
    const maxTop = Math.max(minGap, window.innerHeight - panelHeight - minGap);
    let top = minGap;
    if (top > maxTop) top = maxTop;

    setToothPopover({ open: true, left, top });
  };

  const closeToothPopover = () => {
    syncFormFromEntry(selectedToothCode);
    setToothPopover((prev) => ({ ...prev, open: false }));
  };

  const startPopoverDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button, input, label')) return;
    dragStateRef.current.dragging = true;
    dragStateRef.current.moved = false;
    dragStateRef.current.offsetX = event.clientX - toothPopover.left;
    dragStateRef.current.offsetY = event.clientY - toothPopover.top;
    dragStateRef.current.startX = event.clientX;
    dragStateRef.current.startY = event.clientY;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
  };

  const toggleToothSelection = async (tooth: ToothDescriptor) => {
    if (!canEdit) return;

    const exists = Boolean(entries[tooth.key]);
    try {
      if (exists) {
        await apiService.patients.deleteCustomDentalChartTooth(patientId, tooth.key);
        setEntries((prev) => {
          const next = { ...prev };
          delete next[tooth.key];
          return next;
        });
        if (selectedToothCode === tooth.key) setSelectedToothCode(null);
      } else {
        const response = await apiService.patients.upsertCustomDentalChartTooth(patientId, tooth.key, {
          dentition: tooth.dentition,
          notation_x: tooth.notationX,
          notation_y: tooth.notationY,
          status: 'HEALTHY',
          is_pathology: false,
          is_planned: false,
          is_treated: false,
          is_missing: false,
        });
        const saved = resolveFlags(response.data);
        setEntries((prev) => ({ ...prev, [saved.tooth_code]: saved }));
      }
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update tooth selection');
    }
  };

  const saveTooth = async () => {
    if (!selectedToothCode) return;

    const descriptor = descriptorMap[selectedToothCode];
    if (!descriptor) return;

    setSaving(true);
    try {
      const status = deriveStatus(form);
      const response = await apiService.patients.upsertCustomDentalChartTooth(patientId, selectedToothCode, {
        dentition: descriptor.dentition,
        notation_x: descriptor.notationX,
        notation_y: descriptor.notationY,
        status,
        is_pathology: form.is_pathology,
        is_planned: form.is_planned,
        is_treated: form.is_treated,
        is_missing: form.is_missing,
        pathology: form.pathology || undefined,
        treatment: form.treatment || undefined,
        event_date: form.event_date || undefined,
      });
      const saved = resolveFlags(response.data);
      setEntries((prev) => ({ ...prev, [saved.tooth_code]: saved }));
      toast.success('Custom dental chart updated');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save tooth entry');
    } finally {
      setSaving(false);
    }
  };

  const selected = selectedToothCode ? entries[selectedToothCode] : null;
  const selectedConditions = [
    form.is_pathology ? 'PATHOLOGY' : null,
    form.is_planned ? 'PLANNED' : null,
    form.is_treated ? 'TREATED' : null,
    form.is_missing ? 'MISSING' : null,
  ].filter(Boolean) as string[];

  const stats = useMemo(() => {
    const values = Object.values(entries);
    const selectedCount = values.length;
    const missing = values.filter((v) => v.is_missing).length;
    return {
      pathologies: values.filter((v) => v.is_pathology).length,
      planned: values.filter((v) => v.is_planned).length,
      treated: values.filter((v) => v.is_treated).length,
      missing,
      totalTeeth: selectedCount - missing,
      selectedCount,
    };
  }, [entries]);

  const canManageVersionBin = role === 'ORTHODONTIST';

  const saveAnnotatedVersion = async () => {
    setSavingVersion(true);
    try {
      await apiService.patients.createDentalChartVersion(patientId);
      toast.success('Annotated chart version saved');
      await loadVersions(versionsMode);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save annotated chart version');
    } finally {
      setSavingVersion(false);
    }
  };

  const requestSaveAnnotatedVersion = () => {
    if (!canEdit || versionsMode !== 'active' || savingVersion) return;
    openConfirmDialog({
      title: 'Save Chart Version',
      message: 'Save the current annotated chart as a new version file?',
      confirmText: 'Save Version',
      tone: 'info',
      onConfirm: async () => {
        await saveAnnotatedVersion();
      }
    });
  };

  const downloadVersion = async (versionId: number) => {
    setDownloadingVersionId(versionId);
    try {
      await apiService.patients.downloadDentalChartVersion(patientId, String(versionId));
      toast.success('Download started');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to download annotated chart version');
    } finally {
      setDownloadingVersionId(null);
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

  const deleteVersion = (versionId: number, permanent = false) => {
    if (!canManageVersionBin) return;
    openConfirmDialog({
      title: permanent ? 'Permanently Delete Chart Version' : 'Delete Chart Version',
      message: permanent
        ? 'This will permanently delete this annotated chart version from the bin. This action cannot be undone.'
        : 'This annotated chart version will be moved to the bin. You can restore it later.',
      confirmText: permanent ? 'Delete Permanently' : 'Delete Version',
      tone: permanent ? 'danger' : 'warning',
      requireAcknowledge: permanent,
      acknowledgeText: 'I understand this permanent deletion cannot be undone.',
      onConfirm: async () => {
        setVersionActionId(versionId);
        try {
          await apiService.patients.deleteDentalChartVersion(patientId, String(versionId), permanent);
          toast.success(permanent ? 'Annotated chart version permanently deleted' : 'Annotated chart version moved to bin');
          await loadVersions(versionsMode);
        } catch (error: any) {
          toast.error(error?.message || 'Failed to delete annotated chart version');
          throw error;
        } finally {
          setVersionActionId(null);
        }
      }
    });
  };

  const restoreVersion = (versionId: number) => {
    if (!canManageVersionBin) return;
    openConfirmDialog({
      title: 'Restore Chart Version',
      message: 'This annotated chart version will be restored to active versions.',
      confirmText: 'Restore Version',
      tone: 'info',
      onConfirm: async () => {
        setVersionActionId(versionId);
        try {
          await apiService.patients.restoreDentalChartVersion(patientId, String(versionId));
          toast.success('Annotated chart version restored');
          await loadVersions(versionsMode);
        } catch (error: any) {
          toast.error(error?.message || 'Failed to restore annotated chart version');
          throw error;
        } finally {
          setVersionActionId(null);
        }
      }
    });
  };

  const customMilkUpper = milkUpper.filter((t) => Boolean(entries[t.key]));
  const customMilkLower = milkLower.filter((t) => Boolean(entries[t.key]));
  const customAdultUpper = adultUpper.filter((t) => Boolean(entries[t.key]));
  const customAdultLower = adultLower.filter((t) => Boolean(entries[t.key]));

  const SelectorTooth = ({ tooth }: { tooth: ToothDescriptor }) => {
    const exists = Boolean(entries[tooth.key]);
    return (
      <button
        onClick={() => toggleToothSelection(tooth)}
        disabled={!canEdit}
        className={`relative flex flex-col items-center p-1 rounded-lg transition-all ${
          exists ? 'bg-amber-50 ring-2 ring-amber-300 scale-[1.03]' : 'hover:bg-gray-50'
        } ${!canEdit ? 'cursor-not-allowed opacity-80' : ''}`}
      >
        <NotationLabel x={tooth.notationX} y={tooth.notationY} active={exists} />
        <ToothSVG id={`selector-${tooth.key}`} showConditions={false} />
      </button>
    );
  };

  const CustomTooth = ({ tooth }: { tooth: ToothDescriptor }) => {
    const entry = entries[tooth.key];
    const active = selectedToothCode === tooth.key;
    if (!entry) return null;

    return (
      <button
        onClick={(event) => {
          setSelectedToothCode(tooth.key);
          syncFormFromEntry(tooth.key);
          openToothPopover(event);
        }}
        className={`relative flex flex-col items-center p-1 rounded-lg transition-all ${active ? 'bg-blue-50 scale-[1.03]' : 'hover:bg-gray-50'}`}
      >
        <NotationLabel x={tooth.notationX} y={tooth.notationY} active={active} />
        <ToothSVG id={`custom-${tooth.key}`} entry={entry} showConditions />
      </button>
    );
  };

  return (
    <div className="relative">
      <Card className="p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h4 className="text-2xl font-bold text-slate-900">Clinical Dental Chart</h4>
            <p className="text-sm text-slate-500">Select existing teeth first, then manage conditions in the custom chart.</p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm font-semibold text-slate-600">
            <div className="flex items-center gap-2"><span className="w-4 h-4 rounded-full border-2 border-amber-400 bg-amber-100" />Selected in main chart</div>
            <div className="flex items-center gap-2"><span className="w-4 h-4 rounded-full border-2 border-red-500 bg-red-100" />Pathology</div>
            <div className="flex items-center gap-2"><span className="w-4 h-4 rounded-full border-2 border-blue-500 bg-blue-100" />Planned</div>
            <div className="flex items-center gap-2"><span className="w-4 h-4 rounded-full border-2 border-green-500 bg-green-100" />Treated</div>
            <div className="flex items-center gap-2"><span className="w-4 h-4 rounded-full border-2 border-dashed border-slate-400 bg-slate-100" />Missing</div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-slate-50/60 p-6 md:p-8">
          {loading && <p className="text-xs text-gray-500 mb-3">Loading dental chart...</p>}

          <div className="space-y-12 overflow-x-auto pb-2 pl-1 pr-10">
            <div>
              <h5 className="text-sm font-bold text-slate-700 mb-4">Main Chart (Selection Only) - Milk Teeth</h5>
              <div className="space-y-10">
                <div className="flex justify-center gap-1 md:gap-2 min-w-max px-6">
                  {milkUpper.map((tooth) => <SelectorTooth key={tooth.key} tooth={tooth} />)}
                </div>
                <div className="flex justify-center gap-1 md:gap-2 min-w-max px-6">
                  {milkLower.map((tooth) => <SelectorTooth key={tooth.key} tooth={tooth} />)}
                </div>
              </div>
            </div>

            <div>
              <h5 className="text-sm font-bold text-slate-700 mb-4">Main Chart (Selection Only) - Adult Teeth</h5>
              <div className="space-y-10">
                <div className="flex justify-center gap-0.5 md:gap-1 min-w-max px-6">
                  {adultUpper.map((tooth) => <SelectorTooth key={tooth.key} tooth={tooth} />)}
                </div>
                <div className="flex justify-center gap-0.5 md:gap-1 min-w-max px-6">
                  {adultLower.map((tooth) => <SelectorTooth key={tooth.key} tooth={tooth} />)}
                </div>
              </div>
            </div>

            <div className="relative min-w-[1320px]">
              <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-slate-300" />
              <div className="relative flex justify-center">
                <span className="bg-slate-50 px-4 text-[10px] font-black text-slate-400 tracking-[0.25em]">CUSTOMIZED CHART</span>
              </div>
            </div>

            <div>
              <h5 className="text-sm font-bold text-slate-700 mb-4">Customized Milk Teeth</h5>
              <div className="space-y-10">
                <div className="flex justify-center gap-1 md:gap-2 min-w-max px-6">
                  {customMilkUpper.length > 0 ? customMilkUpper.map((tooth) => <CustomTooth key={`custom-${tooth.key}`} tooth={tooth} />) : (
                    <p className="text-xs text-slate-400">No upper milk teeth selected.</p>
                  )}
                </div>
                <div className="flex justify-center gap-1 md:gap-2 min-w-max px-6">
                  {customMilkLower.length > 0 ? customMilkLower.map((tooth) => <CustomTooth key={`custom-${tooth.key}`} tooth={tooth} />) : (
                    <p className="text-xs text-slate-400">No lower milk teeth selected.</p>
                  )}
                </div>
              </div>
            </div>

            <div>
              <h5 className="text-sm font-bold text-slate-700 mb-4">Customized Adult Teeth</h5>
              <div className="space-y-10">
                <div className="flex justify-center gap-0.5 md:gap-1 min-w-max px-6">
                  {customAdultUpper.length > 0 ? customAdultUpper.map((tooth) => <CustomTooth key={`custom-${tooth.key}`} tooth={tooth} />) : (
                    <p className="text-xs text-slate-400">No upper adult teeth selected.</p>
                  )}
                </div>
                <div className="flex justify-center gap-0.5 md:gap-1 min-w-max px-6">
                  {customAdultLower.length > 0 ? customAdultLower.map((tooth) => <CustomTooth key={`custom-${tooth.key}`} tooth={tooth} />) : (
                    <p className="text-xs text-slate-400">No lower adult teeth selected.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="p-4 border border-slate-200 rounded-2xl bg-white">
            <p className="text-xs font-bold text-slate-400 uppercase">Total Teeth</p>
            <p className="text-4xl font-black text-slate-900 leading-tight">{stats.totalTeeth} <span className="text-2xl text-slate-400">/ {stats.selectedCount}</span></p>
          </div>
          <div className="p-4 border border-slate-200 rounded-2xl bg-white">
            <p className="text-xs font-bold text-red-400 uppercase">Pathologies</p>
            <p className="text-4xl font-black text-red-600 leading-tight">{stats.pathologies}</p>
          </div>
          <div className="p-4 border border-slate-200 rounded-2xl bg-white">
            <p className="text-xs font-bold text-blue-400 uppercase">Planned</p>
            <p className="text-4xl font-black text-blue-600 leading-tight">{stats.planned}</p>
          </div>
          <div className="p-4 border border-slate-200 rounded-2xl bg-white">
            <p className="text-xs font-bold text-green-400 uppercase">Treated</p>
            <p className="text-4xl font-black text-green-600 leading-tight">{stats.treated}</p>
          </div>
          <div className="p-4 border border-slate-200 rounded-2xl bg-white">
            <p className="text-xs font-bold text-slate-400 uppercase">Missing</p>
            <p className="text-4xl font-black text-slate-600 leading-tight">{stats.missing}</p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 md:p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
            <div>
              <h5 className="text-sm font-bold text-slate-800">Annotated Chart Versions (Files)</h5>
              <p className="text-xs text-slate-500">Saved chronologically. Each version records who annotated it.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canManageVersionBin && (
                <div className="inline-flex rounded-md border border-gray-200 overflow-hidden">
                  <button
                    type="button"
                    className={`px-3 h-9 text-xs ${versionsMode === 'active' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700'}`}
                    onClick={() => {
                      setVersionsMode('active');
                      loadVersions('active');
                    }}
                  >
                    Active
                  </button>
                  <button
                    type="button"
                    className={`px-3 h-9 text-xs border-l border-gray-200 ${versionsMode === 'trashed' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700'}`}
                    onClick={() => {
                      setVersionsMode('trashed');
                      loadVersions('trashed');
                    }}
                  >
                    Bin{versionsTrashCount > 0 ? ` (${versionsTrashCount})` : ''}
                  </button>
                </div>
              )}
              {canEdit && versionsMode === 'active' && (
                <Button size="sm" onClick={requestSaveAnnotatedVersion} disabled={savingVersion}>
                  <Save className="w-4 h-4 mr-1" />
                  {savingVersion ? 'Saving...' : 'Save Version'}
                </Button>
              )}
            </div>
          </div>

          {versionsLoading && <p className="text-xs text-gray-500">Loading versions...</p>}
          {!versionsLoading && versions.length === 0 && (
            <p className="text-xs text-slate-500">
              {versionsMode === 'trashed'
                ? 'No annotated chart versions in bin.'
                : 'No annotated chart versions saved yet.'}
            </p>
          )}
          <div className="space-y-2">
            {versions.map((version) => (
              <div key={version.id} className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{version.version_label}</p>
                  <p className="text-xs text-slate-500">
                    {String(version.created_at).slice(0, 16).replace('T', ' ')} • {version.entry_count} annotated teeth • by {version.annotated_by_name || 'Unknown'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {versionsMode === 'active' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => downloadVersion(version.id)}
                      disabled={downloadingVersionId === version.id}
                    >
                      {downloadingVersionId === version.id ? (
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
                  {canManageVersionBin && versionsMode === 'active' && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => deleteVersion(version.id, false)}
                      disabled={versionActionId === version.id}
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Delete
                    </Button>
                  )}
                  {canManageVersionBin && versionsMode === 'trashed' && (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="bg-green-600 text-white hover:bg-green-700 active:bg-green-800 border-0"
                        onClick={() => restoreVersion(version.id)}
                        disabled={versionActionId === version.id}
                      >
                        <RotateCcw className="w-4 h-4 mr-1" />
                        Restore
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => deleteVersion(version.id, true)}
                        disabled={versionActionId === version.id}
                      >
                        Delete Permanently
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

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

      {toothPopover.open && selectedToothCode && selected && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-transparent"
            onClick={() => {
              if (dragStateRef.current.moved) return;
              closeToothPopover();
            }}
          />
          <div
            ref={popoverRef}
            className="absolute w-[350px] max-w-[calc(100vw-24px)]"
            style={{ left: toothPopover.left, top: toothPopover.top }}
          >
          <Card
            className="p-5 shadow-2xl border border-blue-100 bg-white"
          >
            <div
              className="flex items-center justify-between mb-3 cursor-grab active:cursor-grabbing select-none"
              onPointerDown={startPopoverDrag}
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tooth Annotation</p>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-200 bg-red-50 text-xl font-bold leading-none text-red-600 transition-all hover:scale-105 hover:bg-red-100 hover:text-red-700 active:scale-95 active:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-300"
                onClick={closeToothPopover}
                aria-label="Close tooth annotation panel"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <h4 className="font-bold text-gray-900 text-xl leading-tight">
                  Tooth{' '}
                  <span className="tabular-nums">
                    <span className="text-indigo-600">{selected.notation_x}</span>
                    <span className="text-slate-400">/</span>
                    <span className="text-emerald-600">{selected.notation_y}</span>
                  </span>
                </h4>
                <div className="min-h-7">
                  {selectedConditions.length > 0 ? (
                    <Badge variant="blue" className="whitespace-normal break-words leading-tight">
                      {selectedConditions.join(' + ')}
                    </Badge>
                  ) : (
                    <Badge variant="neutral">HEALTHY</Badge>
                  )}
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-3 rounded-md px-1 py-1">
                  <input
                    type="checkbox"
                    checked={form.is_pathology}
                    disabled={!canEdit}
                    onChange={(e) => setForm((s) => ({ ...s, is_pathology: e.target.checked }))}
                  />
                  <span className="font-medium">Pathology</span>
                </div>
                <div className="flex items-center gap-3 rounded-md px-1 py-1">
                  <input
                    type="checkbox"
                    checked={form.is_planned}
                    disabled={!canEdit}
                    onChange={(e) => setForm((s) => ({ ...s, is_planned: e.target.checked }))}
                  />
                  <span className="font-medium">Planned</span>
                </div>
                <div className="flex items-center gap-3 rounded-md px-1 py-1">
                  <input
                    type="checkbox"
                    checked={form.is_treated}
                    disabled={!canEdit}
                    onChange={(e) => setForm((s) => ({ ...s, is_treated: e.target.checked }))}
                  />
                  <span className="font-medium">Treated</span>
                </div>
                <div className="flex items-center gap-3 rounded-md px-1 py-1">
                  <input
                    type="checkbox"
                    checked={form.is_missing}
                    disabled={!canEdit}
                    onChange={(e) => setForm((s) => ({ ...s, is_missing: e.target.checked }))}
                  />
                  <span className="font-medium">Missing</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500">Pathology</label>
                <Input value={form.pathology} onChange={(e) => setForm((s) => ({ ...s, pathology: e.target.value }))} disabled={!canEdit} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500">Treatment</label>
                <Input value={form.treatment} onChange={(e) => setForm((s) => ({ ...s, treatment: e.target.value }))} disabled={!canEdit} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500">Annotated Date</label>
                <Input type="date" value={form.event_date} onChange={(e) => setForm((s) => ({ ...s, event_date: e.target.value }))} disabled={!canEdit} />
              </div>

              <div className="pt-2">
                {canEdit ? (
                  <Button className="w-full" onClick={saveTooth} disabled={saving}>{saving ? 'Saving...' : 'Save Tooth Entry'}</Button>
                ) : (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-3 flex gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    You can view chart entries but do not have permission to edit.
                  </div>
                )}
              </div>

              {!canEdit && (
                <div className="text-xs text-gray-500 flex items-center gap-2">
                  <CheckCircle2 className="w-3 h-3 text-green-600" />
                  Last updated by {selected.updated_by_name || 'system'}
                </div>
              )}
            </div>
          </Card>
          </div>
        </div>
      )}

    </div>
  );
}
