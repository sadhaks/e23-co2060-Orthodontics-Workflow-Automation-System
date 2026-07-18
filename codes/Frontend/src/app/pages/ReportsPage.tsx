import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, Button, Badge, RefreshButton, cn } from '../components/UI';
import { Activity, AlertTriangle, CalendarDays, Download, FileSpreadsheet, FileText, Package, Users, X } from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
} from 'recharts';
import { apiService } from '../services/api';

type ReportPeriod = '24h' | '7d' | '30d' | '3m' | '6m' | '12m';
type AlertType = 'all' | 'critical' | 'low_stock' | 'out_of_stock';
type ExportFormat = 'pdf' | 'csv' | 'xlsx';
type SummaryMetric = 'total_patients' | 'active_patients' | 'visits_in_period';

type ExportSection = {
  title: string;
  headers: string[];
  rows: Array<Array<string | number>>;
};

type SummaryPatientRow = {
  id: number;
  patient_code: string;
  first_name: string;
  last_name: string;
  gender: string;
  status: string;
  phone?: string | null;
  email?: string | null;
  created_at: string;
  visit_count_in_period?: number;
  first_visit_in_period?: string | null;
  last_visit_in_period?: string | null;
};

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'];
const PATIENT_STATUS_ORDER = ['ACTIVE', 'CONSULTATION', 'MAINTENANCE', 'COMPLETED', 'INACTIVE'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const toDateTimeString = (date: Date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
};

const getDateRange = (period: ReportPeriod) => {
  const end = new Date();
  const start = new Date();

  if (period === '24h') start.setHours(start.getHours() - 24);
  else if (period === '7d') start.setDate(start.getDate() - 7);
  else if (period === '30d') start.setDate(start.getDate() - 30);
  else if (period === '3m') start.setMonth(start.getMonth() - 3);
  else if (period === '6m') start.setMonth(start.getMonth() - 6);
  else start.setFullYear(start.getFullYear() - 1);

  return {
    start_date: toDateTimeString(start),
    end_date: toDateTimeString(end),
  };
};

const getVisitGroupBy = (period: ReportPeriod) => {
  if (period === '24h') return 'hour';
  if (period === '7d') return 'day';
  if (period === '30d' || period === '3m') return 'week';
  return 'month';
};

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

const addDays = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

const addMonths = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + amount);
  return next;
};

const startOfWeek = (date: Date) => {
  const next = startOfDay(date);
  const weekday = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - weekday);
  return next;
};

const parseDateOnly = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year || 1970, (month || 1) - 1, day || 1);
};

const formatDateKey = (date: Date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const formatMonthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const formatHourKey = (date: Date) => `${formatDateKey(date)} ${String(date.getHours()).padStart(2, '0')}:00:00`;

const normalizeTrendKey = (value: unknown, period: ReportPeriod) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (period === '24h') {
    const match = raw.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2})/);
    return match ? `${match[1]} ${match[2]}:00:00` : raw;
  }
  if (period === '7d' || period === '30d' || period === '3m') {
    const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : raw;
  }
  return raw.slice(0, 7);
};

const formatRawTrendLabel = (value: unknown, period: ReportPeriod) => {
  const key = normalizeTrendKey(value, period);
  if (!key) return 'Unknown';
  if (period === '24h') {
    const hour = Number(key.slice(11, 13));
    return Number.isFinite(hour) ? formatHourLabel(hour) : key;
  }
  if (period === '7d') {
    const date = parseDateOnly(key);
    return `${MONTH_LABELS[date.getMonth()]} ${date.getDate()}`;
  }
  if (period === '30d' || period === '3m') return formatWeekLabel(key);
  return formatMonthLabel(key, period);
};

