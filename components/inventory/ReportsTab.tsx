import React, { useState, useEffect, useCallback } from 'react';
import { financialService } from '../../src/services/financial.service';

interface ReportsTabProps {
    selectedWarehouse: string;
}

interface FcReportRow {
    fulfillmentCenterId: string;
    fulfillmentCenterName: string;
    fulfillmentCenterCode: string;
    country: string;
    totalOrders: number;
    ordersSent: number;
    ordersDelivered: number;
    ordersReturned: number;
    deliveryRate: number;
    returnRate: number;
    fulfillmentCost: number;
    costPerOrder: number;
    reshipmentCost: number;
    aov: number;
    revenue: number;
    fulfillmentPctRevenue: number;
    profit: number;
}

interface FcReportData {
    month: string;
    centers: FcReportRow[];
    totals: {
        totalOrders: number;
        ordersSent: number;
        ordersDelivered: number;
        ordersReturned: number;
        revenue: number;
        fulfillmentCost: number;
        reshipmentCost: number;
        profit: number;
    };
}

const ReportsTab: React.FC<ReportsTabProps> = ({ selectedWarehouse }) => {
    const [report, setReport] = useState<FcReportData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Default to current month
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });

    const fetchReport = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await financialService.getFulfillmentReport(selectedMonth);
            setReport(data);
        } catch (err: any) {
            console.error('Failed to fetch fulfillment report:', err);
            setError(err?.response?.data?.message || 'Failed to load report');
        } finally {
            setLoading(false);
        }
    }, [selectedMonth]);

    useEffect(() => {
        fetchReport();
    }, [fetchReport]);

    const formatEur = (val: number) =>
        `€${(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const formatPct = (val: number) => `${(val || 0).toFixed(1)}%`;

    const formatMonthLabel = (monthStr: string) => {
        const [year, month] = monthStr.split('-').map(Number);
        const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        return `${names[month - 1]} ${year}`;
    };

    // KPI card helper
    const KpiCard = ({ icon, label, value, color, subtext }: {
        icon: string; label: string; value: string; color: string; subtext?: string;
    }) => (
        <div className="bg-card-dark p-5 rounded-xl shadow-sm border border-border-dark flex flex-col items-center justify-center gap-1 min-h-[140px]">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-1 ${color.includes('emerald') ? 'bg-emerald-500/10 border border-emerald-500/20' : color.includes('blue') ? 'bg-blue-500/10 border border-blue-500/20' : color.includes('amber') ? 'bg-amber-500/10 border border-amber-500/20' : color.includes('red') ? 'bg-red-500/10 border border-red-500/20' : color.includes('violet') ? 'bg-violet-500/10 border border-violet-500/20' : 'bg-primary/10 border border-primary/20'}`}>
                <span className={`material-symbols-outlined ${color}`} style={{ fontSize: '20px' }}>{icon}</span>
            </div>
            <p className="text-text-muted text-[10px] font-black uppercase tracking-widest">{label}</p>
            <p className={`text-2xl font-black ${color}`}>{value}</p>
            {subtext && <p className="text-text-muted text-[10px] mt-0.5">{subtext}</p>}
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Header + Month Picker */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-blue-500/20 border border-violet-500/30 flex items-center justify-center">
                        <span className="material-symbols-outlined text-violet-400" style={{ fontSize: '20px' }}>assessment</span>
                    </div>
                    <div>
                        <h2 className="text-white text-lg font-black tracking-tight">Fulfillment Center Report</h2>
                        <p className="text-text-muted text-xs">
                            {selectedMonth ? formatMonthLabel(selectedMonth) : 'Current Month'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">Period</label>
                        <input
                            type="month"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="bg-[#1c2d3d] border border-border-dark rounded-lg px-3 py-2 text-white text-sm appearance-none cursor-pointer hover:border-primary/40 transition-colors"
                        />
                    </div>
                    <div className="flex items-end">
                        <button
                            onClick={fetchReport}
                            disabled={loading}
                            className="flex items-center gap-1.5 px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg text-sm font-bold transition-all disabled:opacity-40"
                        >
                            <span className={`material-symbols-outlined text-[16px] ${loading ? 'animate-spin' : ''}`}>
                                {loading ? 'progress_activity' : 'refresh'}
                            </span>
                            Refresh
                        </button>
                    </div>
                </div>
            </div>

            {/* Loading State */}
            {loading && (
                <div className="flex items-center justify-center py-20">
                    <div className="flex flex-col items-center gap-3">
                        <span className="material-symbols-outlined text-[40px] text-primary animate-spin">progress_activity</span>
                        <p className="text-text-muted text-sm font-bold">Loading report data...</p>
                    </div>
                </div>
            )}

            {/* Error State */}
            {error && !loading && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-5 py-4 flex items-start gap-3">
                    <span className="material-symbols-outlined text-red-400 mt-0.5" style={{ fontSize: '20px' }}>error</span>
                    <div>
                        <p className="text-red-400 text-sm font-bold">Failed to load report</p>
                        <p className="text-red-400/60 text-xs mt-1">{error}</p>
                    </div>
                </div>
            )}

            {/* Report Data */}
            {!loading && !error && report && (
                <>
                    {/* KPI Summary Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-4">
                        <KpiCard
                            icon="local_shipping"
                            label="Orders Sent"
                            value={report.totals.ordersSent.toLocaleString()}
                            color="text-blue-400"
                        />
                        <KpiCard
                            icon="check_circle"
                            label="Delivered"
                            value={report.totals.ordersDelivered.toLocaleString()}
                            color="text-emerald-400"
                            subtext={report.totals.ordersSent > 0
                                ? `${((report.totals.ordersDelivered / report.totals.ordersSent) * 100).toFixed(1)}% delivery rate`
                                : undefined}
                        />
                        <KpiCard
                            icon="payments"
                            label="Revenue"
                            value={formatEur(report.totals.revenue)}
                            color="text-emerald-400"
                        />
                        <KpiCard
                            icon="receipt_long"
                            label="Fulfillment Cost"
                            value={formatEur(report.totals.fulfillmentCost)}
                            color="text-amber-400"
                        />
                        <KpiCard
                            icon="trending_up"
                            label="Profit"
                            value={formatEur(report.totals.profit)}
                            color={report.totals.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}
                        />
                    </div>

                    {/* Empty state */}
                    {report.centers.length === 0 && (
                        <div className="bg-card-dark rounded-2xl border border-border-dark p-12 flex flex-col items-center gap-3">
                            <span className="material-symbols-outlined text-[48px] text-text-muted/20">warehouse</span>
                            <p className="text-text-muted text-sm font-bold">No fulfillment centers found</p>
                            <p className="text-text-muted/50 text-xs">Create fulfillment centers to see report data.</p>
                        </div>
                    )}

                    {/* Fulfillment Centers Table */}
                    {report.centers.length > 0 && (
                        <div className="bg-card-dark rounded-2xl border border-border-dark overflow-hidden">
                            <div className="flex items-center justify-between px-5 py-3 bg-[#17232f] border-b border-border-dark">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-violet-400" style={{ fontSize: '16px' }}>warehouse</span>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-violet-400 px-2 py-0.5 rounded-full border bg-violet-500/10 border-violet-500/20">
                                        Fulfillment Center Breakdown
                                    </span>
                                </div>
                                <span className="text-[10px] text-text-muted font-bold">
                                    {report.centers.filter(c => c.totalOrders > 0).length} active centers
                                </span>
                            </div>

                            <div className="overflow-x-auto custom-scrollbar">
                                <table className="w-full text-left border-collapse min-w-[1400px]">
                                    <thead>
                                        <tr className="bg-[#141e29]">
                                            <th className="px-4 py-2.5 text-text-muted font-black text-[10px] uppercase tracking-widest sticky left-0 bg-[#141e29] z-10">FC Name</th>
                                            <th className="px-4 py-2.5 text-text-muted font-black text-[10px] uppercase tracking-widest text-center">Order Sent</th>
                                            <th className="px-4 py-2.5 text-text-muted font-black text-[10px] uppercase tracking-widest text-center">Delivered</th>
                                            <th className="px-4 py-2.5 text-text-muted font-black text-[10px] uppercase tracking-widest text-center">% Del/Sent</th>
                                            <th className="px-4 py-2.5 text-text-muted font-black text-[10px] uppercase tracking-widest text-center">Return Rate</th>
                                            <th className="px-4 py-2.5 text-text-muted font-black text-[10px] uppercase tracking-widest text-right">Cost/Order</th>
                                            <th className="px-4 py-2.5 text-text-muted font-black text-[10px] uppercase tracking-widest text-right">Reship Cost</th>
                                            <th className="px-4 py-2.5 text-text-muted font-black text-[10px] uppercase tracking-widest text-right">AOV</th>
                                            <th className="px-4 py-2.5 text-text-muted font-black text-[10px] uppercase tracking-widest text-right">Revenue</th>
                                            <th className="px-4 py-2.5 text-text-muted font-black text-[10px] uppercase tracking-widest text-center">Fulfill %</th>
                                            <th className="px-4 py-2.5 text-text-muted font-black text-[10px] uppercase tracking-widest text-right">Profit</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-dark/40">
                                        {report.centers.filter(fc => fc.totalOrders > 0).map((fc) => {
                                            return (
                                                <tr key={fc.fulfillmentCenterId} className="transition-colors hover:bg-primary/[0.03]">
                                                    {/* FC Name */}
                                                    <td className="px-4 py-3 sticky left-0 bg-card-dark z-10">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500/20 to-blue-500/10 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
                                                                <span className="text-[9px] font-black text-violet-400">{fc.fulfillmentCenterCode?.slice(0, 2) || 'FC'}</span>
                                                            </div>
                                                            <div>
                                                                <p className="text-white text-xs font-bold truncate max-w-[140px]">{fc.fulfillmentCenterName}</p>
                                                                <p className="text-text-muted text-[10px]">{fc.country}</p>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* Order Sent */}
                                                    <td className="px-4 py-3 text-center">
                                                        <span className="text-xs text-white font-bold">{fc.ordersSent}</span>
                                                    </td>

                                                    {/* Delivered */}
                                                    <td className="px-4 py-3 text-center">
                                                        <span className="text-xs text-emerald-400 font-bold">{fc.ordersDelivered}</span>
                                                    </td>

                                                    {/* % Delivered/Sent */}
                                                    <td className="px-4 py-3 text-center">
                                                        <span className={`text-xs font-black px-2 py-0.5 rounded-full ${
                                                            fc.deliveryRate >= 80
                                                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                                : fc.deliveryRate >= 60
                                                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                                                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                                        }`}>
                                                            {formatPct(fc.deliveryRate)}
                                                        </span>
                                                    </td>

                                                    {/* Return Rate */}
                                                    <td className="px-4 py-3 text-center">
                                                        <span className={`text-xs font-black px-2 py-0.5 rounded-full ${
                                                            fc.returnRate <= 10
                                                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                                : fc.returnRate <= 20
                                                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                                                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                                        }`}>
                                                            {formatPct(fc.returnRate)}
                                                        </span>
                                                    </td>

                                                    {/* Cost per Order */}
                                                    <td className="px-4 py-3 text-right">
                                                        <span className="text-xs text-white font-bold">{formatEur(fc.costPerOrder)}</span>
                                                    </td>

                                                    {/* Reshipment Cost */}
                                                    <td className="px-4 py-3 text-right">
                                                        <span className={`text-xs font-bold ${fc.reshipmentCost > 0 ? 'text-orange-400' : 'text-text-muted/40'}`}>
                                                            {formatEur(fc.reshipmentCost)}
                                                        </span>
                                                    </td>

                                                    {/* AOV */}
                                                    <td className="px-4 py-3 text-right">
                                                        <span className="text-xs text-blue-400 font-bold">{formatEur(fc.aov)}</span>
                                                    </td>

                                                    {/* Revenue */}
                                                    <td className="px-4 py-3 text-right">
                                                        <span className="text-xs text-emerald-400 font-black">{formatEur(fc.revenue)}</span>
                                                    </td>

                                                    {/* Fulfillment % of Revenue */}
                                                    <td className="px-4 py-3 text-center">
                                                        <span className={`text-xs font-black ${
                                                            fc.fulfillmentPctRevenue <= 15
                                                                ? 'text-emerald-400'
                                                                : fc.fulfillmentPctRevenue <= 30
                                                                    ? 'text-amber-400'
                                                                    : 'text-red-400'
                                                        }`}>
                                                            {formatPct(fc.fulfillmentPctRevenue)}
                                                        </span>
                                                    </td>

                                                    {/* Profit */}
                                                    <td className="px-4 py-3 text-right">
                                                        <span className={`text-xs font-black ${fc.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                            {formatEur(fc.profit)}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>

                                    {/* Footer Totals */}
                                    <tfoot>
                                        <tr className="bg-[#14202c] border-t-2 border-border-dark">
                                            <td className="px-4 py-3 sticky left-0 bg-[#14202c] z-10">
                                                <span className="text-xs font-black text-white uppercase">Total</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="text-xs text-white font-black">{report.totals.ordersSent}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="text-xs text-emerald-400 font-black">{report.totals.ordersDelivered}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="text-xs text-white font-black">
                                                    {report.totals.ordersSent > 0
                                                        ? formatPct((report.totals.ordersDelivered / report.totals.ordersSent) * 100)
                                                        : '—'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="text-xs text-white font-black">
                                                    {report.totals.ordersSent > 0
                                                        ? formatPct((report.totals.ordersReturned / report.totals.ordersSent) * 100)
                                                        : '—'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <span className="text-xs text-white font-black">
                                                    {report.totals.totalOrders > 0
                                                        ? formatEur(report.totals.fulfillmentCost / report.totals.totalOrders)
                                                        : '—'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <span className="text-xs text-orange-400 font-black">{formatEur(report.totals.reshipmentCost)}</span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <span className="text-xs text-blue-400 font-black">
                                                    {report.totals.totalOrders > 0
                                                        ? formatEur(report.totals.revenue / report.totals.ordersDelivered || 0)
                                                        : '—'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <span className="text-xs text-emerald-400 font-black">{formatEur(report.totals.revenue)}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="text-xs text-white font-black">
                                                    {report.totals.revenue > 0
                                                        ? formatPct((report.totals.fulfillmentCost / report.totals.revenue) * 100)
                                                        : '—'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <span className={`text-sm font-black ${report.totals.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                    {formatEur(report.totals.profit)}
                                                </span>
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Per-center detail cards (for active centers only) */}
                    {report.centers.filter(c => c.totalOrders > 0).length > 0 && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {report.centers
                                .filter(c => c.totalOrders > 0)
                                .map((fc) => (
                                    <div key={fc.fulfillmentCenterId} className="bg-card-dark rounded-2xl border border-border-dark overflow-hidden">
                                        {/* Card Header */}
                                        <div className="flex items-center justify-between px-5 py-3 bg-[#17232f] border-b border-border-dark">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-blue-500/10 border border-violet-500/20 flex items-center justify-center">
                                                    <span className="text-[10px] font-black text-violet-400">{fc.fulfillmentCenterCode?.slice(0, 3) || 'FC'}</span>
                                                </div>
                                                <div>
                                                    <p className="text-white text-sm font-black">{fc.fulfillmentCenterName}</p>
                                                    <p className="text-text-muted text-[10px]">{fc.country} · {fc.totalOrders} total orders</p>
                                                </div>
                                            </div>
                                            <span className={`text-sm font-black ${fc.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {formatEur(fc.profit)}
                                            </span>
                                        </div>

                                        {/* Card Metrics */}
                                        <div className="p-4 grid grid-cols-3 gap-3">
                                            {/* Order Pipeline */}
                                            <div className="flex flex-col items-center gap-1 p-3 rounded-xl bg-[#141e29] border border-border-dark/40">
                                                <span className="material-symbols-outlined text-blue-400" style={{ fontSize: '18px' }}>local_shipping</span>
                                                <span className="text-[10px] text-text-muted font-bold uppercase">Sent</span>
                                                <span className="text-lg font-black text-white">{fc.ordersSent}</span>
                                            </div>
                                            <div className="flex flex-col items-center gap-1 p-3 rounded-xl bg-[#141e29] border border-border-dark/40">
                                                <span className="material-symbols-outlined text-emerald-400" style={{ fontSize: '18px' }}>check_circle</span>
                                                <span className="text-[10px] text-text-muted font-bold uppercase">Delivered</span>
                                                <span className="text-lg font-black text-emerald-400">{fc.ordersDelivered}</span>
                                            </div>
                                            <div className="flex flex-col items-center gap-1 p-3 rounded-xl bg-[#141e29] border border-border-dark/40">
                                                <span className="material-symbols-outlined text-red-400" style={{ fontSize: '18px' }}>undo</span>
                                                <span className="text-[10px] text-text-muted font-bold uppercase">Returned</span>
                                                <span className="text-lg font-black text-red-400">{fc.ordersReturned}</span>
                                            </div>

                                            {/* Financial Breakdown */}
                                            <div className="col-span-3 mt-1 space-y-2">
                                                <div className="flex justify-between items-center text-xs border-b border-border-dark/30 pb-1.5">
                                                    <span className="text-text-muted font-bold">Delivery Rate</span>
                                                    <span className={`font-black ${fc.deliveryRate >= 80 ? 'text-emerald-400' : fc.deliveryRate >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                                                        {formatPct(fc.deliveryRate)}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center text-xs border-b border-border-dark/30 pb-1.5">
                                                    <span className="text-text-muted font-bold">Return Rate</span>
                                                    <span className={`font-black ${fc.returnRate <= 10 ? 'text-emerald-400' : fc.returnRate <= 20 ? 'text-amber-400' : 'text-red-400'}`}>
                                                        {formatPct(fc.returnRate)}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center text-xs border-b border-border-dark/30 pb-1.5">
                                                    <span className="text-text-muted font-bold">Cost / Order</span>
                                                    <span className="text-white font-black">{formatEur(fc.costPerOrder)}</span>
                                                </div>
                                                <div className="flex justify-between items-center text-xs border-b border-border-dark/30 pb-1.5">
                                                    <span className="text-text-muted font-bold">Reshipment Cost</span>
                                                    <span className={`font-black ${fc.reshipmentCost > 0 ? 'text-orange-400' : 'text-text-muted/40'}`}>{formatEur(fc.reshipmentCost)}</span>
                                                </div>
                                                <div className="flex justify-between items-center text-xs border-b border-border-dark/30 pb-1.5">
                                                    <span className="text-text-muted font-bold">AOV</span>
                                                    <span className="text-blue-400 font-black">{formatEur(fc.aov)}</span>
                                                </div>
                                                <div className="flex justify-between items-center text-xs border-b border-border-dark/30 pb-1.5">
                                                    <span className="text-text-muted font-bold">Revenue</span>
                                                    <span className="text-emerald-400 font-black">{formatEur(fc.revenue)}</span>
                                                </div>
                                                <div className="flex justify-between items-center text-xs border-b border-border-dark/30 pb-1.5">
                                                    <span className="text-text-muted font-bold">Fulfillment % / Revenue</span>
                                                    <span className={`font-black ${fc.fulfillmentPctRevenue <= 15 ? 'text-emerald-400' : fc.fulfillmentPctRevenue <= 30 ? 'text-amber-400' : 'text-red-400'}`}>
                                                        {formatPct(fc.fulfillmentPctRevenue)}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center text-xs pt-1">
                                                    <span className="text-white font-black">Profit</span>
                                                    <span className={`font-black text-sm ${fc.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                        {formatEur(fc.profit)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                        </div>
                    )}

                    {/* Info note */}
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-5 py-3 flex items-start gap-3">
                        <span className="material-symbols-outlined text-blue-400 mt-0.5" style={{ fontSize: '18px' }}>info</span>
                        <div>
                            <p className="text-blue-400 text-xs font-bold">
                                Cost per Order = Fulfillment Cost ÷ Total Orders. Fulfillment costs are sourced from invoices uploaded in COD Reconciliation.
                            </p>
                            <p className="text-blue-400/50 text-[10px] mt-1">
                                Revenue counts only Delivered orders. Profit = Revenue − Fulfillment Cost − Reshipment Cost.
                            </p>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default ReportsTab;
