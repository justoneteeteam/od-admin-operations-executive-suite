import React, { useState, useEffect } from 'react';
import { financialService } from '../src/services/financial.service';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface DistCity {
    city: string;
    allOrders: number;
    cancelOrders: number;
    confirmedQty: number;
    revenue: number;
    returnRate: number;
    isIsland: boolean;
}

interface DistCountry {
    country: string;
    allOrders: number;
    cancelOrders: number;
    confirmedQty: number;
    revenue: number;
    returnRate: number;
    cities: DistCity[];
}

interface DistReport {
    type: string;
    kpis: {
        allOrders: number;
        cancelOrders: number;
        confirmedQty: number;
        revenue: number;
        returnRate: number;
    };
    countries: DistCountry[];
    islands: {
        country: string;
        city: string;
        allOrders: number;
        cancelOrders: number;
        confirmedQty: number;
        revenue: number;
        returnRate: number;
    }[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const COUNTRY_FLAGS: Record<string, string> = {
    Spain: '🇪🇸', France: '🇫🇷', Italy: '🇮🇹', Germany: '🇩🇪', Portugal: '🇵🇹',
    Greece: '🇬🇷', Netherlands: '🇳🇱', Belgium: '🇧🇪', Austria: '🇦🇹', UK: '🇬🇧',
    'United Kingdom': '🇬🇧', Ireland: '🇮🇪', Poland: '🇵🇱', Romania: '🇷🇴',
    Croatia: '🇭🇷', Sweden: '🇸🇪', Norway: '🇳🇴', Denmark: '🇩🇰', Finland: '🇫🇮',
    'Czech Republic': '🇨🇿', Hungary: '🇭🇺', UAE: '🇦🇪', 'Saudi Arabia': '🇸🇦',
    USA: '🇺🇸', 'United States': '🇺🇸', Morocco: '🇲🇦', Unknown: '🏳️',
};

const ReturnBadge: React.FC<{ rate: number }> = ({ rate }) => {
    const cls = rate <= 10
        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
        : rate <= 20
            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            : 'bg-red-500/10 text-red-400 border-red-500/20';
    return (
        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${cls}`}>
            {rate.toFixed(1)}%
        </span>
    );
};

const fmt = (val: number) =>
    `€${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const DistributionReportTab: React.FC = () => {
    const [subType, setSubType] = useState<'test' | 'actual'>('test');
    const [month, setMonth] = useState('');
    const [data, setData] = useState<DistReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const result = await financialService.getDistributionReport({
                    type: subType,
                    month: month || undefined,
                });
                setData(result);
                setExpanded({});
            } catch (err) {
                console.error('Distribution report error:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [subType, month]);

    const toggleExpand = (country: string) =>
        setExpanded((prev) => ({ ...prev, [country]: !prev[country] }));

    const k = data?.kpis;

    return (
        <div className="flex flex-col gap-6">
            {/* ── Filters Row ──────────────────────────────────────── */}
            <div className="flex flex-wrap gap-4 items-end">
                {/* Sub-type toggle */}
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">
                        Order Type
                    </label>
                    <div className="flex gap-1 p-0.5 bg-[#141e29] rounded-lg border border-border-dark">
                        <button
                            onClick={() => setSubType('test')}
                            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                                subType === 'test'
                                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                    : 'text-text-muted hover:text-on-surface border border-transparent'
                            }`}
                        >
                            🧪 Test (Non-SKU)
                        </button>
                        <button
                            onClick={() => setSubType('actual')}
                            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                                subType === 'actual'
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    : 'text-text-muted hover:text-on-surface border border-transparent'
                            }`}
                        >
                            📦 Actual (SKU)
                        </button>
                    </div>
                </div>

                {/* Month picker */}
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">
                        Month
                    </label>
                    <input
                        type="month"
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                        className="bg-surface-high border border-border-dark rounded-lg px-3 py-2 text-on-surface text-sm appearance-none cursor-pointer hover:border-primary/40 transition-colors"
                    />
                </div>

                {month && (
                    <button
                        onClick={() => setMonth('')}
                        className="px-3 py-2 text-xs text-text-muted hover:text-on-surface font-bold transition-colors"
                    >
                        ✕ Clear filter
                    </button>
                )}
            </div>

            {/* ── Loading ───────────────────────────────────────── */}
            {loading && (
                <div className="flex items-center justify-center py-20">
                    <div className="flex flex-col items-center gap-3">
                        <span className="material-symbols-outlined text-[40px] text-primary animate-spin">
                            progress_activity
                        </span>
                        <p className="text-text-muted text-sm font-bold">Loading distribution report...</p>
                    </div>
                </div>
            )}

            {!loading && data && k && (
                <>
                    {/* ── KPI Cards ──────────────────────────────── */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        {[
                            { label: 'All Orders', value: k.allOrders.toLocaleString(), icon: 'shopping_cart', color: 'text-blue-400', border: 'border-l-blue-500' },
                            { label: 'Cancel Orders', value: k.cancelOrders.toLocaleString(), icon: 'block', color: 'text-orange-400', border: 'border-l-orange-500' },
                            { label: 'Confirmed Qty', value: k.confirmedQty.toLocaleString(), icon: 'verified', color: 'text-emerald-400', border: 'border-l-emerald-500' },
                            { label: 'Revenue', value: fmt(k.revenue), icon: 'payments', color: 'text-teal-400', border: 'border-l-teal-500' },
                            {
                                label: 'Return Rate',
                                value: `${k.returnRate.toFixed(1)}%`,
                                icon: 'undo',
                                color: k.returnRate <= 10 ? 'text-emerald-400' : k.returnRate <= 20 ? 'text-amber-400' : 'text-red-400',
                                border: k.returnRate <= 10 ? 'border-l-emerald-500' : k.returnRate <= 20 ? 'border-l-amber-500' : 'border-l-red-500',
                            },
                        ].map((kpi, i) => (
                            <div
                                key={i}
                                className={`bg-surface-lowest p-5 rounded-2xl border border-border-dark border-l-4 ${kpi.border} relative overflow-hidden group hover:shadow-lg transition-shadow`}
                            >
                                <div className="absolute -right-2 -bottom-2 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity">
                                    <span className="material-symbols-outlined text-[80px]">{kpi.icon}</span>
                                </div>
                                <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em]">
                                    {kpi.label}
                                </p>
                                <h3 className={`text-2xl font-black tracking-tight mt-2 ${kpi.color}`}>
                                    {kpi.value}
                                </h3>
                            </div>
                        ))}
                    </div>

                    {/* ── Country Breakdown Table ────────────────── */}
                    <div className="bg-surface-lowest rounded-2xl border border-border-dark overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-border-dark bg-surface-low">
                            <h3 className="text-xs font-black uppercase tracking-widest text-text-muted">
                                🌍 Order Distribution by Country —{' '}
                                {subType === 'test' ? 'Test (Non-SKU)' : 'Actual (SKU)'}
                            </h3>
                            <span className="text-[10px] text-text-muted font-bold">
                                {data.countries.length} countries
                            </span>
                        </div>

                        {data.countries.length === 0 ? (
                            <div className="p-12 text-center text-text-muted text-sm">
                                <span className="material-symbols-outlined text-[48px] block mb-3 opacity-20">
                                    public_off
                                </span>
                                No {subType === 'test' ? 'Non-SKU' : 'SKU'} orders found
                                {month ? ` for ${month}` : ''}.
                            </div>
                        ) : (
                            <div className="overflow-x-auto custom-scrollbar">
                                <table className="w-full text-left border-collapse min-w-[900px]">
                                    <thead>
                                        <tr className="bg-surface-container">
                                            <th className="px-5 py-3 text-text-muted font-black text-[10px] uppercase tracking-widest w-8" />
                                            <th className="px-4 py-3 text-text-muted font-black text-[10px] uppercase tracking-widest">
                                                Location
                                            </th>
                                            <th className="px-4 py-3 text-text-muted font-black text-[10px] uppercase tracking-widest text-center">
                                                All Orders
                                            </th>
                                            <th className="px-4 py-3 text-text-muted font-black text-[10px] uppercase tracking-widest text-center">
                                                Cancel
                                            </th>
                                            <th className="px-4 py-3 text-text-muted font-black text-[10px] uppercase tracking-widest text-center">
                                                Confirmed Qty
                                            </th>
                                            <th className="px-4 py-3 text-text-muted font-black text-[10px] uppercase tracking-widest text-right">
                                                Revenue
                                            </th>
                                            <th className="px-4 py-3 text-text-muted font-black text-[10px] uppercase tracking-widest text-center">
                                                Return Rate
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.countries.map((c) => {
                                            const isOpen = expanded[c.country] || false;
                                            const flag = COUNTRY_FLAGS[c.country] || '🏳️';
                                            return (
                                                <React.Fragment key={c.country}>
                                                    {/* Country row */}
                                                    <tr
                                                        className="border-t border-border-dark/50 hover:bg-primary/[0.03] cursor-pointer transition-colors"
                                                        onClick={() => toggleExpand(c.country)}
                                                    >
                                                        <td className="px-5 py-3 text-center">
                                                            <span
                                                                className={`material-symbols-outlined text-[14px] text-text-muted transition-transform ${
                                                                    isOpen ? 'rotate-90' : ''
                                                                }`}
                                                            >
                                                                chevron_right
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-lg">{flag}</span>
                                                                <span className="text-xs text-on-surface font-black">
                                                                    {c.country}
                                                                </span>
                                                                <span className="text-[10px] text-text-muted/60 font-bold">
                                                                    ({c.cities.length} cities)
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            <span className="text-xs text-on-surface font-black">
                                                                {c.allOrders}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            <span
                                                                className={`text-xs font-bold ${
                                                                    c.cancelOrders > 0
                                                                        ? 'text-orange-400'
                                                                        : 'text-text-muted/40'
                                                                }`}
                                                            >
                                                                {c.cancelOrders}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            <span className="text-xs text-emerald-400 font-bold">
                                                                {c.confirmedQty}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-right">
                                                            <span className="text-xs text-teal-400 font-black">
                                                                {fmt(c.revenue)}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            <ReturnBadge rate={c.returnRate} />
                                                        </td>
                                                    </tr>

                                                    {/* City rows (expanded) */}
                                                    {isOpen &&
                                                        c.cities.map((city) => (
                                                            <tr
                                                                key={`${c.country}-${city.city}`}
                                                                className="bg-[#111b25] border-t border-border-dark/20 hover:bg-primary/[0.02] transition-colors"
                                                            >
                                                                <td className="px-5 py-2" />
                                                                <td className="px-4 py-2 pl-12">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-text-muted text-xs">
                                                                            ↳
                                                                        </span>
                                                                        <span className="text-xs text-text-muted font-medium">
                                                                            {city.city}
                                                                        </span>
                                                                        {city.isIsland && (
                                                                            <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                                                                                🏝️ Island
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 py-2 text-center">
                                                                    <span className="text-xs text-text-muted font-medium">
                                                                        {city.allOrders}
                                                                    </span>
                                                                </td>
                                                                <td className="px-4 py-2 text-center">
                                                                    <span
                                                                        className={`text-xs font-medium ${
                                                                            city.cancelOrders > 0
                                                                                ? 'text-orange-400/70'
                                                                                : 'text-text-muted/30'
                                                                        }`}
                                                                    >
                                                                        {city.cancelOrders}
                                                                    </span>
                                                                </td>
                                                                <td className="px-4 py-2 text-center">
                                                                    <span className="text-xs text-emerald-400/70 font-medium">
                                                                        {city.confirmedQty}
                                                                    </span>
                                                                </td>
                                                                <td className="px-4 py-2 text-right">
                                                                    <span className="text-xs text-teal-400/70 font-medium">
                                                                        {fmt(city.revenue)}
                                                                    </span>
                                                                </td>
                                                                <td className="px-4 py-2 text-center">
                                                                    <ReturnBadge rate={city.returnRate} />
                                                                </td>
                                                            </tr>
                                                        ))}
                                                </React.Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* ── Island Orders Section ────────────────────── */}
                    {data.islands.length > 0 && (
                        <div className="bg-surface-lowest rounded-2xl border border-border-dark overflow-hidden">
                            <div className="flex items-center justify-between px-6 py-4 border-b border-border-dark bg-surface-low">
                                <h3 className="text-xs font-black uppercase tracking-widest text-cyan-400">
                                    🏝️ Island Orders
                                </h3>
                                <span className="text-[10px] text-text-muted font-bold">
                                    {data.islands.length} island locations ·{' '}
                                    {data.islands.reduce((s, i) => s + i.allOrders, 0)} orders
                                </span>
                            </div>
                            <div className="overflow-x-auto custom-scrollbar">
                                <table className="w-full text-left border-collapse min-w-[800px]">
                                    <thead>
                                        <tr className="bg-surface-container">
                                            <th className="px-5 py-3 text-text-muted font-black text-[10px] uppercase tracking-widest">
                                                Country
                                            </th>
                                            <th className="px-4 py-3 text-text-muted font-black text-[10px] uppercase tracking-widest">
                                                City / Region
                                            </th>
                                            <th className="px-4 py-3 text-text-muted font-black text-[10px] uppercase tracking-widest text-center">
                                                All Orders
                                            </th>
                                            <th className="px-4 py-3 text-text-muted font-black text-[10px] uppercase tracking-widest text-center">
                                                Cancel
                                            </th>
                                            <th className="px-4 py-3 text-text-muted font-black text-[10px] uppercase tracking-widest text-center">
                                                Confirmed Qty
                                            </th>
                                            <th className="px-4 py-3 text-text-muted font-black text-[10px] uppercase tracking-widest text-right">
                                                Revenue
                                            </th>
                                            <th className="px-4 py-3 text-text-muted font-black text-[10px] uppercase tracking-widest text-center">
                                                Return Rate
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-dark/40">
                                        {data.islands.map((isl, idx) => (
                                            <tr
                                                key={idx}
                                                className="hover:bg-cyan-500/[0.03] transition-colors"
                                            >
                                                <td className="px-5 py-3">
                                                    <span className="text-xs text-on-surface font-bold">
                                                        {COUNTRY_FLAGS[isl.country] || '🏳️'} {isl.country}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="text-xs text-cyan-400 font-bold">
                                                        {isl.city}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="text-xs text-on-surface font-bold">
                                                        {isl.allOrders}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span
                                                        className={`text-xs font-bold ${
                                                            isl.cancelOrders > 0
                                                                ? 'text-orange-400'
                                                                : 'text-text-muted/40'
                                                        }`}
                                                    >
                                                        {isl.cancelOrders}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="text-xs text-emerald-400 font-bold">
                                                        {isl.confirmedQty}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <span className="text-xs text-teal-400 font-black">
                                                        {fmt(isl.revenue)}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <ReturnBadge rate={isl.returnRate} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* ── Info note ────────────────────────────────── */}
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-5 py-3 flex items-start gap-3">
                        <span
                            className="material-symbols-outlined text-blue-400 mt-0.5"
                            style={{ fontSize: '18px' }}
                        >
                            info
                        </span>
                        <div>
                            <p className="text-blue-400 text-xs font-bold">
                                {subType === 'test'
                                    ? 'Test Orders = orders where ALL items have a NO-SKU prefix (market testing).'
                                    : 'Actual Orders = orders with at least one real SKU product.'}
                            </p>
                            <p className="text-blue-400/50 text-[10px] mt-1">
                                Revenue = totalAmount for confirmed (non-cancelled) orders. Return Rate =
                                returned / all orders. Island detection uses known European island region
                                keywords.
                            </p>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default DistributionReportTab;
