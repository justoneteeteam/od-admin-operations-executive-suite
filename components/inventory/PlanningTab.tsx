import React, { useState, useEffect } from 'react';
import { inventoryService } from '../../src/services/inventory.service';
import { purchasesService } from '../../src/services/purchases.service';

interface PlanningTabProps {
    selectedWarehouse: string;
}

interface PlanningRow {
    productId: string;
    productName: string;
    sku: string;
    warehouseId: string;
    warehouseName: string;
    available: number;
    outboundQty: number;
    returningQty: number;
    expectedReturns7d: number;
    projectedD7: number;
    reorderPoint: number;
    daysOfStock: number;
    avgDailyOrders: number;
    status: string;
}

const PlanningTab: React.FC<PlanningTabProps> = ({ selectedWarehouse }) => {
    const [planningData, setPlanningData] = useState<PlanningRow[]>([]);
    const [loading, setLoading] = useState(true);

    const [incomingStock, setIncomingStock] = useState<Record<string, number>>({});

    useEffect(() => {
        const fetchPlanning = async () => {
            setLoading(true);
            try {
                const [data, incoming] = await Promise.all([
                    inventoryService.getPlanning(selectedWarehouse),
                    purchasesService.getIncomingStock().catch(() => []),
                ]);
                setPlanningData(data);
                // Build a map of productId -> total incoming qty
                const inMap: Record<string, number> = {};
                for (const item of (incoming || [])) {
                    inMap[item.productId] = (inMap[item.productId] || 0) + (item.incomingQty || 0);
                }
                setIncomingStock(inMap);
            } catch (err) {
                console.error("Failed to fetch planning data", err);
            } finally {
                setLoading(false);
            }
        };

        fetchPlanning();
    }, [selectedWarehouse]);

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'out_of_stock':
                return { label: 'Out of Stock', color: 'bg-red-500/10 text-red-400 border-red-500/20' };
            case 'reorder_now':
                return { label: 'Reorder Now', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' };
            case 'reorder_soon':
                return { label: 'Reorder Soon', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
            default:
                return { label: 'Healthy', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
        }
    };

    if (loading) {
        return <div className="text-white p-4">Loading planning data...</div>;
    }

    // Aggregate by product (merge warehouse rows)
    const productMap = new Map<string, {
        productId: string;
        productName: string;
        sku: string;
        totalAvailable: number;
        totalOutbound: number;
        totalReturning: number;
        totalExpectedReturns7d: number;
        avgDaily: number;
        daysOfStock: number;
        reorderPoint: number;
        status: string;
        warehouses: PlanningRow[];
    }>();

    for (const row of planningData) {
        if (!productMap.has(row.productId)) {
            productMap.set(row.productId, {
                productId: row.productId,
                productName: row.productName,
                sku: row.sku,
                totalAvailable: 0,
                totalOutbound: 0,
                totalReturning: 0,
                totalExpectedReturns7d: 0,
                avgDaily: row.avgDailyOrders,
                daysOfStock: 0,
                reorderPoint: row.reorderPoint,
                status: 'healthy',
                warehouses: [],
            });
        }
        const p = productMap.get(row.productId)!;
        p.totalAvailable += row.available;
        p.totalOutbound += row.outboundQty;
        p.totalReturning += row.returningQty;
        p.totalExpectedReturns7d += row.expectedReturns7d;
        p.warehouses.push(row);
    }

    // Compute aggregate status
    const aggregated = Array.from(productMap.values()).map(p => {
        const incoming = incomingStock[p.productId] || 0;
        const availFloat = p.totalAvailable + Math.round(p.totalReturning * 0.912);
        const availWithIncoming = availFloat + incoming;
        const daysOfCover = p.avgDaily > 0 ? Math.round(availFloat / p.avgDaily) : 999;
        const leadTime = 14;
        const coverDays = 21;
        const targetCover = leadTime + coverDays;
        const requiredQty = Math.round(p.avgDaily * targetCover * 1.15);
        const recommendedPO = Math.max(0, requiredQty - availWithIncoming);

        let status = 'healthy';
        if (p.totalAvailable <= 0) status = 'out_of_stock';
        else if (daysOfCover <= 14) status = 'reorder_now';
        else if (daysOfCover <= 21) status = 'reorder_soon';

        return {
            ...p,
            incoming,
            availFloat,
            daysOfCover,
            targetCover,
            recommendedPO,
            status,
        };
    });

    // Sort by urgency (out_of_stock first, then reorder_now, etc)
    const statusOrder: Record<string, number> = { out_of_stock: 0, reorder_now: 1, reorder_soon: 2, healthy: 3 };
    aggregated.sort((a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3));

    return (
        <div className="bg-card-dark rounded-xl border border-border-dark overflow-hidden">
            <div className="p-4 border-b border-border-dark bg-[#17232f]">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[20px]">trending_up</span>
                    Replenishment Planning
                </h3>
                <p className="text-xs text-text-muted mt-1">
                    Coverage: Required = Avg Daily × (Lead Time + Cover Days) × 1.15 safety factor.
                    Available float = Available + Expected Returns (91.2% recovery rate).
                </p>
            </div>

            <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left text-sm">
                    <thead className="bg-[#17232f] text-[10px] uppercase font-bold text-text-muted tracking-wider">
                        <tr className="border-b border-border-dark">
                            <th className="px-5 py-3">Product Name</th>
                            <th className="px-5 py-3">SKU</th>
                            <th className="px-5 py-3 text-right">Avg Daily Out</th>
                            <th className="px-5 py-3 text-right">Available Float</th>
                            <th className="px-5 py-3 text-right">📦 Incoming</th>
                            <th className="px-5 py-3 text-right">Days Cover</th>
                            <th className="px-5 py-3 text-right">Target Cover</th>
                            <th className="px-5 py-3 text-right">Recommended PO Qty</th>
                            <th className="px-5 py-3 text-center">Status</th>
                            <th className="px-5 py-3 text-center">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {aggregated.map((row) => {
                            const badge = getStatusBadge(row.status);
                            return (
                                <tr key={row.productId} className="border-b border-border-dark hover:bg-[#1c2d3d]/30 transition-colors">
                                    <td className="px-5 py-3 text-white font-medium">{row.productName}</td>
                                    <td className="px-5 py-3 text-text-muted font-mono text-xs uppercase">{row.sku}</td>
                                    <td className="px-5 py-3 text-right text-white">{row.avgDaily.toFixed(1)}</td>
                                    <td className="px-5 py-3 text-right font-bold text-blue-400">{row.availFloat}</td>
                                    <td className="px-5 py-3 text-right">
                                        {row.incoming > 0 ? (
                                            <span className="text-amber-400 font-bold">+{row.incoming}</span>
                                        ) : (
                                            <span className="text-text-muted">—</span>
                                        )}
                                    </td>
                                    <td className="px-5 py-3 text-right">
                                        <span className={`font-bold ${
                                            row.daysOfCover <= 14 ? 'text-red-400' :
                                            row.daysOfCover <= 21 ? 'text-orange-400' :
                                            'text-emerald-400'
                                        }`}>
                                            {row.daysOfCover >= 999 ? '∞' : row.daysOfCover}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 text-right text-text-muted">{row.targetCover} days</td>
                                    <td className="px-5 py-3 text-right font-bold text-purple-400">
                                        {row.recommendedPO > 0 ? row.recommendedPO : '—'}
                                    </td>
                                    <td className="px-5 py-3 text-center">
                                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${badge.color}`}>
                                            {badge.label}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 text-center">
                                        {row.recommendedPO > 0 ? (
                                            <button className="bg-primary hover:bg-primary/80 text-white px-3 py-1.5 text-xs font-bold rounded-lg transition-colors">
                                                Create PO
                                            </button>
                                        ) : (
                                            <span className="text-text-muted text-xs">Sufficient</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                        {aggregated.length === 0 && (
                            <tr>
                                <td colSpan={10} className="px-6 py-8 text-center text-text-muted">
                                    No planning data available. Stock up your products to see recommendations.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default PlanningTab;
