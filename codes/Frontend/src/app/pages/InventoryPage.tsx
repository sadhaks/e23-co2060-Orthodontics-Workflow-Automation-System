import React, { useEffect, useMemo, useState } from 'react';
import { Card, Badge, Button, Table, Input } from '../components/UI';
import { Plus, Search, RefreshCcw, Trash2, RotateCcw } from 'lucide-react';
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
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newItem, setNewItem] = useState(initialNewItem);
  const [stockUpdatingId, setStockUpdatingId] = useState<number | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [deletedMode, setDeletedMode] = useState<'active' | 'trashed'>('active');
  const canMutateInventory = user?.role === 'NURSE';

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

  const createItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canMutateInventory) return;
    setCreating(true);
    setError(null);
    try {
      await apiService.inventory.create({
        name: newItem.name,
        category: newItem.category,
        quantity: Number(newItem.quantity),
        minimum_threshold: Number(newItem.minimum_threshold),
        unit: newItem.unit,
      });
      setShowCreate(false);
      setNewItem(initialNewItem);
      await loadInventory();
    } catch (err: any) {
      setError(err?.message || 'Failed to create inventory item');
    } finally {
      setCreating(false);
    }
  };

  const restock = async (id: number) => {
    if (!canMutateInventory) return;
    const qtyText = window.prompt('Enter restock quantity');
    const qty = Number(qtyText);
    if (!qtyText || !Number.isFinite(qty) || qty <= 0) return;

    setStockUpdatingId(id);
    setError(null);
    try {
      await apiService.inventory.updateStock(String(id), {
        transaction_type: 'IN',
        quantity: qty,
        reference_type: 'PURCHASE',
        notes: 'Restocked from inventory page',
      });
      await loadInventory();
    } catch (err: any) {
      setError(err?.message || 'Failed to restock');
    } finally {
      setStockUpdatingId(null);
    }
  };

  const moveToBin = async (id: number) => {
    if (!canMutateInventory) return;
    if (!window.confirm('Move this item to recycle bin?')) return;
    setProcessingId(id);
    setError(null);
    try {
      await apiService.inventory.delete(String(id));
      await loadInventory();
    } catch (err: any) {
      setError(err?.message || 'Failed to move item to bin');
    } finally {
      setProcessingId(null);
    }
  };

  const restoreItem = async (id: number) => {
    if (!canMutateInventory) return;
    setProcessingId(id);
    setError(null);
    try {
      await apiService.inventory.restore(String(id));
      await loadInventory();
    } catch (err: any) {
      setError(err?.message || 'Failed to restore item');
    } finally {
      setProcessingId(null);
    }
  };

  const permanentlyDeleteItem = async (id: number) => {
    if (!canMutateInventory) return;
    if (!window.confirm('Permanently delete this item from recycle bin? This cannot be undone.')) return;
    setProcessingId(id);
    setError(null);
    try {
      await apiService.inventory.delete(String(id), true);
      await loadInventory();
    } catch (err: any) {
      setError(err?.message || 'Failed to permanently delete item');
    } finally {
      setProcessingId(null);
    }
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
          <Button variant="secondary" className="flex items-center gap-2" onClick={loadInventory}>
            <RefreshCcw className="w-4 h-4" /> Refresh
          </Button>
          {canMutateInventory && deletedMode === 'active' && (
            <Button className="flex items-center gap-2" onClick={() => setShowCreate((v) => !v)}>
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

      {showCreate && canMutateInventory && deletedMode === 'active' && (
        <Card className="p-4">
          <form className="grid grid-cols-1 md:grid-cols-5 gap-3" onSubmit={createItem}>
            <Input placeholder="Name" value={newItem.name} onChange={(e) => setNewItem((s) => ({ ...s, name: e.target.value }))} required />
            <Input placeholder="Category" value={newItem.category} onChange={(e) => setNewItem((s) => ({ ...s, category: e.target.value }))} required />
            <Input type="number" min={0} placeholder="Quantity" value={newItem.quantity} onChange={(e) => setNewItem((s) => ({ ...s, quantity: e.target.value }))} required />
            <Input type="number" min={0} placeholder="Threshold" value={newItem.minimum_threshold} onChange={(e) => setNewItem((s) => ({ ...s, minimum_threshold: e.target.value }))} required />
            <Button type="submit" disabled={creating}>{creating ? 'Creating...' : 'Create'}</Button>
          </form>
        </Card>
      )}

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
                        onClick={() => restock(item.id)}
                      >
                        Restock
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={processingId === item.id || stockUpdatingId === item.id}
                        onClick={() => moveToBin(item.id)}
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
                        onClick={() => restoreItem(item.id)}
                        className="bg-green-600 text-white border border-green-600 hover:bg-green-700 active:bg-green-800"
                      >
                        <RotateCcw className="w-3 h-3 mr-1" />
                        Restore
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={processingId === item.id}
                        onClick={() => permanentlyDeleteItem(item.id)}
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
    </div>
  );
}
