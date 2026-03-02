import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Button, Input, Badge, Table } from '../components/UI';
import { CalendarDays, RefreshCcw } from 'lucide-react';
import { apiService } from '../services/api';

type AuditLog = {
  id: number;
  user_id: number | null;
  user_name: string;
  user_email: string;
  user_role: string;
  action: string;
  entity_type: string;
  entity_id: number | null;
  old_values: any;
  new_values: any;
  ip_address: string | null;
  user_agent: string | null;
  timestamp: string;
};

const ROLE_OPTIONS = ['', 'ADMIN', 'ORTHODONTIST', 'DENTAL_SURGEON', 'NURSE', 'RECEPTION', 'STUDENT'];
const PAGE_SIZE = 25;

const parsePayload = (value: any): Record<string, any> | null => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const describeChange = (row: AuditLog) => {
  const oldValues = parsePayload(row.old_values);
  const newValues = parsePayload(row.new_values);

  if (newValues?.method && newValues?.path) {
    return `${newValues.method} ${newValues.path}`;
  }

  const keys = Array.from(
    new Set([
      ...Object.keys(oldValues || {}),
      ...Object.keys(newValues || {})
    ])
  )
    .filter((key) => !['password', 'password_hash', 'refreshToken', 'token'].includes(key))
    .slice(0, 3);

  if (keys.length === 0) return '-';
  return keys
    .map((key) => {
      const before = oldValues?.[key];
      const after = newValues?.[key];
      if (before === undefined) return `${key}: ${String(after)}`;
      if (after === undefined) return `${key}: ${String(before)} -> removed`;
      return `${key}: ${String(before)} -> ${String(after)}`;
    })
    .join(' | ');
};

const formatDateTimeDisplay = (value: string) => {
  if (!value) return 'Not selected';
  return value.replace('T', ' ');
};