const formatHourLabel = (hour: number) => {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour} ${suffix}`;
};

const formatWeekLabel = (weekStartKey: string) => {
  const start = parseDateOnly(weekStartKey);
  const end = addDays(start, 6);
  if (start.getMonth() === end.getMonth()) {
    return `${MONTH_LABELS[start.getMonth()]} ${start.getDate()}-${end.getDate()}`;
  }
  return `${MONTH_LABELS[start.getMonth()]} ${start.getDate()}-${MONTH_LABELS[end.getMonth()]} ${end.getDate()}`;
};

const formatMonthLabel = (monthKey: string, period: ReportPeriod) => {
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return monthKey;
  return period === '12m' ? `${MONTH_LABELS[month - 1]} ${year}` : MONTH_LABELS[month - 1];
};

const csvCell = (value: string | number) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const downloadBlob = (content: BlobPart, type: string, filename: string) => {
  const blob = new Blob([content], { type });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
};

const buildCsv = (sections: ExportSection[]) =>
  sections
    .map((section) => [
      section.title,
      section.headers.map(csvCell).join(','),
      ...section.rows.map((row) => row.map(csvCell).join(',')),
    ].join('\n'))
    .join('\n\n');

const encoder = new TextEncoder();

const xmlCell = (value: string | number) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
}[char] || char));

const columnName = (index: number) => {
  let value = index + 1;
  let label = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
};

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

const crc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const uint16 = (value: number) => [value & 0xff, (value >>> 8) & 0xff];
const uint32 = (value: number) => [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];

const concatBytes = (chunks: Uint8Array[]) => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
};

const createZip = (files: Array<{ name: string; content: string }>) => {
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const contentBytes = encoder.encode(file.content);
    const checksum = crc32(contentBytes);
    const localHeader = new Uint8Array([
      ...uint32(0x04034b50), ...uint16(20), ...uint16(0), ...uint16(0), ...uint16(0), ...uint16(0),
      ...uint32(checksum), ...uint32(contentBytes.length), ...uint32(contentBytes.length),
      ...uint16(nameBytes.length), ...uint16(0),
    ]);
    localChunks.push(localHeader, nameBytes, contentBytes);

    const centralHeader = new Uint8Array([
      ...uint32(0x02014b50), ...uint16(20), ...uint16(20), ...uint16(0), ...uint16(0), ...uint16(0), ...uint16(0),
      ...uint32(checksum), ...uint32(contentBytes.length), ...uint32(contentBytes.length),
      ...uint16(nameBytes.length), ...uint16(0), ...uint16(0), ...uint16(0), ...uint16(0),
      ...uint32(0), ...uint32(offset),
    ]);
    centralChunks.push(centralHeader, nameBytes);
    offset += localHeader.length + nameBytes.length + contentBytes.length;
  });

  const central = concatBytes(centralChunks);
  const end = new Uint8Array([
    ...uint32(0x06054b50), ...uint16(0), ...uint16(0), ...uint16(files.length), ...uint16(files.length),
    ...uint32(central.length), ...uint32(offset), ...uint16(0),
  ]);

  return concatBytes([...localChunks, central, end]);
};

const buildWorksheet = (section: ExportSection) => {
  const rows = [section.headers, ...section.rows];
  const xmlRows = rows.map((row, rowIndex) => {
    const cells = row.map((value, cellIndex) => {
      const reference = `${columnName(cellIndex)}${rowIndex + 1}`;
      if (typeof value === 'number' && Number.isFinite(value)) {
        return `<c r="${reference}"><v>${value}</v></c>`;
      }
      return `<c r="${reference}" t="inlineStr"><is><t>${xmlCell(value)}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <sheetData>${xmlRows}</sheetData>
