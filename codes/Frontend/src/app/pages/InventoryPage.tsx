import React, { useEffect, useMemo, useState } from 'react';
import { Card, Badge, Button, Table, Input, RefreshButton } from '../components/UI';
import { Plus, Search, Trash2, RotateCcw, Pencil, X } from 'lucide-react';
import { apiService } from '../services/api';
import { useAuth } from '../context/AuthContext';

type InventoryItem = {
  id: number;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  minimum_threshold: number;
  alert_level: 'NORMAL' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  deleted_at?: string | null;
};

const initialNewItem = {
  name: '',
  category: '',
  quantity: '',
  minimum_threshold: '',
  unit: 'pcs',
};

export function InventoryPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<InventoryItem[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newItem, setNewItem] = useState(initialNewItem);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [stockUpdatingId, setStockUpdatingId] = useState<number | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [deletedMode, setDeletedMode] = useState<'active' | 'trashed'>('active');
  const [restockModal, setRestockModal] = useState<{
    open: boolean;
    itemId: number | null;
    itemName: string;
    unit: string;
    quantity: string;
  }>({
    open: false,
    itemId: null,
    itemName: '',
    unit: '',
    quantity: ''
  });
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
  const canMutateInventory = user?.role === 'NURSE';

  const getErrorMessage = (err: any, fallback: string) => {
    if (Array.isArray(err?.errors) && err.errors.length > 0) {
      return err.errors[0]?.message || fallback;
    }
    if (Array.isArray(err?.data?.errors) && err.data.errors.length > 0) {
      return err.data.errors[0]?.message || fallback;
    }
    return err?.message || fallback;
  };

  const loadInventory = async () => {
    setLoading(true);
    setError(null);
    let allItems: InventoryItem[] = [];
    try {
      const pageSize = 100;
      let page = 1;
      let totalPages = 1;

      do {
        const pageRes = await apiService.inventory.getList({
          page,
          limit: pageSize,
          category: category || undefined,
          search: search.trim() || undefined,
          deleted: deletedMode,
        });

        allItems.push(...(pageRes.data?.inventory || []));
        totalPages = pageRes.data?.pagination?.total_pages || 1;
        page += 1;
      } while (page <= totalPages);
      setRows(allItems);
    } catch (err: any) {
      setError(err?.message || 'Failed to load inventory items');
      setRows([]);
      setStats(null);
      setLoading(false);
      return;
    }

    try {
      if (deletedMode === 'active') {
        const statsRes = await apiService.inventory.getStats();
        setStats(statsRes.data?.overview || null);
        if (!statsRes.data?.overview) {
          setStats({
            total_items: allItems.length,
            low_stock: allItems.filter((item) => item.alert_level === 'LOW_STOCK').length,
            out_of_stock: allItems.filter((item) => item.alert_level === 'OUT_OF_STOCK').length,
          });
        }
      } else {
        setStats({
          total_items: allItems.length,
          low_stock: 0,
          out_of_stock: 0,
        });
      }
    } catch {
      setStats({
        total_items: allItems.length,
        low_stock: allItems.filter((item) => item.alert_level === 'LOW_STOCK').length,
        out_of_stock: allItems.filter((item) => item.alert_level === 'OUT_OF_STOCK').length,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInventory();
  }, [category, search, deletedMode]);

  const filteredRows = useMemo(() => rows, [rows]);

  const categories = useMemo(() => {
    const set = new Set(rows.map((r) => r.category).filter(Boolean));
    return Array.from(set).sort();
  }, [rows]);

  const alertVariant = (level: InventoryItem['alert_level']) => {
    if (level === 'NORMAL') return 'success';
    if (level === 'OUT_OF_STOCK') return 'error';
    return 'warning';
  };

  const resetEditor = () => {
    setEditingId(null);
    setNewItem(initialNewItem);
  };

  const closeEditor = () => {
    if (creating) return;
    setEditorOpen(false);
    resetEditor();
  };

  const openCreateEditor = () => {
    setError(null);
    resetEditor();
    setEditorOpen(true);
  };

  const openEditEditor = (item: InventoryItem) => {
    setError(null);
    setEditingId(item.id);
    setNewItem({
      name: item.name || '',
      category: item.category || '',
      quantity: String(item.quantity ?? ''),
      minimum_threshold: String(item.minimum_threshold ?? ''),
      unit: item.unit || 'pcs',
    });
    setEditorOpen(true);
  };

  const createItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canMutateInventory) return;
    setCreating(true);
    setError(null);
    try {
      const payload = {
        name: newItem.name,
        category: newItem.category,
        quantity: Number(newItem.quantity),
        minimum_threshold: Number(newItem.minimum_threshold),
        unit: newItem.unit,
      };

      if (editingId) {
        await apiService.inventory.update(String(editingId), payload);
      } else {
        await apiService.inventory.create(payload);
      }

      setEditorOpen(false);
      resetEditor();
      await loadInventory();
    } catch (err: any) {
      setError(getErrorMessage(err, editingId ? 'Failed to update inventory item' : 'Failed to create inventory item'));
    } finally {
      setCreating(false);
    }
  };

  const restock = async (id: number) => {
    if (!canMutateInventory) return;
    const item = rows.find((entry) => entry.id === id);
    setError(null);
    setRestockModal({
      open: true,
      itemId: id,
      itemName: item?.name || 'Material',
      unit: item?.unit || 'pcs',
      quantity: ''
    });
  };

  const closeRestockModal = () => {
    if (stockUpdatingId !== null) return;
    setRestockModal({
      open: false,
      itemId: null,
      itemName: '',
      unit: '',
      quantity: ''
    });
  };

  const submitRestock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canMutateInventory || restockModal.itemId === null) return;

    const qty = Number(restockModal.quantity);
    if (!restockModal.quantity || !Number.isFinite(qty) || qty <= 0) {
      setError('Restock quantity must be greater than 0.');
      return;
    }

    setStockUpdatingId(restockModal.itemId);
    setError(null);
    try {
      await apiService.inventory.updateStock(String(restockModal.itemId), {
        transaction_type: 'IN',
        quantity: qty,
        reference_type: 'PURCHASE',
        notes: 'Restocked from inventory page',
      });
      closeRestockModal();
      await loadInventory();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to restock'));
    } finally {
      setStockUpdatingId(null);
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
      setConfirmDialog((prev) => ({
        ...prev,
        open: false,
        onConfirm: null,
        acknowledged: false,
        processing: false
      }));
    } catch {
      setConfirmDialog((prev) => ({ ...prev, processing: false }));
    }
  };

  const moveToBin = (id: number, itemName: string) => {
    if (!canMutateInventory) return;
    openConfirmDialog({
      title: 'Delete Material',
      message: `${itemName} will be moved to the recycle bin. You can restore it later.`,
      confirmText: 'Delete Material',
      tone: 'warning',
      onConfirm: async () => {
        setProcessingId(id);
        setError(null);
        try {
          await apiService.inventory.delete(String(id));
          await loadInventory();
        } catch (err: any) {
          setError(getErrorMessage(err, 'Failed to move item to bin'));
          throw err;
        } finally {
          setProcessingId(null);
        }
      }
    });
  };

  const restoreItem = (id: number, itemName: string) => {
    if (!canMutateInventory) return;
    openConfirmDialog({
      title: 'Restore Material',
      message: `${itemName} will be restored to active inventory.`,
      confirmText: 'Restore Material',
      tone: 'info',
      onConfirm: async () => {
        setProcessingId(id);
        setError(null);
        try {
          await apiService.inventory.restore(String(id));
          await loadInventory();
        } catch (err: any) {
          setError(getErrorMessage(err, 'Failed to restore item'));
          throw err;
        } finally {
          setProcessingId(null);
        }
      }
    });
  };

  const permanentlyDeleteItem = (id: number, itemName: string) => {
    if (!canMutateInventory) return;
    openConfirmDialog({
      title: 'Permanently Delete Material',
      message: `${itemName} will be permanently deleted from the recycle bin. This action cannot be undone.`,
      confirmText: 'Delete Permanently',
      tone: 'danger',
      requireAcknowledge: true,
      acknowledgeText: 'I understand this permanent deletion cannot be undone.',
      onConfirm: async () => {
        setProcessingId(id);
        setError(null);
        try {
          await apiService.inventory.delete(String(id), true);
          await loadInventory();
        } catch (err: any) {
          setError(getErrorMessage(err, 'Failed to permanently delete item'));
          throw err;
        } finally {
          setProcessingId(null);
        }
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Materials & Inventory</h2>
          <p className="text-gray-500">Live inventory with stock updates and alerts.</p>
        </div>
        <div className="flex gap-2">
          <div className="inline-flex rounded-md border border-gray-200 overflow-hidden">
            <button
              type="button"
              className={`px-3 h-10 text-sm ${deletedMode === 'active' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700'}`}
              onClick={() => setDeletedMode('active')}
            >
              Active
            </button>
            <button
              type="button"
              className={`px-3 h-10 text-sm border-l border-gray-200 ${deletedMode === 'trashed' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700'}`}
              onClick={() => setDeletedMode('trashed')}
            >
              Recycle Bin
            </button>
          </div>
          <RefreshButton onClick={loadInventory} loading={loading} />
          {canMutateInventory && deletedMode === 'active' && (
            <Button className="flex items-center gap-2" onClick={openCreateEditor}>
              <Plus className="w-4 h-4" /> Add Material
            </Button>
          )}
        </div>
      </div>

      {!canMutateInventory && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
          You have read-only access to Materials &amp; Inventory.
        </div>
      )}

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6">
          <p className="text-sm text-gray-500">Total SKU Items</p>
          <p className="text-2xl font-bold">{stats?.total_items ?? 0}</p>
        </Card>
        <Card className="p-6">
          <p className="text-sm text-gray-500">Low Stock Alerts</p>
          <p className="text-2xl font-bold text-amber-600">{stats?.low_stock ?? 0}</p>
        </Card>
        <Card className="p-6">
          <p className="text-sm text-gray-500">Out of Stock</p>
          <p className="text-2xl font-bold text-red-600">{stats?.out_of_stock ?? 0}</p>
        </Card>
      </div>

      <Card>
        <div className="p-4 border-b border-gray-100 flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <Input placeholder="Search inventory..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select
            className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <Table>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-6 py-4 font-semibold text-gray-600">Name</th>
              <th className="px-6 py-4 font-semibold text-gray-600">Category</th>
              <th className="px-6 py-4 font-semibold text-gray-600">Current Qty</th>
              <th className="px-6 py-4 font-semibold text-gray-600">Threshold</th>
              {deletedMode === 'active' && <th className="px-6 py-4 font-semibold text-gray-600">Status</th>}
              <th className="px-6 py-4 font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {!loading && filteredRows.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 font-medium text-gray-900">{item.name}</td>
                <td className="px-6 py-4 text-gray-600">{item.category}</td>
                <td className="px-6 py-4 text-gray-800 font-semibold">{item.quantity} {item.unit}</td>
                <td className="px-6 py-4 text-gray-500">{item.minimum_threshold} {item.unit}</td>
                {deletedMode === 'active' && (
                  <td className="px-6 py-4"><Badge variant={alertVariant(item.alert_level) as any}>{item.alert_level}</Badge></td>
                )}
                <td className="px-6 py-4">
                  {canMutateInventory && deletedMode === 'active' ? (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={stockUpdatingId === item.id || processingId === item.id}
                        onClick={() => openEditEditor(item)}
                        className="h-9 px-3"
                      >
                        <Pencil className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={stockUpdatingId === item.id || processingId === item.id}
                        onClick={() => restock(item.id)}
                      >
                        Restock
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={processingId === item.id || stockUpdatingId === item.id}
                        onClick={() => moveToBin(item.id, item.name)}
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Delete
                      </Button>
                    </div>
                  ) : canMutateInventory && deletedMode === 'trashed' ? (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={processingId === item.id}
                        onClick={() => restoreItem(item.id, item.name)}
                        className="bg-green-600 text-white border border-green-600 hover:bg-green-700 active:bg-green-800"
                      >
                        <RotateCcw className="w-3 h-3 mr-1" />
                        Restore
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={processingId === item.id}
                        onClick={() => permanentlyDeleteItem(item.id, item.name)}
                      >
                        Delete Permanently
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-500">Read-only</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>

        {loading && <div className="p-8 text-sm text-gray-500">Loading inventory...</div>}
        {!loading && filteredRows.length === 0 && <div className="p-8 text-sm text-gray-500">No inventory items found.</div>}
      </Card>

      {editorOpen && canMutateInventory && deletedMode === 'active' && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/45 px-4 py-6">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 className="text-lg font-bold text-slate-900">{editingId ? 'Edit Material' : 'Add Material'}</h3>
              <Button type="button" variant="secondary" size="icon" className="h-9 w-9" onClick={closeEditor}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="max-h-[calc(90vh-73px)] overflow-y-auto px-6 py-5">
              <form className="space-y-5" onSubmit={createItem}>
                <div className="rounded-xl border border-orange-100 bg-orange-50/70 p-5">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-gray-700">Material Name</label>
                      <Input
                        value={newItem.name}
                        onChange={(e) => setNewItem((s) => ({ ...s, name: e.target.value }))}
                        className="h-11"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-gray-700">Category</label>
                      <Input
                        value={newItem.category}
                        onChange={(e) => setNewItem((s) => ({ ...s, category: e.target.value }))}
                        className="h-11"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-gray-700">Current Quantity</label>
                      <Input
                        type="number"
                        min={0}
                        value={newItem.quantity}
                        onChange={(e) => setNewItem((s) => ({ ...s, quantity: e.target.value }))}
                        className="h-11"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-gray-700">Minimum Threshold</label>
                      <Input
                        type="number"
                        min={0}
                        value={newItem.minimum_threshold}
                        onChange={(e) => setNewItem((s) => ({ ...s, minimum_threshold: e.target.value }))}
                        className="h-11"
                        required
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-xs font-semibold text-gray-700">Unit</label>
                      <Input
                        value={newItem.unit}
                        onChange={(e) => setNewItem((s) => ({ ...s, unit: e.target.value }))}
                        className="h-11"
                        required
                      />
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={closeEditor} disabled={creating}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={creating}>
                    {creating ? 'Saving...' : editingId ? 'Save Changes' : 'Add Material'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {restockModal.open && (
        <div className="fixed inset-0 z-[115] flex items-center justify-center bg-slate-900/45 px-4 py-6">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 className="text-lg font-bold text-slate-900">Restock Material</h3>
              <Button type="button" variant="secondary" size="icon" className="h-9 w-9" onClick={closeRestockModal}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="px-6 py-5">
              <form className="space-y-5" onSubmit={submitRestock}>
                <div className="rounded-xl border border-green-100 bg-green-50/70 p-5 space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-700">Material</label>
                    <div className="rounded-md border border-green-200 bg-white px-4 py-3 text-sm font-medium text-gray-900">
                      {restockModal.itemName}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-700">Restock Quantity</label>
                    <Input
                      type="number"
                      min={1}
                      value={restockModal.quantity}
                      onChange={(e) => setRestockModal((prev) => ({ ...prev, quantity: e.target.value }))}
                      className="h-11"
                      required
                    />
                    <p className="text-xs text-gray-600">Unit: {restockModal.unit}</p>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={closeRestockModal} disabled={stockUpdatingId !== null}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="bg-green-600 border-green-600 hover:bg-green-700 active:bg-green-800"
                    disabled={stockUpdatingId !== null}
                  >
                    {stockUpdatingId !== null ? 'Restocking...' : 'Restock Material'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

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