export function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [startDateTimeInput, setStartDateTimeInput] = useState('');
  const [endDateTimeInput, setEndDateTimeInput] = useState('');
  const [startDateTime, setStartDateTime] = useState('');
  const [endDateTime, setEndDateTime] = useState('');
  const [page, setPage] = useState(1);
  const [jumpPageInput, setJumpPageInput] = useState('1');
  const startDateTimeRef = useRef<HTMLInputElement | null>(null);
  const endDateTimeRef = useRef<HTMLInputElement | null>(null);
  const [pagination, setPagination] = useState({
    current_page: 1,
    total_pages: 1,
    total_records: 0,
    limit: PAGE_SIZE
  });

  const loadLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiService.reports.auditLogs({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        role: role || undefined,
        start_date: startDateTime ? startDateTime.replace('T', ' ') : undefined,
        end_date: endDateTime ? endDateTime.replace('T', ' ') : undefined
      });
      const payload = response.data || {};
      setLogs(payload.logs || []);
      setPagination(payload.pagination || {
        current_page: 1,
        total_pages: 1,
        total_records: 0,
        limit: PAGE_SIZE
      });
    } catch (e: any) {
      setError(e?.message || 'Failed to load audit logs');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [page, search, role, startDateTime, endDateTime]);

  useEffect(() => {
    setJumpPageInput(String(pagination.current_page || 1));
  }, [pagination.current_page]);

  const visibleRange = useMemo(() => {
    const from = pagination.total_records === 0 ? 0 : (pagination.current_page - 1) * pagination.limit + 1;
    const to = Math.min(pagination.current_page * pagination.limit, pagination.total_records);
    return `${from}-${to}`;
  }, [pagination]);

  const applyFilters = () => {
    if (startDateTimeInput && endDateTimeInput && startDateTimeInput > endDateTimeInput) {
      setError('Start time cannot be after end time.');
      return;
    }
    setError(null);
    setPage(1);
    setSearch(searchInput.trim());
    setStartDateTime(startDateTimeInput);
    setEndDateTime(endDateTimeInput);
  };

  const resetFilters = () => {
    setSearchInput('');
    setSearch('');
    setRole('');
    setStartDateTimeInput('');
    setEndDateTimeInput('');
    setStartDateTime('');
    setEndDateTime('');
    setError(null);
    setPage(1);
  };

  const jumpToPage = () => {
    const requested = Number.parseInt(jumpPageInput, 10);
    if (!Number.isInteger(requested)) {
      setJumpPageInput(String(pagination.current_page || 1));
      return;
    }
    const nextPage = Math.min(Math.max(requested, 1), Math.max(pagination.total_pages, 1));
    setPage(nextPage);
    setJumpPageInput(String(nextPage));
  };

  const openDateTimePicker = (input: HTMLInputElement | null) => {
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }
    input.focus();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Audit Log</h2>
          <p className="text-gray-500">Read-only system activity across all users and roles.</p>
        </div>
        <Button variant="secondary" onClick={loadLogs} className="flex items-center gap-2">
          <RefreshCcw className="w-4 h-4" /> Refresh
        </Button>
      </div>

      <Card className="p-5 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-x-6 gap-y-5">
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyFilters();
            }}
            placeholder="Search name, email, action, entity, IP"
          />
          <select
            className="h-10 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
          >
            {ROLE_OPTIONS.map((value) => (
              <option key={value || 'ALL'} value={value}>
                {value || 'All roles'}
              </option>
            ))}
          </select>
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-600">Start (from)</label>
            <div className="flex items-center gap-3">
              <input
                ref={startDateTimeRef}
                type="datetime-local"
                value={startDateTimeInput}
                onChange={(e) => setStartDateTimeInput(e.target.value)}
                className="h-0 w-0 opacity-0 pointer-events-none absolute"
              />
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={() => openDateTimePicker(startDateTimeRef.current)}
                aria-label="Open start date and time picker"
                title={startDateTimeInput || 'Select start date and time'}
              >
                <CalendarDays className="h-4 w-4" />
              </Button>
              <span className="text-xs text-gray-600">{formatDateTimeDisplay(startDateTimeInput)}</span>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-600">End (to)</label>
            <div className="flex items-center gap-3">
              <input
                ref={endDateTimeRef}
                type="datetime-local"
                value={endDateTimeInput}
                onChange={(e) => setEndDateTimeInput(e.target.value)}
                className="h-0 w-0 opacity-0 pointer-events-none absolute"
              />
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={() => openDateTimePicker(endDateTimeRef.current)}
                aria-label="Open end date and time picker"
                title={endDateTimeInput || 'Select end date and time'}
              >
                <CalendarDays className="h-4 w-4" />
              </Button>
              <span className="text-xs text-gray-600">{formatDateTimeDisplay(endDateTimeInput)}</span>
            </div>
          </div>
          <div className="flex gap-3 md:col-span-2">
            <Button onClick={applyFilters}>Apply Filters</Button>
            <Button variant="secondary" onClick={resetFilters}>Reset</Button>
          </div>
        </div>
      </Card>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <Card>
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h3 className="font-semibold text-gray-900">Activity Records</h3>
          <p className="text-xs text-gray-500">
            Showing {visibleRange} of {pagination.total_records}
          </p>
        </div>
        <Table>
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 font-semibold text-gray-700">Timestamp</th>
              <th className="px-4 py-3 font-semibold text-gray-700">User</th>
              <th className="px-4 py-3 font-semibold text-gray-700">Action</th>
              <th className="px-4 py-3 font-semibold text-gray-700">Entity</th>
              <th className="px-4 py-3 font-semibold text-gray-700">Details</th>
              <th className="px-4 py-3 font-semibold text-gray-700">IP</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((row) => (
              <tr key={row.id} className="border-b border-gray-50">
                <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{String(row.timestamp).replace('T', ' ').slice(0, 19)}</td>
                <td className="px-4 py-3">
                  <div className="text-sm font-medium text-gray-900">{row.user_name}</div>
                  <div className="text-xs text-gray-500">{row.user_email}</div>
                  <Badge variant="neutral" className="mt-1">{row.user_role}</Badge>
                </td>
                <td className="px-4 py-3"><Badge variant="blue">{row.action}</Badge></td>
                <td className="px-4 py-3 text-sm text-gray-700">{row.entity_type}{row.entity_id ? ` #${row.entity_id}` : ''}</td>
                <td className="px-4 py-3 text-xs text-gray-600 max-w-[28rem] truncate" title={describeChange(row)}>{describeChange(row)}</td>
                <td className="px-4 py-3 text-xs text-gray-600">{row.ip_address || '-'}</td>
              </tr>
            ))}
            {!loading && logs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">No audit logs found.</td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
          Previous
        </Button>
        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-600">Page {pagination.current_page} of {pagination.total_pages}</p>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={Math.max(pagination.total_pages, 1)}
              value={jumpPageInput}
              onChange={(e) => setJumpPageInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') jumpToPage();
              }}
              className="h-9 w-24"
              placeholder="Page"
            />
            <Button variant="secondary" onClick={jumpToPage}>Go</Button>
          </div>
        </div>
        <Button
          variant="secondary"
          disabled={page >= pagination.total_pages}
          onClick={() => setPage((prev) => Math.min(pagination.total_pages, prev + 1))}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