</worksheet>`;
};

const buildXlsx = (sections: ExportSection[]) => {
  const sheetFiles = sections.map((section, index) => ({
    name: `xl/worksheets/sheet${index + 1}.xml`,
    content: buildWorksheet(section),
  }));
  const sheetContentTypes = sections
    .map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
    .join('');
  const workbookSheets = sections
    .map((section, index) => `<sheet name="${xmlCell(section.title).slice(0, 31)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join('');
  const workbookRels = sections
    .map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`)
    .join('');

  return createZip([
    {
      name: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${sheetContentTypes}
</Types>`,
    },
    {
      name: '_rels/.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${workbookSheets}</sheets>
</workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRels}</Relationships>`,
    },
    ...sheetFiles,
  ]);
};

const StatCard = ({
  label,
  value,
  tone,
  icon: Icon,
  active = false,
  clickable = false,
  onClick,
}: {
  label: string;
  value: string | number;
  tone: string;
  icon: any;
  active?: boolean;
  clickable?: boolean;
  onClick?: () => void;
}) => (
  <button
    type="button"
    className={cn(
      'w-full text-left',
      clickable ? 'cursor-pointer' : 'cursor-default'
    )}
    onClick={onClick}
    disabled={!clickable}
  >
    <Card
      className={cn(
        'min-h-[104px] p-4 transition-all',
        clickable ? 'hover:-translate-y-0.5 hover:shadow-md' : '',
        active ? 'ring-2 ring-blue-500 ring-offset-1' : ''
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium leading-tight text-slate-500 sm:text-sm">{label}</p>
        <Icon className={cn('h-4 w-4 shrink-0 sm:h-5 sm:w-5', tone)} />
      </div>
      <p className={cn('mt-2 text-2xl font-extrabold leading-none sm:text-3xl', tone)}>{value}</p>
    </Card>
  </button>
);

export function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [patient, setPatient] = useState<any>(null);
  const [visits, setVisits] = useState<any>(null);
  const [inventory, setInventory] = useState<any>(null);
  const [period, setPeriod] = useState<ReportPeriod>('30d');
  const [alertType, setAlertType] = useState<AlertType>('all');
  const [selectedMetric, setSelectedMetric] = useState<SummaryMetric | null>(null);
  const [summaryPatients, setSummaryPatients] = useState<SummaryPatientRow[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const loadReports = async () => {
    const dateRange = getDateRange(period);
    setLoading(true);
    setError(null);

    const [p, v, i] = await Promise.allSettled([
      apiService.reports.patientStatus({ group_by: 'status', ...dateRange }),
      apiService.reports.visitSummary({ group_by: getVisitGroupBy(period), ...dateRange }),
      apiService.reports.inventoryAlerts(alertType),
    ]);

    setPatient(p.status === 'fulfilled' ? (p.value.data || null) : null);
    setVisits(v.status === 'fulfilled' ? (v.value.data || null) : null);
    setInventory(i.status === 'fulfilled' ? (i.value.data || null) : null);

    const failedLabels: string[] = [];
    if (p.status === 'rejected') failedLabels.push('patient status');
    if (v.status === 'rejected') failedLabels.push('visit summary');
    if (i.status === 'rejected') failedLabels.push('inventory alerts');
    if (failedLabels.length > 0) setError(`Some report sections failed to load: ${failedLabels.join(', ')}`);

    setLoading(false);
  };

  useEffect(() => {
    loadReports();
  }, [period, alertType]);

  const loadSummaryPatients = async (metric: SummaryMetric) => {
    const dateRange = getDateRange(period);
    setSelectedMetric(metric);
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const response = await apiService.reports.summaryPatients({ metric, ...dateRange });
      setSummaryPatients(response.data?.patients || []);
    } catch (err: any) {
      setSummaryPatients([]);
      setSummaryError(err?.message || 'Failed to load patient list');
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedMetric) return;
    loadSummaryPatients(selectedMetric);
  }, [period]);

  const patientBreakdown = useMemo(() => {
    const totalPatients = Number(patient?.overview?.total_patients || 0);
    const rows = (patient?.breakdown || [])
      .map((row: any) => ({
        name: String(row.group_key || 'Unknown').toUpperCase(),
        value: Number(row.patient_count || 0),
      }))
      .filter((row: any) => row.value > 0);

    rows.sort((a: any, b: any) => {
      const indexA = PATIENT_STATUS_ORDER.indexOf(a.name);
      const indexB = PATIENT_STATUS_ORDER.indexOf(b.name);
      if (indexA === -1 && indexB === -1) return b.value - a.value;
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });

    return rows.map((row: any) => ({
      ...row,
      label: row.name.replace(/_/g, ' '),
      percentage: totalPatients > 0 ? Number(((row.value / totalPatients) * 100).toFixed(1)) : 0,
    }));
  }, [patient]);

  const visitTrends = useMemo(() => {
    const rawTrendRows = visits?.trends || [];
    const totalsByKey = new Map<string, { total: number; completed: number }>();
    for (const row of rawTrendRows) {
      totalsByKey.set(normalizeTrendKey(row.group_key, period), {
        total: Number(row.total_visits || 0),
        completed: Number(row.completed_visits || 0),
      });
    }

    const range = getDateRange(period);
    const rangeStart = new Date(range.start_date.replace(' ', 'T'));
    const rangeEnd = new Date(range.end_date.replace(' ', 'T'));
    const buckets: Array<{ rawKey: string; name: string; fullLabel: string; total: number; completed: number; notCompleted: number }> = [];
    const withFallback = () => {
      const bucketTotal = buckets.reduce((sum, row) => sum + row.total, 0);
      const rawTotal = rawTrendRows.reduce((sum: number, row: any) => sum + Number(row.total_visits || 0), 0);
      if (bucketTotal > 0 || rawTotal === 0) return buckets;
      return rawTrendRows
        .map((row: any) => {
          const total = Number(row.total_visits || 0);
          const completed = Number(row.completed_visits || 0);
          const label = formatRawTrendLabel(row.group_key, period);
          return {
            rawKey: normalizeTrendKey(row.group_key, period),
            name: label,
            fullLabel: label,
            total,
            completed,
            notCompleted: Math.max(0, total - completed),
          };
        })
        .reverse();
    };

    if (period === '24h') {
      const cursor = new Date(rangeStart);
      cursor.setMinutes(0, 0, 0);
      while (cursor <= rangeEnd) {
        const key = formatHourKey(cursor);
        const totals = totalsByKey.get(key) || { total: 0, completed: 0 };
        buckets.push({
          rawKey: key,
          name: formatHourLabel(cursor.getHours()),
          fullLabel: `${MONTH_LABELS[cursor.getMonth()]} ${cursor.getDate()}, ${cursor.getFullYear()} ${formatHourLabel(cursor.getHours())}`,
          total: totals.total,
          completed: totals.completed,
          notCompleted: Math.max(0, totals.total - totals.completed),
        });
        cursor.setHours(cursor.getHours() + 1);
      }
      return withFallback();
    }

    if (period === '7d') {
      let cursor = addDays(startOfDay(rangeEnd), -6);
      const end = startOfDay(rangeEnd);
      while (cursor <= end) {
        const key = formatDateKey(cursor);
        const totals = totalsByKey.get(key) || { total: 0, completed: 0 };
        buckets.push({
          rawKey: key,
          name: `${MONTH_LABELS[cursor.getMonth()]} ${cursor.getDate()}`,
          fullLabel: `${MONTH_LABELS[cursor.getMonth()]} ${cursor.getDate()}, ${cursor.getFullYear()}`,
          total: totals.total,
          completed: totals.completed,
          notCompleted: Math.max(0, totals.total - totals.completed),
        });
        cursor = addDays(cursor, 1);
      }
      return withFallback();
    }

    if (period === '30d' || period === '3m') {
      const weeksToShow = period === '30d' ? 5 : 13;
      let cursor = startOfWeek(addDays(rangeEnd, -((weeksToShow - 1) * 7)));
      const lastWeek = startOfWeek(rangeEnd);
      while (cursor <= lastWeek) {
        const key = formatDateKey(cursor);
        const totals = totalsByKey.get(key) || { total: 0, completed: 0 };
        buckets.push({
          rawKey: key,
          name: formatWeekLabel(key),
          fullLabel: `Week of ${formatWeekLabel(key)}`,
          total: totals.total,
          completed: totals.completed,
          notCompleted: Math.max(0, totals.total - totals.completed),
        });
        cursor = addDays(cursor, 7);
      }
      return withFallback();
    }

    const monthsToShow = period === '6m' ? 6 : 12;
    let cursor = startOfMonth(addMonths(rangeEnd, -(monthsToShow - 1)));
    const lastMonth = startOfMonth(rangeEnd);
    while (cursor <= lastMonth) {
      const key = formatMonthKey(cursor);
      const totals = totalsByKey.get(key) || { total: 0, completed: 0 };
      buckets.push({
        rawKey: key,
        name: formatMonthLabel(key, period),
        fullLabel: formatMonthLabel(key, '12m'),
        total: totals.total,
        completed: totals.completed,
        notCompleted: Math.max(0, totals.total - totals.completed),
      });
      cursor = addMonths(cursor, 1);
    }
    return withFallback();
  }, [visits, period]);

  const procedureBreakdown = useMemo(
    () =>
      (visits?.procedure_breakdown || []).map((row: any) => {
        const count = Number(row.count || 0);
        const completed = Number(row.completed_count || 0);
        const scheduled = Number(row.scheduled_count || 0);
        const cancelled = Number(row.cancelled_count || 0);
        const didNotAttend = Number(row.did_not_attend_count || 0);
        const other = Number(row.other_status_count || 0);
        return {
          procedure_type: row.procedure_type,
          count,
          completed_count: completed,
          scheduled_count: scheduled,
          cancelled_count: cancelled,
          did_not_attend_count: didNotAttend,
          other_status_count: other,
          not_completed_count: scheduled + cancelled + didNotAttend + other,
          completion_rate: count > 0 ? Number(((completed / count) * 100).toFixed(1)) : 0,
        };
      }),
    [visits]
  );

  const inventoryAlerts = inventory?.alerts || [];
  const inventoryOverview = inventory?.overview || {};
  const totalInventoryAlerts =
    Number(inventoryOverview.out_of_stock_count || 0) +
    Number(inventoryOverview.critical_count || 0) +
    Number(inventoryOverview.low_stock_count || 0);
  const totalVisits = visitTrends.reduce((sum, row) => sum + row.total, 0);
  const completedVisits = visitTrends.reduce((sum, row) => sum + row.completed, 0);
  const summaryTitle = useMemo(() => {
    if (selectedMetric === 'total_patients') return 'Patients Registered In Selected Period';
    if (selectedMetric === 'active_patients') return 'Active Patients In Selected Period';
    if (selectedMetric === 'visits_in_period') return 'Patients With Visits In Selected Period';
    return '';
  }, [selectedMetric]);
  const showSummaryStatusColumn = selectedMetric !== 'active_patients' && selectedMetric !== null;
  const summaryColumnCount = selectedMetric === 'visits_in_period'
    ? (showSummaryStatusColumn ? 6 : 5)
    : (showSummaryStatusColumn ? 4 : 3);
  const exportSections = useMemo<ExportSection[]>(() => [
    {
      title: 'Summary',
      headers: ['Metric', 'Value'],
      rows: [
        ['Total patients', patient?.overview?.total_patients ?? 0],
        ['Active patients', patient?.overview?.active_patients ?? 0],
        ['Visits in period', totalVisits],
        ['Completed visits in period', completedVisits],
        ['Inventory alerts', totalInventoryAlerts],
      ],
    },
    {
      title: 'Patient Status Distribution',
      headers: ['Status', 'Count', 'Percentage'],
      rows: patientBreakdown.map((row: any) => [row.label, row.value, `${row.percentage}%`]),
    },
    {
      title: 'Visit Trend',
      headers: ['Period', 'Total', 'Completed', 'Not completed'],
      rows: visitTrends.map((row) => [row.fullLabel, row.total, row.completed, row.notCompleted]),
    },
    {
      title: 'Top Procedures',
      headers: ['Procedure', 'Total', 'Completed', 'Scheduled', 'Cancelled', 'Did not attend', 'Other', 'Completion rate'],
      rows: procedureBreakdown.map((row: any) => [
        row.procedure_type,
        row.count,
        row.completed_count,
        row.scheduled_count,
        row.cancelled_count,
        row.did_not_attend_count,
        row.other_status_count,
        `${row.completion_rate}%`,
      ]),
    },
    {
      title: 'Provider Workload',
      headers: ['Provider', 'Role', 'Total visits', 'Completed visits', 'Average duration minutes'],
      rows: (visits?.provider_workload || []).map((row: any) => [
        row.provider_name || 'Unknown',
        row.provider_role || '-',
        Number(row.total_visits || 0),
        Number(row.completed_visits || 0),
        row.avg_duration ? Number(row.avg_duration).toFixed(1) : '-',
      ]),
    },
    {
      title: 'Inventory Alerts',
      headers: ['Item', 'Category', 'Quantity', 'Minimum threshold', 'Alert level', 'Shortage'],
      rows: inventoryAlerts.map((row: any) => [
        row.name,
        row.category,
        row.quantity,
        row.minimum_threshold,
        row.alert_level,
        row.shortage_quantity,
      ]),
    },
  ], [patient, totalVisits, completedVisits, totalInventoryAlerts, patientBreakdown, visitTrends, procedureBreakdown, visits, inventoryAlerts]);

  const exportReport = (format: ExportFormat) => {
    setExporting(format);
    try {
      if (format === 'pdf') {
        const clearPrinting = () => setExporting(null);
        window.addEventListener('afterprint', clearPrinting, { once: true });
        window.setTimeout(() => {
          window.print();
          window.setTimeout(clearPrinting, 1200);
        }, 50);
        return;
      }

      const filenameBase = `orthoflow-report-${period}-${new Date().toISOString().slice(0, 10)}`;
      if (format === 'csv') {
        downloadBlob(buildCsv(exportSections), 'text/csv;charset=utf-8', `${filenameBase}.csv`);
      } else if (format === 'xlsx') {
        downloadBlob(buildXlsx(exportSections), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `${filenameBase}.xlsx`);
      }
      toast.success(`Report exported as ${format === 'xlsx' ? 'XLSX' : format.toUpperCase()}`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to export report');
    } finally {
      if (format !== 'pdf') setExporting(null);
    }
  };

  return (
    <div className="reports-print-root space-y-6">
      <style>
        {`
          @media print {
            @page {
              size: A4;
              margin: 12mm;
            }

            body {
              background: #ffffff !important;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            body * {
              visibility: hidden;
            }

            .reports-print-root,
            .reports-print-root * {
              visibility: visible;
            }

            .reports-print-root {
              position: absolute;
              inset: 0 auto auto 0;
              width: 100%;
              padding: 0 !important;
              background: #ffffff !important;
            }

            .reports-print-controls,
            .reports-print-controls * {
              display: none !important;
              visibility: hidden !important;
            }

            .reports-print-root > * {
              break-inside: avoid;
              page-break-inside: avoid;
            }

            .reports-print-root .recharts-wrapper,
            .reports-print-root svg {
              break-inside: avoid;
              page-break-inside: avoid;
            }
          }
        `}
      </style>
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-slate-900">Analytics & Reports</h2>
        <div className="reports-print-controls flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
          <select
            className="h-11 rounded-lg border border-blue-100 bg-blue-50/50 px-4 text-sm font-semibold text-slate-900 transition-colors hover:border-blue-200 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={period}
            onChange={(event) => setPeriod(event.target.value as ReportPeriod)}
          >
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="3m">Last 3 months</option>
            <option value="6m">Last 6 months</option>
            <option value="12m">Last 12 months</option>
          </select>
          <select
            className="h-11 rounded-lg border border-amber-100 bg-amber-50/60 px-4 text-sm font-semibold text-slate-900 transition-colors hover:border-amber-200 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-500"
            value={alertType}
            onChange={(event) => setAlertType(event.target.value as AlertType)}
          >
            <option value="all">All inventory alerts</option>
            <option value="critical">Critical</option>
            <option value="low_stock">Low stock</option>
            <option value="out_of_stock">Out of stock</option>
          </select>
          <RefreshButton onClick={loadReports} loading={loading} className="h-11 rounded-lg border-slate-200 px-5" />
          <Button
            variant="secondary"
            className="h-11 gap-2 rounded-lg border-red-100 bg-red-50 text-red-700 hover:border-red-200 hover:bg-red-100"
            onClick={() => exportReport('pdf')}
            disabled={Boolean(exporting)}
          >
            <FileText className="h-4 w-4" />
            PDF
          </Button>
          <Button
            variant="secondary"
            className="h-11 gap-2 rounded-lg border-emerald-100 bg-emerald-50 text-emerald-700 hover:border-emerald-200 hover:bg-emerald-100"
            onClick={() => exportReport('xlsx')}
            disabled={Boolean(exporting)}
          >
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </Button>
          <Button className="h-11 gap-2 rounded-lg bg-blue-600 px-5 shadow-sm hover:bg-blue-700" onClick={() => exportReport('csv')} disabled={Boolean(exporting)}>
            <Download className="h-4 w-4" />
            CSV
          </Button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-4 gap-3">
        <StatCard
          label="Total Patients"
          value={patient?.overview?.total_patients ?? 0}
          tone="text-slate-900"
          icon={Users}
          clickable
          active={selectedMetric === 'total_patients'}
          onClick={() => loadSummaryPatients('total_patients')}
        />
        <StatCard
          label="Active Patients"
          value={patient?.overview?.active_patients ?? 0}
          tone="text-blue-600"
          icon={Activity}
          clickable
          active={selectedMetric === 'active_patients'}
          onClick={() => loadSummaryPatients('active_patients')}
        />
        <StatCard
          label="Visits In Period"
          value={totalVisits}
          tone="text-emerald-600"
          icon={CalendarDays}
          clickable
          active={selectedMetric === 'visits_in_period'}
          onClick={() => loadSummaryPatients('visits_in_period')}
        />
        <StatCard label="Inventory Alerts" value={totalInventoryAlerts} tone="text-amber-600" icon={AlertTriangle} />
      </div>

      {selectedMetric && (
        <Card className="p-6">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="font-bold text-slate-900">{summaryTitle}</h4>
              <p className="text-sm text-slate-500">
                {summaryPatients.length} patient{summaryPatients.length === 1 ? '' : 's'} matched for the selected period.
              </p>
            </div>
            <Button variant="secondary" size="icon" className="h-10 w-10" onClick={() => setSelectedMetric(null)} title="Close list" aria-label="Close list">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {summaryError && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{summaryError}</div>}

          <div className="max-h-[420px] overflow-y-auto rounded-xl border border-slate-100">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Code</th>
                  {showSummaryStatusColumn && <th className="px-4 py-3">Status</th>}
                  <th className="px-4 py-3">Registered</th>
                  {selectedMetric === 'visits_in_period' && <th className="px-4 py-3">Visits</th>}
                  {selectedMetric === 'visits_in_period' && <th className="px-4 py-3">Latest Visit</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {summaryPatients.map((patientRow) => (
                  <tr key={patientRow.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{patientRow.first_name} {patientRow.last_name}</div>
                      <div className="text-xs text-slate-500">{patientRow.phone || patientRow.email || '-'}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{patientRow.patient_code}</td>
                    {showSummaryStatusColumn && (
                      <td className="px-4 py-3">
                        <Badge variant={patientRow.status === 'ACTIVE' ? 'success' : patientRow.status === 'CONSULTATION' ? 'blue' : 'neutral'}>
                          {String(patientRow.status || '').replace(/_/g, ' ')}
                        </Badge>
                      </td>
                    )}
                    <td className="px-4 py-3 text-slate-700">{String(patientRow.created_at || '').slice(0, 10) || '-'}</td>
                    {selectedMetric === 'visits_in_period' && <td className="px-4 py-3 text-slate-700">{patientRow.visit_count_in_period ?? 0}</td>}
                    {selectedMetric === 'visits_in_period' && <td className="px-4 py-3 text-slate-700">{patientRow.last_visit_in_period ? String(patientRow.last_visit_in_period).slice(0, 16).replace('T', ' ') : '-'}</td>}
                  </tr>
                ))}
                {!summaryLoading && summaryPatients.length === 0 && (
                  <tr>
                    <td colSpan={summaryColumnCount} className="px-4 py-8 text-center text-sm text-slate-500">
                      No patients found for this selection.
                    </td>
                  </tr>
                )}
                {summaryLoading && (
                  <tr>
                    <td colSpan={summaryColumnCount} className="px-4 py-8 text-center text-sm text-slate-500">
                      Loading patient list...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="p-6 xl:col-span-2">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h4 className="font-bold text-slate-900">Visit Trend</h4>
              <p className="text-sm text-slate-500">Total and completed patient visits for the selected period.</p>
            </div>
            <Badge variant="blue">{completedVisits} completed</Badge>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={visitTrends} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} minTickGap={12} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="total" name="Total visits" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="completed" name="Completed" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <h4 className="font-bold text-slate-900">Patient Status Distribution</h4>
          <div className="mt-4 h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={patientBreakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={84}
                  paddingAngle={3}
                  dataKey="value"
                  nameKey="label"
                  stroke="#ffffff"
                  strokeWidth={2}
                >
                  {patientBreakdown.map((_: any, index: number) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 space-y-2">
            {patientBreakdown.length === 0 && !loading && <p className="text-sm text-slate-500">No patient status data.</p>}
            {patientBreakdown.map((status: any, index: number) => (
              <div key={status.name} className="flex items-center justify-between gap-3 text-sm text-slate-600">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                  {status.label}
                </span>
                <strong className="text-slate-900">{status.value} ({status.percentage}%)</strong>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h4 className="font-bold text-slate-900">Top Procedures</h4>
            <p className="text-sm text-slate-500">Procedure load split by completed and not completed visit outcomes.</p>
          </div>
          <Badge variant="success">{procedureBreakdown.length} procedure types</Badge>
        </div>
        <div className="h-[290px] overflow-x-auto">
          <div className="h-full min-w-[720px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={procedureBreakdown} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                <XAxis dataKey="procedure_type" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="completed_count" stackId="visits" fill="#10b981" radius={[4, 4, 0, 0]} name="Completed" />
                <Bar dataKey="not_completed_count" stackId="visits" fill="#6366f1" radius={[4, 4, 0, 0]} name="Not completed" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {procedureBreakdown.slice(0, 5).map((procedure: any) => (
            <div key={procedure.procedure_type} className="rounded-lg border border-slate-100 px-3 py-3">
              <p className="truncate text-sm font-semibold text-slate-900">{procedure.procedure_type}</p>
              <p className="mt-1 text-xs text-slate-500">{procedure.count} visits | {procedure.completion_rate}% completed</p>
              <p className="mt-2 text-xs text-slate-600">Scheduled {procedure.scheduled_count} | Cancelled {procedure.cancelled_count} | DNA {procedure.did_not_attend_count}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="p-6">
          <h4 className="font-bold text-slate-900">Provider Workload</h4>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-3 pr-4">Provider</th>
                  <th className="py-3 pr-4">Role</th>
                  <th className="py-3 pr-4">Visits</th>
                  <th className="py-3 pr-4">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(visits?.provider_workload || []).slice(0, 8).map((provider: any) => (
                  <tr key={`${provider.provider_name}-${provider.provider_role}`}>
                    <td className="py-3 pr-4 font-medium text-slate-900">{provider.provider_name || 'Unknown'}</td>
                    <td className="py-3 pr-4 text-slate-500">{String(provider.provider_role || '-').replace(/_/g, ' ')}</td>
                    <td className="py-3 pr-4 text-slate-700">{provider.total_visits}</td>
                    <td className="py-3 pr-4 text-slate-700">{provider.completed_visits}</td>
                  </tr>
                ))}
                {(visits?.provider_workload || []).length === 0 && !loading && (
                  <tr><td colSpan={4} className="py-4 text-sm text-slate-500">No provider workload data.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-6">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h4 className="flex items-center gap-2 font-bold text-slate-900">
              <Package className="h-5 w-5 text-amber-600" />
              Inventory Alerts
            </h4>
            <div className="flex flex-wrap gap-2">
              <Badge variant="error">Out: {inventoryOverview.out_of_stock_count ?? 0}</Badge>
              <Badge variant="warning">Critical: {inventoryOverview.critical_count ?? 0}</Badge>
              <Badge variant="blue">Low: {inventoryOverview.low_stock_count ?? 0}</Badge>
            </div>
          </div>
          <div className="space-y-2">
            {inventoryAlerts.length === 0 && !loading && <p className="text-sm text-slate-500">No inventory alerts.</p>}
            {inventoryAlerts.slice(0, 10).map((alert: any) => (
              <div key={alert.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{alert.name}</p>
                  <p className="text-xs text-slate-500">{alert.category} | Qty: {alert.quantity} / Min: {alert.minimum_threshold}</p>
                </div>
                <Badge variant={alert.alert_level === 'OUT_OF_STOCK' ? 'error' : alert.alert_level === 'CRITICAL' ? 'warning' : 'blue'}>
                  {String(alert.alert_level || '').replace(/_/g, ' ')}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {loading && <p className="flex items-center gap-2 text-sm text-slate-500"><Activity className="h-4 w-4 animate-pulse" /> Loading reports...</p>}
    </div>
  );
}
