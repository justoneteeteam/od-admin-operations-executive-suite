import React, { useState, useEffect } from 'react';
import { Product } from '../../types';
import { inventoryService } from '../../src/services/inventory.service';
import { adsCampaignsService } from '../../src/services/ads-campaigns.service';
import WriteOffModal from './WriteOffModal';
import PORecommendationModal from './PORecommendationModal';

interface ProductDetailDashboardProps {
    isOpen: boolean;
    product: Product | null;
    onClose: () => void;
    onEdit?: (product: Product) => void;
}

interface StockSummary {
    productId: string;
    available: number;
    committed: number;
    outboundQty: number;
    returningQty: number;
    totalFloat: number;
    warehouses: {
        warehouseId: string;
        warehouseName: string;
        current: number;
        reserved: number;
        outbound: number;
        returning: number;
        partnerSku?: string;
    }[];
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

interface Transaction {
    id: string;
    type: string;
    quantity: number;
    referenceId?: string;
    reason?: string;
    createdAt: string;
    product?: { name: string; sku: string };
    warehouse?: { name: string };
}

type TabId = 'overview' | 'warehouses' | 'transactions' | 'planning' | 'history';

const ProductDetailDashboard: React.FC<ProductDetailDashboardProps> = ({ isOpen, product, onClose, onEdit }) => {
    const [activeTab, setActiveTab] = useState<TabId>('overview');
    const [stockSummary, setStockSummary] = useState<StockSummary | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(false);
    const [txLoading, setTxLoading] = useState(false);
    const [adsData, setAdsData] = useState<any>(null);
    const [adsLoading, setAdsLoading] = useState(false);
    const [adsPeriod, setAdsPeriod] = useState('30');

    const [isWriteOffOpen, setWriteOffOpen] = useState(false);
    const [isPOOpen, setPOOpen] = useState(false);

    // Expanded warehouse rows
    const [expandedWHs, setExpandedWHs] = useState<Set<string>>(new Set());

    // All warehouses (with FC) for the assign modal
    const [allWarehouses, setAllWarehouses] = useState<WarehouseWithFC[]>([]);

    // Stock adjust modal
    const [adjustOpen, setAdjustOpen] = useState(false);
    const [adjustWhId, setAdjustWhId] = useState('');
    const [adjustWhName, setAdjustWhName] = useState('');
    const [adjustMode, setAdjustMode] = useState<'set' | 'add' | 'subtract'>('set');
    const [adjustQty, setAdjustQty] = useState('');
    const [adjustPartnerSku, setAdjustPartnerSku] = useState('');
    const [adjustPartnerSkuName, setAdjustPartnerSkuName] = useState('');
    const [adjustReason, setAdjustReason] = useState('Manual stock update');
    const [adjustError, setAdjustError] = useState<string | null>(null);
    const [adjustSaving, setAdjustSaving] = useState(false);
    const [selectedFCId, setSelectedFCId] = useState('');
    const [selectedWHId, setSelectedWHId] = useState('');

    // Bulk child SKU modal
    const [bulkChildSkuOpen, setBulkChildSkuOpen] = useState(false);
    const [bulkChildSkus, setBulkChildSkus] = useState<{warehouseId: string; warehouseName: string; partnerSku: string; partnerSkuName: string}[]>([]);
    const [bulkSaving, setBulkSaving] = useState(false);

    useEffect(() => {
        if (isOpen && product) {
            setActiveTab('overview');
            fetchStock();
            fetchAds();
            fetchWarehouses();
        }
    }, [isOpen, product]);

    useEffect(() => {
        if (isOpen && product && activeTab === 'transactions') {
            fetchTransactions();
        }
    }, [activeTab, isOpen, product]);

    const fetchStock = async () => {
        if (!product) return;
        setLoading(true);
        try {
            const data = await inventoryService.getProductSummary(product.id);
            setStockSummary(data);
        } catch (err) {
            console.error('Failed to fetch product stock summary', err);
            // Fallback: try from full stock endpoint
            try {
                const allStock = await inventoryService.getStock();
                const matched = allStock.find((p: any) => p.id === product.id);
                if (matched) {
                    const totalCurrent = matched.currentStock || 0;
                    const totalReserved = matched.reservedStock || 0;
                    setStockSummary({
                        productId: product.id,
                        available: totalCurrent - totalReserved,
                        committed: totalReserved,
                        outboundQty: matched.outboundQty || 0,
                        returningQty: matched.returningQty || 0,
                        totalFloat: (matched.outboundQty || 0) + (matched.returningQty || 0),
                        warehouses: (matched.warehouseBreakdown || []).map((wh: any) => ({
                            warehouseId: wh.warehouseId,
                            warehouseName: wh.warehouseName || wh.warehouseId,
                            current: wh.current,
                            reserved: wh.reserved,
                            outbound: wh.outbound || 0,
                            returning: wh.returning || 0,
                            partnerSku: wh.partnerSku || null,
                        })),
                    });
                }
            } catch (e) { /* ignore */ }
        } finally {
            setLoading(false);
        }
    };

    const fetchTransactions = async () => {
        if (!product) return;
        setTxLoading(true);
        try {
            const data = await inventoryService.getTransactions(undefined, product.id);
            setTransactions(data);
        } catch (err) {
            console.error('Failed to fetch transactions', err);
        } finally {
            setTxLoading(false);
        }
    };

    const fetchAds = async () => {
        if (!product) return;
        setAdsLoading(true);
        try {
            const data: any = await adsCampaignsService.getAll({ sku: product.sku } as any);
            const records = Array.isArray(data) ? data : (data?.data || []);
            let totalSpend = 0, totalLeads = 0, totalConfirmed = 0, totalOrders = 0, totalReturns = 0;
            for (const r of records) {
                totalSpend += Number(r.adSpend || 0);
                totalLeads += Number(r.leads || 0);
                totalConfirmed += Number(r.confirmed || 0);
                totalOrders += Number(r.orders || 0);
                totalReturns += Number(r.returns || 0);
            }
            const revenue = totalOrders * Number(product.sellingPrice || 0);
            setAdsData({
                totalSpend, totalLeads, totalConfirmed, totalOrders, totalReturns, revenue,
                cpc: totalLeads > 0 ? totalSpend / (totalLeads * 3) : 0,
                cpl: totalLeads > 0 ? totalSpend / totalLeads : 0,
                cpo: totalOrders > 0 ? totalSpend / totalOrders : 0,
                roas: totalSpend > 0 ? revenue / totalSpend : 0,
                cvr: totalLeads > 0 ? (totalOrders / totalLeads * 100) : 0,
                returnRate: totalOrders > 0 ? (totalReturns / totalOrders * 100) : 0,
            });
        } catch (err) {
            console.error('Failed to fetch ads data', err);
        } finally {
            setAdsLoading(false);
        }
    };

    const fetchWarehouses = async () => {
        try {
            const data = await inventoryService.getWarehouses();
            setAllWarehouses(data);
        } catch (err) {
            console.error('Failed to fetch warehouses', err);
        }
    };

    const toggleWH = (id: string) => {
        setExpandedWHs(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    // Open adjust modal for a specific warehouse
    const openAdjust = (warehouseId: string, warehouseName: string, partnerSku?: string, partnerSkuName?: string) => {
        setAdjustOpen(true);
        setAdjustWhId(warehouseId);
        setAdjustWhName(warehouseName);
        setAdjustMode('set');
        setAdjustQty('');
        setAdjustPartnerSku(partnerSku || '');
        setAdjustPartnerSkuName(partnerSkuName || '');
        setAdjustReason('Manual stock update');
        setAdjustError(null);
        setSelectedFCId('');
        setSelectedWHId('');
    };

    // Open assign stock modal (no pre-selected warehouse)
    const openAssignStock = () => {
        setAdjustOpen(true);
        setAdjustWhId('');
        setAdjustWhName('');
        setAdjustMode('set');
        setAdjustQty('');
        setAdjustPartnerSku('');
        setAdjustPartnerSkuName('');
        setAdjustReason('Initial stock assignment');
        setAdjustError(null);
        setSelectedFCId('');
        setSelectedWHId('');
    };

    // Open bulk child SKU management modal
    const openBulkChildSkus = () => {
        if (!stockSummary) return;
        setBulkChildSkus(stockSummary.warehouses.map(wh => ({
            warehouseId: wh.warehouseId,
            warehouseName: wh.warehouseName,
            partnerSku: (wh as any).partnerSku || '',
            partnerSkuName: (wh as any).partnerSkuName || '',
        })));
        setBulkChildSkuOpen(true);
    };

    // Save all bulk child SKU changes
    const handleBulkChildSkuSave = async () => {
        if (!product) return;
        setBulkSaving(true);
        try {
            for (const row of bulkChildSkus) {
                const original = stockSummary?.warehouses.find(w => w.warehouseId === row.warehouseId);
                const origSku = (original as any)?.partnerSku || '';
                const origName = (original as any)?.partnerSkuName || '';
                if (row.partnerSku !== origSku || row.partnerSkuName !== origName) {
                    await inventoryService.adjustStock({
                        productId: product.id,
                        warehouseId: row.warehouseId,
                        quantity: 0,
                        reason: 'Child SKU update',
                        type: 'adjustment',
                        partnerSku: row.partnerSku || undefined,
                        partnerSkuName: row.partnerSkuName || undefined,
                    });
                }
            }
            setBulkChildSkuOpen(false);
            fetchStock();
        } catch (err: any) {
            console.error('Bulk child SKU save failed:', err);
        } finally {
            setBulkSaving(false);
        }
    };

    const handleAdjustSubmit = async () => {
        if (!product) return;
        const warehouseId = adjustWhId || selectedWHId;
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
            const existingWh = stockSummary?.warehouses.find(w => w.warehouseId === warehouseId);
            const currentQty = existingWh?.current || 0;
            let delta = 0;
            if (adjustMode === 'set') delta = qty - currentQty;
            else if (adjustMode === 'add') delta = qty;
            else delta = -qty;

            if (delta === 0 && !adjustPartnerSku && !adjustPartnerSkuName) {
                setAdjustOpen(false);
                return;
            }

            await inventoryService.adjustStock({
                productId: product.id,
                warehouseId,
                quantity: delta,
                reason: adjustReason,
                type: 'adjustment',
                partnerSku: adjustPartnerSku || undefined,
                partnerSkuName: adjustPartnerSkuName || undefined,
            });

            setAdjustOpen(false);
            fetchStock(); // refresh
        } catch (err: any) {
            console.error('Failed to adjust stock:', err);
            setAdjustError(err?.response?.data?.message || err?.message || 'Failed to adjust stock.');
        } finally {
            setAdjustSaving(false);
        }
    };

    // FC groups for the picker
    const fcGroups = React.useMemo(() => {
        const groups: { fcId: string; fcName: string; fcCode: string; country: string; warehouses: WarehouseWithFC[] }[] = [];
        const fcMap = new Map<string, typeof groups[number]>();
        for (const wh of allWarehouses) {
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
    }, [allWarehouses]);

    const filteredWHs = selectedFCId ? allWarehouses.filter(w => w.fulfillmentCenterId === selectedFCId) : [];

    if (!isOpen || !product) return null;

    const onHand = stockSummary ? stockSummary.warehouses.reduce((s, w) => s + w.current, 0) : (product.stockLevel || 0);
    const committed = stockSummary?.committed || 0;
    const available = stockSummary?.available || (onHand - committed);
    const inTransit = stockSummary?.outboundQty || 0;
    const returning = stockSummary?.returningQty || 0;

    const unitCost = Number(product.unitCost || 0);
    const sellingPrice = Number((product as any).sellingPrice || 0);
    const grossMargin = sellingPrice > 0 ? Math.round(((sellingPrice - unitCost) / sellingPrice) * 100) : 0;

    const imgUrl = product.primaryImageUrl || (() => {
        try { return JSON.parse(product.imagesUrls || '[]')[0]; } catch { return null; }
    })();

    const statusColor = (product as any).status === 'Active'
        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
        : 'bg-gray-500/20 text-gray-400 border-gray-500/30';

    const tabs: { id: TabId; label: string }[] = [
        { id: 'overview', label: 'Overview' },
        { id: 'warehouses', label: 'Warehouses' },
        { id: 'transactions', label: 'Transactions' },
        { id: 'planning', label: 'Planning' },
        { id: 'history', label: 'History' },
    ];

    const getStockStatus = (current: number, reorderPoint: number = 10) => {
        if (current <= 0) return { label: 'Out of stock', color: 'bg-red-500/15 text-red-400 border-red-500/25' };
        if (current <= reorderPoint) return { label: 'Low stock', color: 'bg-orange-500/15 text-orange-400 border-orange-500/25' };
        return { label: 'Healthy', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' };
    };

    const formatTxType = (type: string) => {
        const map: Record<string, { label: string; color: string }> = {
            purchase_in: { label: 'Purchase In', color: 'text-emerald-400' },
            order_out: { label: 'Order Out', color: 'text-red-400' },
            adjustment: { label: 'Adjustment', color: 'text-blue-400' },
            transfer_in: { label: 'Transfer In', color: 'text-cyan-400' },
            transfer_out: { label: 'Transfer Out', color: 'text-orange-400' },
            return_restock: { label: 'Return Restock', color: 'text-purple-400' },
            write_off: { label: 'Write Off', color: 'text-red-500' },
            manual_return: { label: 'Manual Return', color: 'text-pink-400' },
        };
        return map[type] || { label: type, color: 'text-gray-400' };
    };

    const needsFCPicker = adjustOpen && !adjustWhId;

    return (
        <div className="fixed inset-0 z-[200] flex justify-end">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full sm:w-[680px] h-full bg-[#0d1520] border-l border-border-dark flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">

                {/* ─── Header ──────────────────────────────────────── */}
                <div className="px-6 py-4 border-b border-border-dark bg-[#111a22] flex-shrink-0">
                    <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0 pr-4">
                            <h2 className="text-2xl font-black text-white leading-tight">{product.name}</h2>
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                                <span className="px-2.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20 font-mono">
                                    PARENT: {product.sku}
                                </span>
                                {onEdit && (
                                    <button
                                        onClick={() => onEdit(product)}
                                        className="size-5 flex items-center justify-center rounded hover:bg-primary/20 text-primary/60 hover:text-primary transition-all -ml-1"
                                        title="Edit parent SKU"
                                    >
                                        <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>edit</span>
                                    </button>
                                )}
                                <span className={`px-2.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider border ${statusColor}`}>
                                    {(product as any).status || 'Active'}
                                </span>
                                {(product as any).category && (
                                    <span className="px-2.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-[#1c2d3d] text-text-muted border border-border-dark">
                                        {(product as any).category}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                            {onEdit && (
                                <button
                                    onClick={() => onEdit(product)}
                                    className="size-8 flex items-center justify-center rounded-lg hover:bg-blue-500/10 hover:text-blue-400 text-text-muted transition-all"
                                    title="Edit product"
                                >
                                    <span className="material-symbols-outlined text-[18px]">edit</span>
                                </button>
                            )}
                            <button
                                onClick={() => openAssignStock()}
                                className="text-xs font-bold px-3 py-1.5 rounded-lg bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 transition-colors"
                            >
                                Adjust stock
                            </button>
                            <button
                                className="size-8 flex items-center justify-center rounded-lg hover:bg-[#233648] text-text-muted transition-all ml-1"
                                title="More options"
                            >
                                <span className="material-symbols-outlined text-[18px]">more_horiz</span>
                            </button>
                            <button onClick={onClose} className="size-8 flex items-center justify-center rounded-full hover:bg-red-500/10 hover:text-red-500 text-text-muted transition-all ml-1">
                                <span className="material-symbols-outlined text-[18px]">close</span>
                            </button>
                        </div>
                    </div>

                    {/* ─── Tab Bar ──────────────────────────────────── */}
                    <div className="flex gap-1 -mb-4 mt-1">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                                    activeTab === tab.id
                                        ? 'border-primary text-primary'
                                        : 'border-transparent text-text-muted hover:text-white'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ─── Content ─────────────────────────────────────── */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">

                    {/* ═══ Overview Tab ═══ */}
                    {activeTab === 'overview' && (
                        <div className="p-6 space-y-6">
                            {/* KPI Cards Row */}
                            <div className="grid grid-cols-5 gap-2">
                                {[
                                    { label: 'ON HAND', value: onHand, color: 'text-white' },
                                    { label: 'COMMITTED', value: committed, color: 'text-orange-400' },
                                    { label: 'AVAILABLE', value: available, color: 'text-emerald-400' },
                                    { label: 'IN TRANSIT', value: inTransit, color: 'text-blue-400' },
                                    { label: 'RETURNING', value: returning, color: 'text-purple-400' },
                                ].map((kpi, idx) => (
                                    <div key={idx} className="bg-[#111a22] rounded-xl p-3 border border-border-dark">
                                        <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">{kpi.label}</div>
                                        <div className={`text-2xl font-black ${kpi.color}`}>{kpi.value.toLocaleString()}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Basic Information + Image */}
                            <div className="grid grid-cols-[1fr,auto] gap-4">
                                <div>
                                    <h3 className="text-xs font-black text-primary uppercase tracking-widest mb-3">Basic Information</h3>
                                    <div className="space-y-0">
                                        {[
                                            { label: 'Internal SKU (Parent)', value: product.sku },
                                            { label: 'Product name', value: product.name },
                                            { label: 'Category', value: (product as any).category || '—' },
                                            { label: 'Unit of measure', value: 'Pieces' },
                                            { label: 'Unit cost', value: `€${unitCost.toFixed(2)}` },
                                            { label: 'Selling price', value: `€${sellingPrice.toFixed(2)}` },
                                            { label: 'Gross margin', value: <span className={grossMargin >= 50 ? 'text-emerald-400' : grossMargin >= 30 ? 'text-amber-400' : 'text-red-400'}>{grossMargin}%</span> },
                                            { label: 'Preferred supplier', value: (product as any).supplier?.name || '—' },
                                            { label: 'Lead time', value: '7 days' },
                                            { label: 'Reorder point', value: `${product.reorderPoint || 10} units` },
                                        ].map((row, idx) => (
                                            <div key={idx} className="flex justify-between items-center py-2 border-b border-border-dark/50 last:border-0">
                                                <span className="text-sm text-text-muted">{row.label}</span>
                                                <span className="text-sm font-bold text-white text-right">{row.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Product Image */}
                                <div className="w-48 flex-shrink-0">
                                    <div className="w-full aspect-square rounded-xl border border-border-dark bg-[#111a22] overflow-hidden flex items-center justify-center">
                                        {imgUrl ? (
                                            <img src={imgUrl} alt={product.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="flex flex-col items-center gap-2 text-text-muted">
                                                <span className="material-symbols-outlined text-4xl">image</span>
                                                <span className="text-xs">No image</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Inventory by FC - Compact */}
                                    {stockSummary && stockSummary.warehouses.length > 0 && (
                                        <div className="mt-4">
                                            <h4 className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-2">
                                                Child SKUs by Warehouse
                                            </h4>
                                            <div className="bg-[#111a22] rounded-xl border border-border-dark overflow-hidden">
                                                <div className="flex items-center justify-between px-3 py-2 border-b border-border-dark text-[10px] font-bold text-text-muted uppercase">
                                                    <span>Warehouse / Child SKU</span>
                                                    <span>Stock</span>
                                                </div>
                                                {stockSummary.warehouses.map((wh, idx) => {
                                                    const status = getStockStatus(wh.current, product.reorderPoint || 10);
                                                    return (
                                                        <div key={idx} className="px-3 py-2.5 border-b border-border-dark/50 last:border-0 hover:bg-[#1c2d3d]/30 transition-colors">
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="material-symbols-outlined text-amber-400 text-[14px]">warehouse</span>
                                                                    <span className="text-xs text-white font-medium">{wh.warehouseName}</span>
                                                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${status.color}`}>
                                                                        {status.label}
                                                                    </span>
                                                                </div>
                                                                <span className={`text-sm font-bold ${wh.current > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                                    {wh.current}
                                                                </span>
                                                            </div>
                                                            {((wh as any).partnerSku || (wh as any).partnerSkuName) && (
                                                                <div className="mt-1 pl-6 flex flex-col gap-0.5">
                                                                    {(wh as any).partnerSkuName && (
                                                                        <span className="text-[10px] text-amber-300 font-medium">
                                                                            {(wh as any).partnerSkuName}
                                                                        </span>
                                                                    )}
                                                                    {(wh as any).partnerSku && (
                                                                        <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded text-[9px] font-bold font-mono w-fit">
                                                                            CHILD: {(wh as any).partnerSku}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                                <div className="flex items-center justify-between px-3 py-2.5 bg-[#14202c] border-t border-border-dark">
                                                    <span className="text-xs text-text-muted font-medium">Total (Parent)</span>
                                                    <span className="text-sm font-black text-white">{onHand}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Ads Performance Section */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-xs font-black text-primary uppercase tracking-widest">Ads Performance</h3>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-text-muted">Last {adsPeriod} days</span>
                                        <select
                                            value={adsPeriod}
                                            onChange={e => setAdsPeriod(e.target.value)}
                                            className="bg-[#1c2d3d] border border-border-dark rounded-lg px-2 py-1 text-white text-xs"
                                        >
                                            <option value="7">7 days</option>
                                            <option value="30">30 days</option>
                                            <option value="90">90 days</option>
                                        </select>
                                    </div>
                                </div>

                                {adsLoading ? (
                                    <div className="text-sm text-text-muted">Loading ads data...</div>
                                ) : adsData ? (
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-3 gap-2">
                                            {[
                                                { label: 'CPC', value: `€${adsData.cpc.toFixed(2)}`, sub: 'Cost per click' },
                                                { label: 'CPL', value: `€${adsData.cpl.toFixed(2)}`, sub: 'Cost per lead' },
                                                { label: 'CPO', value: `€${adsData.cpo.toFixed(2)}`, sub: 'Cost per order' },
                                            ].map((k, i) => (
                                                <div key={i} className="bg-[#111a22] rounded-xl p-3 border border-border-dark">
                                                    <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider">{k.label}</div>
                                                    <div className="text-lg font-black text-white mt-0.5">{k.value}</div>
                                                    <div className="text-[10px] text-text-muted">{k.sub}</div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="space-y-0">
                                            {[
                                                { label: 'Total ad spend', value: `€${adsData.totalSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: 'text-white' },
                                                { label: 'Revenue from ads', value: `€${adsData.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: 'text-emerald-400' },
                                                { label: 'ROAS', value: `${adsData.roas.toFixed(2)}×`, color: 'text-white' },
                                                { label: 'CVR (lead → order)', value: `${adsData.cvr.toFixed(1)}%`, color: 'text-white' },
                                            ].map((row, idx) => (
                                                <div key={idx} className="flex justify-between items-center py-2 border-b border-border-dark/50 last:border-0">
                                                    <span className="text-sm text-text-muted">{row.label}</span>
                                                    <span className={`text-sm font-bold ${row.color}`}>{row.value}</span>
                                                </div>
                                            ))}
                                        </div>

                                        <div>
                                            <h4 className="text-[10px] font-black text-primary uppercase tracking-widest mb-2">Statistics</h4>
                                            <div className="grid grid-cols-5 gap-2">
                                                {[
                                                    { label: 'LEADS', value: adsData.totalLeads, color: 'text-emerald-400', sub: '' },
                                                    { label: 'CONFIRMED', value: adsData.totalConfirmed, color: 'text-blue-400', sub: adsData.totalLeads > 0 ? `${(adsData.totalConfirmed / adsData.totalLeads * 100).toFixed(1)}%` : '0%' },
                                                    { label: 'ORDERS', value: adsData.totalOrders, color: 'text-white', sub: '' },
                                                    { label: 'RETURNS', value: adsData.totalReturns, color: 'text-amber-400', sub: '' },
                                                    { label: 'RETURN RATE', value: `${adsData.returnRate.toFixed(0)}%`, color: adsData.returnRate > 15 ? 'text-red-400' : 'text-amber-400', sub: `global ${Number((product as any).globalRate || product.returnRate || 0)}%` },
                                                ].map((stat, i) => (
                                                    <div key={i} className="bg-[#111a22] rounded-xl p-2.5 border border-border-dark text-center">
                                                        <div className="text-[9px] font-bold text-text-muted uppercase tracking-wider leading-tight">{stat.label}</div>
                                                        <div className={`text-xl font-black ${stat.color} mt-0.5`}>{stat.value}</div>
                                                        {stat.sub && <div className="text-[10px] text-text-muted">{stat.sub}</div>}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-[#111a22] rounded-xl border border-border-dark p-6 text-center text-text-muted text-sm">
                                        No ads data available for this SKU.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ═══ Warehouses Tab ═══ */}
                    {activeTab === 'warehouses' && (
                        <div className="p-6 space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-2">
                                    <span className="material-symbols-outlined text-sm">inventory_2</span>
                                    Warehouse Breakdown (Child SKUs)
                                </h3>
                                <button
                                    onClick={openBulkChildSkus}
                                    className="bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                                    title="Manage child SKUs for all warehouses"
                                >
                                    <span className="material-symbols-outlined text-[14px]">tune</span>
                                    Manage All Child SKUs
                                </button>
                                <button
                                    onClick={() => openAssignStock()}
                                    className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                                >
                                    <span className="material-symbols-outlined text-[14px]">add_circle</span>
                                    Add to FC / Warehouse
                                </button>
                            </div>

                            {/* SKU hierarchy info */}
                            <div className="bg-[#17232f] rounded-lg p-3 border border-border-dark">
                                <div className="flex items-center gap-2 text-xs">
                                    <span className="px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded text-[9px] font-bold">PARENT</span>
                                    <span className="text-white font-mono font-bold">{product.sku}</span>
                                    <span className="text-text-muted">= sum of all child warehouse SKUs below</span>
                                    <span className="ml-auto text-white font-bold">{onHand} total</span>
                                </div>
                            </div>

                            {loading ? (
                                <div className="text-white text-sm">Loading stock...</div>
                            ) : !stockSummary || stockSummary.warehouses.length === 0 ? (
                                <div className="bg-[#111a22] p-6 rounded-xl border border-border-dark text-center space-y-3">
                                    <span className="material-symbols-outlined text-4xl text-text-muted">inventory_2</span>
                                    <p className="text-text-muted text-sm">No stock records found for this product.</p>
                                    <button
                                        onClick={() => openAssignStock()}
                                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 text-sm font-bold transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">add_circle</span>
                                        Initialize Stock
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {stockSummary.warehouses.map((wh, idx) => {
                                        const whAvailable = wh.current - wh.reserved;
                                        const status = getStockStatus(wh.current, product.reorderPoint || 10);
                                        return (
                                            <div key={idx} className="bg-[#111a22] rounded-xl border border-border-dark overflow-hidden">
                                                <div className="flex justify-between items-center px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="material-symbols-outlined text-amber-400 text-[16px]">warehouse</span>
                                                        <span className="text-white font-bold text-sm">{wh.warehouseName}</span>
                                                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${status.color}`}>
                                                            {status.label}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => openAdjust(wh.warehouseId, wh.warehouseName, (wh as any).partnerSku, (wh as any).partnerSkuName)}
                                                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 text-[10px] font-bold uppercase tracking-wider transition-colors"
                                                        >
                                                            <span className="material-symbols-outlined text-[12px]">edit</span>
                                                            Set Stock
                                                        </button>
                                                        <button
                                                            onClick={() => setWriteOffOpen(true)}
                                                            className="text-red-400 hover:text-red-300 text-[10px] uppercase font-bold tracking-wider flex items-center gap-1"
                                                        >
                                                            <span className="material-symbols-outlined text-[14px]">remove_shopping_cart</span>
                                                            Write-Off
                                                        </button>
                                                    </div>
                                                </div>
                                                {/* Child SKU row */}
                                                {((wh as any).partnerSku || (wh as any).partnerSkuName) ? (
                                                    <div className="px-4 pb-2 -mt-1 flex items-center gap-2">
                                                        <div className="flex items-center gap-2 flex-1">
                                                            {(wh as any).partnerSkuName && (
                                                                <span className="text-[10px] text-amber-300 font-semibold">
                                                                    {(wh as any).partnerSkuName}
                                                                </span>
                                                            )}
                                                            {(wh as any).partnerSku && (
                                                                <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded text-[9px] font-bold font-mono">
                                                                    CHILD: {(wh as any).partnerSku}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <button
                                                            onClick={() => openAdjust(wh.warehouseId, wh.warehouseName, (wh as any).partnerSku, (wh as any).partnerSkuName)}
                                                            className="size-5 flex items-center justify-center rounded hover:bg-amber-500/20 text-amber-500/50 hover:text-amber-400 transition-all"
                                                            title="Edit child SKU"
                                                        >
                                                            <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>edit</span>
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="px-4 pb-2 -mt-1">
                                                        <button
                                                            onClick={() => openAdjust(wh.warehouseId, wh.warehouseName)}
                                                            className="text-amber-500/40 hover:text-amber-400 text-[9px] font-bold flex items-center gap-1 transition-colors"
                                                        >
                                                            <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>add</span>
                                                            Assign Child SKU
                                                        </button>
                                                    </div>
                                                )}
                                                <div className="grid grid-cols-5 gap-0 border-t border-border-dark">
                                                    {[
                                                        { label: 'On Hand', value: wh.current, color: 'text-white' },
                                                        { label: 'Reserved', value: wh.reserved, color: 'text-orange-400' },
                                                        { label: 'Available', value: whAvailable, color: 'text-blue-400' },
                                                        { label: 'Outbound', value: wh.outbound, color: 'text-purple-400' },
                                                        { label: 'Returning', value: wh.returning, color: 'text-pink-400' },
                                                    ].map((col, ci) => (
                                                        <div key={ci} className="p-3 text-center border-r border-border-dark/50 last:border-0">
                                                            <div className="text-[10px] text-text-muted uppercase font-bold">{col.label}</div>
                                                            <div className={`text-lg font-bold ${col.color}`}>{col.value}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* Totals */}
                                    <div className="bg-[#14202c] rounded-xl px-4 py-3 border border-border-dark flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded text-[9px] font-bold">PARENT</span>
                                            <span className="text-sm text-text-muted font-medium">Total on-hand ({product.sku})</span>
                                        </div>
                                        <span className="text-xl font-black text-white">{onHand}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ═══ Transactions Tab ═══ */}
                    {activeTab === 'transactions' && (
                        <div className="p-6 space-y-4">
                            <h3 className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-2">
                                <span className="material-symbols-outlined text-sm">receipt_long</span>
                                Transaction Ledger
                            </h3>

                            {txLoading ? (
                                <div className="text-white text-sm">Loading transactions...</div>
                            ) : transactions.length === 0 ? (
                                <div className="bg-[#111a22] p-6 rounded-xl border border-border-dark text-text-muted text-sm text-center">
                                    No transactions found.
                                </div>
                            ) : (
                                <div className="bg-[#111a22] rounded-xl border border-border-dark overflow-hidden">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-[#17232f]">
                                            <tr className="border-b border-border-dark">
                                                <th className="px-4 py-2.5 text-[10px] font-bold text-text-muted uppercase">Date</th>
                                                <th className="px-4 py-2.5 text-[10px] font-bold text-text-muted uppercase">Type</th>
                                                <th className="px-4 py-2.5 text-[10px] font-bold text-text-muted uppercase text-right">Qty</th>
                                                <th className="px-4 py-2.5 text-[10px] font-bold text-text-muted uppercase">Warehouse</th>
                                                <th className="px-4 py-2.5 text-[10px] font-bold text-text-muted uppercase">Reference</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border-dark/50">
                                            {transactions.slice(0, 50).map(tx => {
                                                const txType = formatTxType(tx.type);
                                                return (
                                                    <tr key={tx.id} className="hover:bg-[#1c2d3d]/30 transition-colors">
                                                        <td className="px-4 py-2 text-xs text-text-muted">
                                                            {new Date(tx.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                                                        </td>
                                                        <td className={`px-4 py-2 text-xs font-bold ${txType.color}`}>{txType.label}</td>
                                                        <td className={`px-4 py-2 text-xs font-bold text-right ${tx.quantity >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                            {tx.quantity >= 0 ? '+' : ''}{tx.quantity}
                                                        </td>
                                                        <td className="px-4 py-2 text-xs text-white">{tx.warehouse?.name || '—'}</td>
                                                        <td className="px-4 py-2 text-xs text-text-muted truncate max-w-[120px]" title={tx.referenceId || tx.reason || ''}>
                                                            {tx.reason || tx.referenceId || '—'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ═══ Planning Tab ═══ */}
                    {activeTab === 'planning' && (
                        <div className="p-6 space-y-4">
                            <h3 className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-2">
                                <span className="material-symbols-outlined text-sm">trending_up</span>
                                Demand Planning
                            </h3>
                            <div className="bg-[#111a22] rounded-xl border border-border-dark p-6 space-y-4">
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="text-center">
                                        <div className="text-[10px] text-text-muted uppercase font-bold">Available</div>
                                        <div className="text-2xl font-black text-blue-400">{available}</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-[10px] text-text-muted uppercase font-bold">Reorder Point</div>
                                        <div className="text-2xl font-black text-amber-400">{product.reorderPoint || 10}</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-[10px] text-text-muted uppercase font-bold">Days of Stock</div>
                                        <div className="text-2xl font-black text-emerald-400">—</div>
                                    </div>
                                </div>
                                <div className="border-t border-border-dark pt-4 text-sm text-text-muted text-center">
                                    Detailed planning data available in the Inventory Dashboard → Planning tab.
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ═══ History Tab ═══ */}
                    {activeTab === 'history' && (
                        <div className="p-6 space-y-4">
                            <h3 className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-2">
                                <span className="material-symbols-outlined text-sm">history</span>
                                Change History
                            </h3>
                            <div className="bg-[#111a22] rounded-xl border border-border-dark p-6 text-center text-text-muted text-sm">
                                Product change history logs will be displayed here as they become available.
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ─── Stock Adjust Modal ───────────────────────── */}
            {adjustOpen && product && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[300] p-4">
                    <div className="bg-[#111a22] p-6 rounded-xl border border-border-dark w-full max-w-md animate-in zoom-in-95 duration-200 shadow-2xl">
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <h2 className="text-lg font-bold text-white">
                                    {needsFCPicker ? 'Assign Stock' : 'Adjust Stock'}
                                </h2>
                                <p className="text-xs text-text-muted mt-1">
                                    {product.name} · <span className="font-mono uppercase">{product.sku}</span>
                                </p>
                            </div>
                            <button
                                onClick={() => setAdjustOpen(false)}
                                className="size-8 flex items-center justify-center rounded-full hover:bg-red-500/10 hover:text-red-500 text-text-muted transition-all"
                            >
                                <span className="material-symbols-outlined text-[18px]">close</span>
                            </button>
                        </div>

                        {/* FC / Warehouse Picker */}
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

                        {/* Existing warehouse info */}
                        {!needsFCPicker && (
                            <div className="bg-[#17232f] rounded-lg p-3 mb-4 border border-border-dark flex items-center gap-2">
                                <span className="material-symbols-outlined text-amber-400 text-[16px]">warehouse</span>
                                <span className="text-sm text-white font-medium">{adjustWhName}</span>
                                <span className="text-xs text-text-muted ml-auto">
                                    Current: <span className="font-bold text-white">{
                                        stockSummary?.warehouses.find(w => w.warehouseId === adjustWhId)?.current || 0
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
                                        adjustMode === m.mode ? 'bg-primary text-white' : 'bg-[#1c2d3d] text-text-muted hover:text-white'
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
                                    type="number" min="0" placeholder="0"
                                    className="w-full bg-[#1c2d3d] border border-border-dark rounded-lg p-3 text-white text-lg font-bold focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                                    value={adjustQty}
                                    onChange={e => setAdjustQty(e.target.value)}
                                    autoFocus={!needsFCPicker}
                                />
                            </div>
                            <div>
                                <label className="block text-text-muted text-xs font-medium mb-1">
                                    Child SKU Name <span className="text-text-muted/50">(product name at this warehouse)</span>
                                </label>
                                <input
                                    type="text" placeholder="e.g. Cintura Supporto Lombare"
                                    className="w-full bg-[#1c2d3d] border border-border-dark rounded-lg p-2.5 text-white text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                                    value={adjustPartnerSkuName}
                                    onChange={e => setAdjustPartnerSkuName(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-text-muted text-xs font-medium mb-1">
                                    Child SKU Code <span className="text-text-muted/50">(partner SKU for this warehouse)</span>
                                </label>
                                <input
                                    type="text" placeholder="e.g. WH-IT-SKU-001"
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

                        {/* Preview */}
                        {adjustQty !== '' && !isNaN(parseInt(adjustQty)) && (
                            <div className="mt-3 p-3 bg-[#17232f] rounded-lg border border-border-dark">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-text-muted">After adjustment:</span>
                                    <span className="font-bold text-white">
                                        {(() => {
                                            const whId = adjustWhId || selectedWHId;
                                            const current = stockSummary?.warehouses.find(w => w.warehouseId === whId)?.current || 0;
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
                                onClick={() => setAdjustOpen(false)}
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

            {/* Modals */}
            {isWriteOffOpen && stockSummary && (
                <WriteOffModal
                    isOpen={isWriteOffOpen}
                    onClose={() => setWriteOffOpen(false)}
                    product={product}
                    warehouseId={stockSummary.warehouses[0]?.warehouseId}
                    onSuccess={() => { setWriteOffOpen(false); fetchStock(); }}
                />
            )}

            {isPOOpen && (
                <PORecommendationModal
                    isOpen={isPOOpen}
                    onClose={() => setPOOpen(false)}
                    productId={product.id}
                    warehouseId={stockSummary?.warehouses[0]?.warehouseId}
                />
            )}
            {/* ─── Bulk Child SKU Modal ─── */}
            {bulkChildSkuOpen && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setBulkChildSkuOpen(false)} />
                    <div className="relative bg-[#0f1922] rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden border border-border-dark shadow-2xl">
                        <div className="px-6 py-4 border-b border-border-dark bg-[#111a22] flex items-center justify-between">
                            <div>
                                <h3 className="text-white font-bold text-lg">Manage All Child SKUs</h3>
                                <p className="text-text-muted text-xs mt-0.5">
                                    <span className="text-primary font-mono font-bold">{product.sku}</span>
                                    <span className="mx-1">·</span>
                                    {product.name}
                                </p>
                            </div>
                            <button onClick={() => setBulkChildSkuOpen(false)} className="text-text-muted hover:text-white transition-colors">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="overflow-auto max-h-[60vh] p-6">
                            <table className="w-full">
                                <thead>
                                    <tr className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                                        <th className="text-left pb-3 pr-3">Warehouse</th>
                                        <th className="text-left pb-3 pr-3">Child SKU Name</th>
                                        <th className="text-left pb-3">Child SKU Code</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {bulkChildSkus.map((row, idx) => (
                                        <tr key={row.warehouseId} className="border-t border-border-dark/50">
                                            <td className="py-2.5 pr-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-amber-400 text-[14px]">warehouse</span>
                                                    <span className="text-white text-sm font-medium">{row.warehouseName}</span>
                                                </div>
                                            </td>
                                            <td className="py-2.5 pr-3">
                                                <input
                                                    type="text"
                                                    placeholder="Product name at warehouse"
                                                    className="w-full bg-[#1c2d3d] border border-border-dark rounded-lg px-2.5 py-1.5 text-white text-xs focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-colors"
                                                    value={row.partnerSkuName}
                                                    onChange={e => {
                                                        const updated = [...bulkChildSkus];
                                                        updated[idx].partnerSkuName = e.target.value;
                                                        setBulkChildSkus(updated);
                                                    }}
                                                />
                                            </td>
                                            <td className="py-2.5">
                                                <input
                                                    type="text"
                                                    placeholder="e.g. IT-BELT-001"
                                                    className="w-full bg-[#1c2d3d] border border-border-dark rounded-lg px-2.5 py-1.5 text-white text-xs font-mono focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-colors"
                                                    value={row.partnerSku}
                                                    onChange={e => {
                                                        const updated = [...bulkChildSkus];
                                                        updated[idx].partnerSku = e.target.value;
                                                        setBulkChildSkus(updated);
                                                    }}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {bulkChildSkus.length === 0 && (
                                <p className="text-text-muted text-sm text-center py-6">No warehouses found. Assign stock first.</p>
                            )}
                        </div>
                        <div className="px-6 py-4 border-t border-border-dark bg-[#111a22] flex justify-end gap-3">
                            <button
                                onClick={() => setBulkChildSkuOpen(false)}
                                className="px-4 py-2 rounded-lg bg-gray-600 text-white hover:bg-gray-500 font-medium text-sm transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleBulkChildSkuSave}
                                disabled={bulkSaving}
                                className="px-5 py-2 rounded-lg bg-amber-500 text-black hover:bg-amber-400 font-bold text-sm transition-colors disabled:opacity-50"
                            >
                                {bulkSaving ? 'Saving...' : 'Save All Child SKUs'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProductDetailDashboard;
