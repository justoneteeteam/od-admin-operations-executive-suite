
import React, { useState, useEffect } from 'react';
import { Product } from '../../types';
import { inventoryService } from '../../src/services/inventory.service';

interface StockLevelsProps {
    selectedWarehouse: string;
}

interface WarehouseBreakdown {
    warehouseId: string;
    warehouseName?: string;
    fulfillmentCenterId?: string;
    current: number;
    reserved: number;
    outbound: number;
    returning: number;
    partnerSku?: string;
}

interface ProductWithStock extends Product {
    currentStock: number;
    reservedStock: number;
    outboundQty: number;
    returningQty: number;
    warehouseBreakdown: WarehouseBreakdown[];
}

interface WarehouseWithFC {
    id: string;
    name: string;
    fulfillmentCenterId: string;
    location?: string;
    fulfillmentCenter?: {
        id: string;
        name: string;
        code: string;
        country: string;
    };
}

const StockLevelsTable: React.FC<StockLevelsProps> = ({ selectedWarehouse }) => {
    const [products, setProducts] = useState<ProductWithStock[]>([]);
    const [warehouses, setWarehouses] = useState<WarehouseWithFC[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Adjust stock modal
    const [adjustModal, setAdjustModal] = useState<{
        open: boolean;
        product: ProductWithStock | null;
        warehouseId: string;
        warehouseName: string;
    }>({ open: false, product: null, warehouseId: '', warehouseName: '' });
    const [adjustQty, setAdjustQty] = useState<string>('');
    const [adjustMode, setAdjustMode] = useState<'set' | 'add' | 'subtract'>('set');
    const [adjustReason, setAdjustReason] = useState('Manual stock update');
    const [adjustPartnerSku, setAdjustPartnerSku] = useState('');
    const [adjustSaving, setAdjustSaving] = useState(false);
    const [adjustError, setAdjustError] = useState<string | null>(null);

    // For "Assign Stock" modal — FC + WH selection
    const [selectedFCId, setSelectedFCId] = useState<string>('');
    const [selectedWHId, setSelectedWHId] = useState<string>('');

    // Expanded product rows (to show warehouse breakdown)
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        fetchStock();
        fetchWarehouses();
    }, [selectedWarehouse]);

    const fetchStock = async () => {
        setLoading(true);
        try {
            const data = await inventoryService.getStock(selectedWarehouse);
            setProducts(data);
        } catch (err) {
            console.error("Failed to fetch stock levels", err);
        } finally {
            setLoading(false);
        }
    };

    const fetchWarehouses = async () => {
        try {
            const data = await inventoryService.getWarehouses();
            setWarehouses(data);
        } catch (err) {
            console.error("Failed to fetch warehouses", err);
        }
    };

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    // Open modal for existing warehouse row
    const openAdjust = (product: ProductWithStock, warehouseId: string, warehouseName: string) => {
        const wh = product.warehouseBreakdown.find(w => w.warehouseId === warehouseId);
        setAdjustModal({ open: true, product, warehouseId, warehouseName });
        setAdjustQty('');
        setAdjustMode('set');
        setAdjustReason('Manual stock update');
        setAdjustPartnerSku(wh?.partnerSku || '');
        setAdjustError(null);
        setSelectedFCId('');
        setSelectedWHId('');
    };

    // Open modal for "Assign Stock" — no existing warehouse
    const openAssignStock = (product: ProductWithStock) => {
        setAdjustModal({ open: true, product, warehouseId: '', warehouseName: '' });
        setAdjustQty('');
        setAdjustMode('set');
        setAdjustReason('Initial stock assignment');
        setAdjustPartnerSku('');
        setAdjustError(null);
        setSelectedFCId('');
        setSelectedWHId('');
    };

    const handleAdjustSubmit = async () => {
        if (!adjustModal.product) return;

        // Determine which warehouse to use
        const warehouseId = adjustModal.warehouseId || selectedWHId;
        if (!warehouseId) {
            setAdjustError('Please select a fulfillment center and warehouse.');
            return;
        }

        const qty = parseInt(adjustQty);
        if (isNaN(qty) || qty < 0) {
            setAdjustError('Please enter a valid quantity.');
            return;
        }

        setAdjustSaving(true);
        setAdjustError(null);
        try {
            // Find current stock for this product × warehouse
            const wh = adjustModal.product.warehouseBreakdown.find(w => w.warehouseId === warehouseId);
            const currentQty = wh?.current || 0;

            let delta = 0;
            if (adjustMode === 'set') {
                delta = qty - currentQty;
            } else if (adjustMode === 'add') {
                delta = qty;
            } else {
                delta = -qty;
            }

            if (delta === 0 && !adjustPartnerSku) {
                setAdjustModal({ open: false, product: null, warehouseId: '', warehouseName: '' });
                return;
            }

            await inventoryService.adjustStock({
                productId: adjustModal.product.id,
                warehouseId,
                quantity: delta,
                reason: adjustReason,
                type: 'adjustment',
                partnerSku: adjustPartnerSku || undefined,
            });

            setAdjustModal({ open: false, product: null, warehouseId: '', warehouseName: '' });
            fetchStock(); // refresh
        } catch (err: any) {
            console.error('Failed to adjust stock:', err);
            setAdjustError(err?.response?.data?.message || err?.message || 'Failed to adjust stock.');
        } finally {
            setAdjustSaving(false);
        }
    };

    const getWhName = (warehouseId: string) => {
        const w = warehouses.find(w => w.id === warehouseId);
        return w ? w.name : warehouseId.slice(0, 8) + '...';
    };

    const getFCName = (warehouseId: string) => {
        const w = warehouses.find(w => w.id === warehouseId);
        return w?.fulfillmentCenter?.name || '';
    };

    // Group warehouses by FC for the dropdown
    const fcGroups = React.useMemo(() => {
        const groups: { fcId: string; fcName: string; fcCode: string; country: string; warehouses: WarehouseWithFC[] }[] = [];
        const fcMap = new Map<string, typeof groups[number]>();

        for (const wh of warehouses) {
            const fc = wh.fulfillmentCenter;
            if (!fc) continue;
            if (!fcMap.has(fc.id)) {
                const group = { fcId: fc.id, fcName: fc.name, fcCode: fc.code, country: fc.country, warehouses: [] as WarehouseWithFC[] };
                fcMap.set(fc.id, group);
                groups.push(group);
            }
            fcMap.get(fc.id)!.warehouses.push(wh);
        }
        return groups;
    }, [warehouses]);

    // Filtered warehouses based on selected FC for the assign modal
    const filteredWHs = selectedFCId
        ? warehouses.filter(w => w.fulfillmentCenterId === selectedFCId)
        : [];

    // Filter products: exclude any NO-SKU that might slip through, plus search
    const filteredProducts = products.filter(p => {
        const sku = (p.sku || '').toUpperCase();
        if (!sku || sku.startsWith('NO-SKU') || sku.startsWith('NO SKU') || sku.startsWith('NOSKU')) return false;
        if (!searchTerm) return true;
        return p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.sku.toLowerCase().includes(searchTerm.toLowerCase());
    });

    if (loading) {
        return <div className="text-white p-4">Loading stock levels...</div>;
    }

    // Determine if modal needs FC/WH picker (no pre-selected warehouse)
    const needsFCPicker = adjustModal.open && !adjustModal.warehouseId;

    return (
        <>
            <div className="bg-card-dark rounded-xl border border-border-dark overflow-hidden">
                <div className="p-4 border-b border-border-dark flex flex-wrap justify-between items-center bg-[#17232f] gap-3">
                    <div>
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary text-[20px]">inventory_2</span>
                            Stock Levels
                        </h3>
                        <p className="text-xs text-text-muted mt-0.5">
                            <strong>Parent SKU</strong> = internal product SKU. Expand rows to see <strong>child SKUs</strong> per warehouse. Total parent = sum of children.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <span className="material-symbols-outlined absolute left-3 top-2.5 text-text-muted text-sm">search</span>
                            <input
                                type="text"
                                placeholder="Search products..."
                                className="bg-[#0f172a] border border-border-dark text-white text-sm rounded-lg pl-9 p-2 focus:ring-primary focus:border-primary w-64 outline-none"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <span className="px-3 py-1.5 bg-[#1c2d3d] rounded-lg text-xs text-text-muted border border-border-dark font-bold">
                            {filteredProducts.length} products
                        </span>
                    </div>
                </div>

                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-[#17232f] text-[10px] uppercase font-bold text-text-muted tracking-wider">
                            <tr className="border-b border-border-dark">
                                <th className="px-4 py-3 w-10"></th>
                                <th className="px-4 py-3">Product Name</th>
                                <th className="px-4 py-3">Internal SKU</th>
                                <th className="px-4 py-3 text-right">Unit Cost</th>
                                <th className="px-4 py-3 text-right">Available</th>
                                <th className="px-4 py-3 text-right">Committed</th>
                                <th className="px-4 py-3 text-right">Outbound</th>
                                <th className="px-4 py-3 text-right">Returning</th>
                                <th className="px-4 py-3 text-right">Total On Hand</th>
                                <th className="px-4 py-3 text-center">Status</th>
                                <th className="px-4 py-3 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredProducts.map((product) => {
                                const total = product.currentStock || 0;
                                const reserved = product.reservedStock || 0;
                                const available = total - reserved;
                                const outbound = product.outboundQty || 0;
                                const returning = product.returningQty || 0;
                                const reorderPoint = product.reorderPoint || 10;
                                const status = total <= 0 ? 'No Stock'
                                    : available <= 0 ? 'Out of Stock'
                                        : available <= reorderPoint ? 'Low Stock'
                                            : 'Healthy';
                                const isExpanded = expandedIds.has(product.id);
                                const hasBreakdown = product.warehouseBreakdown && product.warehouseBreakdown.length > 0;

                                return (
                                    <React.Fragment key={product.id}>
                                        {/* Parent Row */}
                                        <tr className={`border-b border-border-dark hover:bg-[#1c2d3d]/40 transition-colors ${!hasBreakdown ? 'opacity-70' : ''}`}>
                                            <td className="px-4 py-3">
                                                {hasBreakdown ? (
                                                    <button
                                                        onClick={() => toggleExpand(product.id)}
                                                        className="text-text-muted hover:text-white transition-colors"
                                                    >
                                                        <span className="material-symbols-outlined text-[16px]" style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
                                                            chevron_right
                                                        </span>
                                                    </button>
                                                ) : (
                                                    <span className="text-text-muted/30 material-symbols-outlined text-[16px]">chevron_right</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 font-medium text-white">{product.name}</td>
                                            <td className="px-4 py-3 text-text-muted font-mono text-xs uppercase">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded text-[9px] font-bold">PARENT</span>
                                                    {product.sku}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right text-white">€{Number(product.unitCost || 0).toFixed(2)}</td>
                                            <td className="px-4 py-3 text-right font-bold text-blue-400">{available}</td>
                                            <td className="px-4 py-3 text-right text-orange-400">{reserved}</td>
                                            <td className="px-4 py-3 text-right text-purple-400">{outbound}</td>
                                            <td className="px-4 py-3 text-right text-pink-400">{returning}</td>
                                            <td className="px-4 py-3 text-right font-bold text-white">{total}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                                                    status === 'No Stock' ? 'bg-gray-500/10 text-gray-400 border-gray-500/20' :
                                                    status === 'Out of Stock' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                                    status === 'Low Stock' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                                                    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                }`}>
                                                    {status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {hasBreakdown ? (
                                                    <button
                                                        onClick={() => toggleExpand(product.id)}
                                                        className="text-primary hover:text-primary/80 text-xs font-bold transition-colors"
                                                        title="Expand to adjust stock per warehouse"
                                                    >
                                                        {isExpanded ? 'Collapse' : 'Manage'}
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => openAssignStock(product)}
                                                        className="flex items-center gap-1 mx-auto px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 text-[10px] font-bold uppercase tracking-wider transition-colors"
                                                        title="Assign stock to a fulfillment center / warehouse"
                                                    >
                                                        <span className="material-symbols-outlined text-[12px]">add_circle</span>
                                                        Assign Stock
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                        {/* Expanded warehouse child rows */}
                                        {isExpanded && hasBreakdown && (
                                            <>
                                                {product.warehouseBreakdown.map((wh, idx) => {
                                                    const whAvailable = wh.current - wh.reserved;
                                                    const whName = wh.warehouseName || getWhName(wh.warehouseId);
                                                    const fcName = wh.fulfillmentCenterId ? (() => {
                                                        const w = warehouses.find(w => w.id === wh.warehouseId);
                                                        return w?.fulfillmentCenter?.name || '';
                                                    })() : '';
                                                    return (
                                                        <tr key={`${product.id}-${wh.warehouseId}`} className="bg-[#14202c] border-b border-border-dark/50">
                                                            <td className="px-4 py-2.5"></td>
                                                            <td className="px-4 py-2.5" colSpan={1}>
                                                                <div className="flex items-center gap-2 pl-4">
                                                                    <span className="material-symbols-outlined text-amber-400 text-[14px]">warehouse</span>
                                                                    <div>
                                                                        <span className="text-xs text-white font-medium">{whName}</span>
                                                                        {fcName && (
                                                                            <span className="text-[9px] text-text-muted ml-2">
                                                                                ({fcName})
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-2.5">
                                                                <div className="flex items-center gap-1.5 pl-0">
                                                                    <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded text-[9px] font-bold">CHILD</span>
                                                                    <span className="text-xs font-mono text-text-muted uppercase">
                                                                        {wh.partnerSku || <span className="text-text-muted/40 italic text-[10px]">no child sku</span>}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-2.5 text-right text-text-muted text-xs">—</td>
                                                            <td className="px-4 py-2.5 text-right text-xs font-bold text-blue-400">{whAvailable}</td>
                                                            <td className="px-4 py-2.5 text-right text-xs text-orange-400">{wh.reserved}</td>
                                                            <td className="px-4 py-2.5 text-right text-xs text-purple-400">{wh.outbound}</td>
                                                            <td className="px-4 py-2.5 text-right text-xs text-pink-400">{wh.returning}</td>
                                                            <td className="px-4 py-2.5 text-right text-xs font-bold text-white">{wh.current}</td>
                                                            <td className="px-4 py-2.5 text-center">
                                                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${
                                                                    whAvailable <= 0 ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                                                    whAvailable <= (product.reorderPoint || 10) ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                                                                    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                                }`}>
                                                                    {whAvailable <= 0 ? 'Out' : whAvailable <= (product.reorderPoint || 10) ? 'Low' : 'OK'}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-2.5 text-center">
                                                                <button
                                                                    onClick={() => openAdjust(product, wh.warehouseId, whName)}
                                                                    className="flex items-center gap-1 mx-auto px-2.5 py-1 rounded-lg bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 text-[10px] font-bold uppercase tracking-wider transition-colors"
                                                                >
                                                                    <span className="material-symbols-outlined text-[12px]">edit</span>
                                                                    Set Stock
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                                {/* Add stock to another warehouse */}
                                                <tr className="bg-[#14202c]/50 border-b border-border-dark/50">
                                                    <td colSpan={11} className="px-8 py-2">
                                                        <button
                                                            onClick={() => openAssignStock(product)}
                                                            className="flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 text-[10px] font-bold uppercase tracking-wider transition-colors"
                                                        >
                                                            <span className="material-symbols-outlined text-[14px]">add_circle</span>
                                                            Add stock to another FC / warehouse
                                                        </button>
                                                    </td>
                                                </tr>
                                            </>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                            {filteredProducts.length === 0 && (
                                <tr>
                                    <td colSpan={11} className="px-6 py-8 text-center text-text-muted">
                                        No products found matching your search.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ─── Adjust Stock Modal ─────────────────────────── */}
            {adjustModal.open && adjustModal.product && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
                    <div className="bg-[#111a22] p-6 rounded-xl border border-border-dark w-full max-w-md animate-in zoom-in-95 duration-200 shadow-2xl">
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <h2 className="text-lg font-bold text-white">
                                    {needsFCPicker ? 'Assign Stock' : 'Adjust Stock'}
                                </h2>
                                <p className="text-xs text-text-muted mt-1">
                                    {adjustModal.product.name} · <span className="font-mono uppercase">{adjustModal.product.sku}</span>
                                </p>
                            </div>
                            <button
                                onClick={() => setAdjustModal({ open: false, product: null, warehouseId: '', warehouseName: '' })}
                                className="size-8 flex items-center justify-center rounded-full hover:bg-red-500/10 hover:text-red-500 text-text-muted transition-all"
                            >
                                <span className="material-symbols-outlined text-[18px]">close</span>
                            </button>
                        </div>

                        {/* FC / Warehouse Picker — shown when no warehouse pre-selected */}
                        {needsFCPicker && (
                            <div className="space-y-3 mb-4">
                                <div>
                                    <label className="block text-text-muted text-xs font-medium mb-1">Fulfillment Center</label>
                                    <select
                                        value={selectedFCId}
                                        onChange={(e) => { setSelectedFCId(e.target.value); setSelectedWHId(''); }}
                                        className="w-full bg-[#1c2d3d] border border-border-dark rounded-lg p-2.5 text-white text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                                    >
                                        <option value="">— Select Fulfillment Center —</option>
                                        {fcGroups.map(fc => (
                                            <option key={fc.fcId} value={fc.fcId}>
                                                {fc.fcName} ({fc.fcCode}) — {fc.country}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                {selectedFCId && (
                                    <div>
                                        <label className="block text-text-muted text-xs font-medium mb-1">Warehouse</label>
                                        <select
                                            value={selectedWHId}
                                            onChange={(e) => setSelectedWHId(e.target.value)}
                                            className="w-full bg-[#1c2d3d] border border-border-dark rounded-lg p-2.5 text-white text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                                        >
                                            <option value="">— Select Warehouse —</option>
                                            {filteredWHs.map(wh => (
                                                <option key={wh.id} value={wh.id}>
                                                    {wh.name}{wh.location ? ` (${wh.location})` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Existing warehouse info — shown when warehouse is pre-selected */}
                        {!needsFCPicker && (
                            <div className="bg-[#17232f] rounded-lg p-3 mb-4 border border-border-dark flex items-center gap-2">
                                <span className="material-symbols-outlined text-amber-400 text-[16px]">warehouse</span>
                                <div className="flex-1">
                                    <span className="text-sm text-white font-medium">{adjustModal.warehouseName}</span>
                                    {adjustModal.warehouseId && (
                                        <span className="text-[10px] text-text-muted ml-2">
                                            ({getFCName(adjustModal.warehouseId)})
                                        </span>
                                    )}
                                </div>
                                <span className="text-xs text-text-muted">
                                    Current: <span className="font-bold text-white">{
                                        adjustModal.product.warehouseBreakdown.find(w => w.warehouseId === adjustModal.warehouseId)?.current || 0
                                    }</span>
                                </span>
                            </div>
                        )}

                        {adjustError && (
                            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm">{adjustError}</div>
                        )}

                        {/* Mode selector */}
                        <div className="flex rounded-lg border border-border-dark overflow-hidden mb-4">
                            {[
                                { mode: 'set' as const, label: 'Set to', icon: 'pin' },
                                { mode: 'add' as const, label: 'Add', icon: 'add' },
                                { mode: 'subtract' as const, label: 'Subtract', icon: 'remove' },
                            ].map(m => (
                                <button
                                    key={m.mode}
                                    onClick={() => setAdjustMode(m.mode)}
                                    className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1 transition-colors ${
                                        adjustMode === m.mode
                                            ? 'bg-primary text-white'
                                            : 'bg-[#1c2d3d] text-text-muted hover:text-white'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-[14px]">{m.icon}</span>
                                    {m.label}
                                </button>
                            ))}
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-text-muted text-xs font-medium mb-1">
                                    {adjustMode === 'set' ? 'New quantity' : adjustMode === 'add' ? 'Quantity to add' : 'Quantity to subtract'}
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    className="w-full bg-[#1c2d3d] border border-border-dark rounded-lg p-3 text-white text-lg font-bold focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                                    value={adjustQty}
                                    onChange={e => setAdjustQty(e.target.value)}
                                    autoFocus={!needsFCPicker}
                                />
                            </div>
                            <div>
                                <label className="block text-text-muted text-xs font-medium mb-1">
                                    Warehouse Child SKU <span className="text-text-muted/50">(partner SKU for this warehouse)</span>
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. WH-IT-SKU-001"
                                    className="w-full bg-[#1c2d3d] border border-border-dark rounded-lg p-2.5 text-white text-sm font-mono focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                                    value={adjustPartnerSku}
                                    onChange={e => setAdjustPartnerSku(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-text-muted text-xs font-medium mb-1">Reason</label>
                                <input
                                    type="text"
                                    className="w-full bg-[#1c2d3d] border border-border-dark rounded-lg p-2.5 text-white text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                                    value={adjustReason}
                                    onChange={e => setAdjustReason(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Preview delta */}
                        {adjustQty !== '' && !isNaN(parseInt(adjustQty)) && (
                            <div className="mt-3 p-3 bg-[#17232f] rounded-lg border border-border-dark">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-text-muted">After adjustment:</span>
                                    <span className="font-bold text-white">
                                        {(() => {
                                            const whId = adjustModal.warehouseId || selectedWHId;
                                            const current = adjustModal.product!.warehouseBreakdown.find(w => w.warehouseId === whId)?.current || 0;
                                            const qty = parseInt(adjustQty) || 0;
                                            if (adjustMode === 'set') return qty;
                                            if (adjustMode === 'add') return current + qty;
                                            return Math.max(0, current - qty);
                                        })()} units
                                    </span>
                                </div>
                            </div>
                        )}

                        <div className="flex gap-3 justify-end mt-5 pt-4 border-t border-border-dark">
                            <button
                                onClick={() => setAdjustModal({ open: false, product: null, warehouseId: '', warehouseName: '' })}
                                className="px-5 py-2.5 rounded-lg bg-gray-600 text-white hover:bg-gray-500 font-medium text-sm transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAdjustSubmit}
                                disabled={adjustSaving || !adjustQty || (needsFCPicker && !selectedWHId)}
                                className="px-5 py-2.5 rounded-lg bg-primary text-white hover:bg-primary/90 font-bold text-sm transition-colors disabled:opacity-50"
                            >
                                {adjustSaving ? 'Saving...' : 'Confirm Adjustment'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default StockLevelsTable;
