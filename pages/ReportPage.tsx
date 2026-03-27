import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { adsCampaignsService, PocReportData, PocCampaignDetail } from '../src/services/ads-campaigns.service';
import { customersService } from '../src/services/customers.service';

// ═══════════════════════════════════════════════════════════════════════════════
// POC REPORT TAB
// ═══════════════════════════════════════════════════════════════════════════════

const PocReportTab: React.FC = () => {
    const [data, setData] = useState<PocReportData | null>(null);
    const [loading, setLoading] = useState(true);
    const [countryFilter, setCountryFilter] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [dateRangePreset, setDateRangePreset] = useState('All Time');
    const [sortField, setSortField] = useState<'spendEur' | 'leads' | 'confirmedLeads' | 'cpl' | 'cpcl'>('spendEur');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [dbCountries, setDbCountries] = useState<string[]>([]);

    useEffect(() => {
        const fetchCountries = async () => {
            try {
                const custsRes = await customersService.getAll();
                const custs = Array.isArray(custsRes) ? custsRes : ((custsRes as any).data || []);
                const unique = [...new Set(custs.map((c: any) => c.country).filter(Boolean))] as string[];
                setDbCountries(unique);
            } catch (err) { console.error('Failed to fetch countries', err); }
        };
        fetchCountries();
    }, []);

    const handlePresetChange = (preset: string) => {
        setDateRangePreset(preset);
        const today = new Date();
        const formatDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

        // Get Monday of current week
        const getMonday = (d: Date) => {
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            return new Date(d.getFullYear(), d.getMonth(), diff);
        };
        // Get Sunday of current week
        const getSunday = (d: Date) => {
            const monday = getMonday(d);
            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);
            return sunday;
        };

        switch (preset) {
            case 'Today': setStartDate(formatDate(today)); setEndDate(formatDate(today)); break;
            case 'Yesterday': { const y = new Date(today); y.setDate(y.getDate() - 1); setStartDate(formatDate(y)); setEndDate(formatDate(y)); break; }
            case 'This week': { setStartDate(formatDate(getMonday(today))); setEndDate(formatDate(getSunday(today))); break; }
            case 'Last week': {
                const lastWeek = new Date(today);
                lastWeek.setDate(today.getDate() - 7);
                setStartDate(formatDate(getMonday(lastWeek)));
                setEndDate(formatDate(getSunday(lastWeek)));
                break;
            }
            case 'All Time': setStartDate(''); setEndDate(''); break;
        }
    };

    const fetchReport = async () => {
        setLoading(true);
        try {
            const params: any = {};
            if (countryFilter) params.country = countryFilter;
            if (startDate) params.startDate = startDate;
            if (endDate) params.endDate = endDate;
            const result = await adsCampaignsService.getPocReport(params);
            setData(result);
        } catch (err) { console.error('POC Report fetch error:', err); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchReport(); }, [countryFilter, startDate, endDate]);

    const handleSort = (field: typeof sortField) => {
        if (sortField === field) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDir('desc');
        }
    };

    if (loading) return <div className="text-text-muted text-sm py-12 text-center">Loading POC report...</div>;
    if (!data) return <div className="text-red-400 text-sm py-12 text-center">Failed to load POC report.</div>;

    const k = data.kpis;
    const kpis = [
        { label: 'Products Tested', value: k.totalTested.toString(), icon: 'science', color: 'text-purple-400', border: 'border-l-purple-500' },
        { label: 'Total POC Spend', value: `€${k.totalSpendEur.toLocaleString()}`, icon: 'payments', color: 'text-blue-400', border: 'border-l-blue-500' },
        { label: 'Leads Generated', value: k.totalLeads.toLocaleString(), icon: 'group', color: 'text-indigo-400', border: 'border-l-indigo-500' },
        { label: 'Confirmed Leads', value: k.totalConfirmedLeads.toLocaleString(), icon: 'verified', color: 'text-teal-400', border: 'border-l-teal-500' },
        { label: 'CPL', value: `€${k.cpl.toLocaleString()}`, icon: 'person_add', color: 'text-cyan-400', border: 'border-l-cyan-500' },
        { label: 'CPCL', value: `€${k.cpcl.toLocaleString()}`, icon: 'verified_user', color: 'text-amber-400', border: 'border-l-amber-500' },
        { label: 'Qualified Products', value: k.qualified.toString(), icon: 'emoji_events', color: 'text-emerald-400', border: 'border-l-emerald-500' },
        { label: 'Qualify Rate', value: `${k.qualifyRate}%`, icon: 'trending_up', color: k.qualifyRate >= 10 ? 'text-emerald-400' : 'text-amber-400', border: k.qualifyRate >= 10 ? 'border-l-emerald-500' : 'border-l-amber-500' },
    ];

    // Funnel data
    const funnelData = [
        { stage: 'Products Tested', value: data.funnel.tested, color: '#a78bfa' },
        { stage: 'Leads Generated', value: data.funnel.leads, color: '#818cf8' },
        { stage: 'Confirmed Leads', value: data.funnel.confirmedLeads, color: '#2dd4bf' },
        { stage: 'Qualified', value: data.funnel.qualified, color: '#34d399' },
    ];
    const funnelMax = Math.max(...funnelData.map(d => d.value), 1);

    // Sort campaigns
    const sorted = [...data.campaigns].sort((a, b) => {
        const aVal = a[sortField];
        const bVal = b[sortField];
        return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });

    const qualifyBadge = (status: PocCampaignDetail['qualifyStatus']) => {
        switch (status) {
            case 'QUALIFIED':
                return <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">🟢 Qualified</span>;
            case 'IN_PROGRESS':
                return <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">🟡 In Progress</span>;
            case 'NOT_QUALIFIED':
                return <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">🔴 Not Qualified</span>;
        }
    };

    const SortIcon: React.FC<{ field: typeof sortField }> = ({ field }) => {
        if (sortField !== field) return <span className="material-symbols-outlined text-[12px] text-text-muted/30 ml-0.5">unfold_more</span>;
        return <span className="material-symbols-outlined text-[12px] text-primary ml-0.5">{sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>;
    };

    return (
        <div className="flex flex-col gap-6">
            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-end">
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">Country</label>
                    <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)} className="bg-card-dark border border-border-dark rounded-lg px-3 py-2 text-white text-sm appearance-none cursor-pointer min-w-[120px]">
                        <option value="">All</option>
                        {dbCountries.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">Date Range</label>
                    <select value={dateRangePreset} onChange={e => handlePresetChange(e.target.value)} className="bg-card-dark border border-border-dark rounded-lg px-3 py-2 text-white text-sm appearance-none cursor-pointer min-w-[140px]">
                        <option value="All Time">All Time</option>
                        <option value="Today">Today</option>
                        <option value="Yesterday">Yesterday</option>
                        <option value="This week">This week</option>
                        <option value="Last week">Last week</option>
                        <option value="Custom">Custom range</option>
                    </select>
                </div>
                {dateRangePreset === 'Custom' && (
                    <>
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">From</label>
                            <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setDateRangePreset('Custom'); }}
                                className="bg-card-dark border border-border-dark rounded-lg px-3 py-2 text-white text-sm" />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">To</label>
                            <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setDateRangePreset('Custom'); }}
                                className="bg-card-dark border border-border-dark rounded-lg px-3 py-2 text-white text-sm" />
                        </div>
                    </>
                )}
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {kpis.map((kpi, i) => (
                    <div key={i} className={`bg-card-dark p-5 rounded-2xl border border-border-dark border-l-4 ${kpi.border} relative overflow-hidden group hover:shadow-lg transition-shadow`}>
                        <div className="absolute -right-2 -bottom-2 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity"><span className="material-symbols-outlined text-[80px]">{kpi.icon}</span></div>
                        <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em]">{kpi.label}</p>
                        <h3 className={`text-2xl font-black tracking-tight mt-2 ${kpi.color}`}>{kpi.value}</h3>
                    </div>
                ))}
            </div>

            {/* POC Funnel Visualization */}
            <div className="bg-card-dark rounded-2xl border border-border-dark p-6">
                <h3 className="text-xs font-black uppercase tracking-widest text-text-muted mb-6">🔻 POC Conversion Funnel</h3>
                {data.funnel.tested === 0 ? (
                    <div className="text-text-muted text-sm text-center py-8">No POC data available. Upload campaigns with stage "Test" to see the funnel.</div>
                ) : (
                    <div className="flex flex-col gap-3">
                        {funnelData.map((item, idx) => {
                            const widthPercent = funnelMax > 0 ? Math.max((item.value / funnelMax) * 100, 4) : 4;
                            const percent = data.funnel.tested > 0 ? Math.round((item.value / data.funnel.tested) * 100) : 0;
                            return (
                                <div key={idx} className="flex items-center gap-4">
                                    <div className="w-[150px] shrink-0 text-right">
                                        <span className="text-xs font-bold text-text-muted">{item.stage}</span>
                                    </div>
                                    <div className="flex-1 relative h-10 bg-[#1c2d3d] rounded-xl overflow-hidden">
                                        <div
                                            className="h-full rounded-xl flex items-center justify-end pr-3 transition-all duration-700 ease-out"
                                            style={{
                                                width: `${widthPercent}%`,
                                                background: `linear-gradient(90deg, ${item.color}20, ${item.color}60)`,
                                                borderRight: `3px solid ${item.color}`,
                                            }}
                                        >
                                        </div>
                                        <div className="absolute inset-0 flex items-center pl-3">
                                            <span className="text-sm font-black text-white drop-shadow-lg">
                                                {item.value.toLocaleString()}
                                            </span>
                                            <span className="text-[10px] text-text-muted font-bold ml-2">
                                                ({percent}%)
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* POC Detail Table */}
            <div className="bg-card-dark rounded-2xl border border-border-dark overflow-hidden">
                <div className="px-6 py-4 border-b border-border-dark bg-[#14202c]">
                    <h3 className="text-xs font-black uppercase tracking-widest text-text-muted">
                        📊 POC Product Detail ({data.campaigns.length} products tested)
                    </h3>
                </div>
                {data.campaigns.length === 0 ? (
                    <div className="p-12 text-center text-text-muted text-sm">
                        <span className="material-symbols-outlined text-[48px] block mb-3 opacity-20">science</span>
                        No POC campaigns found. Upload campaigns with stage "Test" to track product qualification.
                    </div>
                ) : (
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse min-w-[1000px]">
                            <thead>
                                <tr className="bg-[#17232f]">
                                    <th className="px-4 py-3 text-text-muted font-black text-[10px] uppercase tracking-widest">Product Name</th>
                                    <th className="px-4 py-3 text-text-muted font-black text-[10px] uppercase tracking-widest">Country</th>
                                    <th className="px-4 py-3 text-text-muted font-black text-[10px] uppercase tracking-widest">SKU</th>
                                    <th className="px-4 py-3 text-text-muted font-black text-[10px] uppercase tracking-widest cursor-pointer select-none hover:text-white transition-colors" onClick={() => handleSort('spendEur')}>
                                        <span className="flex items-center">Cost (EUR)<SortIcon field="spendEur" /></span>
                                    </th>
                                    <th className="px-4 py-3 text-text-muted font-black text-[10px] uppercase tracking-widest cursor-pointer select-none hover:text-white transition-colors" onClick={() => handleSort('leads')}>
                                        <span className="flex items-center">Leads<SortIcon field="leads" /></span>
                                    </th>
                                    <th className="px-4 py-3 text-text-muted font-black text-[10px] uppercase tracking-widest cursor-pointer select-none hover:text-white transition-colors" onClick={() => handleSort('confirmedLeads')}>
                                        <span className="flex items-center">Confirm Leads<SortIcon field="confirmedLeads" /></span>
                                    </th>
                                    <th className="px-4 py-3 text-text-muted font-black text-[10px] uppercase tracking-widest cursor-pointer select-none hover:text-white transition-colors" onClick={() => handleSort('cpl')}>
                                        <span className="flex items-center">CPL<SortIcon field="cpl" /></span>
                                    </th>
                                    <th className="px-4 py-3 text-text-muted font-black text-[10px] uppercase tracking-widest cursor-pointer select-none hover:text-white transition-colors" onClick={() => handleSort('cpcl')}>
                                        <span className="flex items-center">CPCL<SortIcon field="cpcl" /></span>
                                    </th>
                                    <th className="px-4 py-3 text-text-muted font-black text-[10px] uppercase tracking-widest">Qualify POC</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-dark/50">
                                {sorted.map((c, i) => (
                                    <tr key={i} className="hover:bg-primary/[0.03] transition-colors">
                                        <td className="px-4 py-3 text-xs text-white font-bold max-w-[250px] truncate" title={c.productName}>{c.productName}</td>
                                        <td className="px-4 py-3">
                                            {c.country ? (
                                                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">{c.country}</span>
                                            ) : <span className="text-text-muted text-xs">—</span>}
                                        </td>
                                        <td className="px-4 py-3 text-xs text-primary font-mono">{c.sku || '—'}</td>
                                        <td className="px-4 py-3 text-xs font-black text-white">€{c.spendEur.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-xs font-bold text-indigo-400">{c.leads}</td>
                                        <td className="px-4 py-3 text-xs font-bold text-teal-400">{c.confirmedLeads}</td>
                                        <td className="px-4 py-3 text-xs font-bold text-cyan-400">€{c.cpl.toFixed(2)}</td>
                                        <td className="px-4 py-3 text-xs font-bold text-amber-400">€{c.cpcl.toFixed(2)}</td>
                                        <td className="px-4 py-3">{qualifyBadge(c.qualifyStatus)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};


// ═══════════════════════════════════════════════════════════════════════════════
// REPORT PAGE (Main)
// ═══════════════════════════════════════════════════════════════════════════════

const ReportPage: React.FC = () => {
    const [tab, setTab] = useState<'poc'>('poc');

    return (
        <div className="flex flex-col gap-6 pb-12">
            {/* Header */}
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-text-muted text-xs font-bold uppercase tracking-wider opacity-60">Home</span>
                    <span className="text-text-muted text-xs opacity-30">/</span>
                    <span className="text-white text-xs font-bold uppercase tracking-wider">Reports</span>
                </div>
                <h1 className="text-white text-3xl font-black tracking-tight">Reports</h1>
                <p className="text-text-muted text-sm">POC reports, funnel analytics, and product qualification tracking.</p>
            </div>

            {/* Tab Switcher */}
            <div className="flex gap-1 p-1 bg-card-dark rounded-xl border border-border-dark w-fit">
                {([{ key: 'poc' as const, label: '🧪 POC Report' }]).map(t => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${tab === t.key ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-text-muted hover:text-white hover:bg-white/5'}`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            {tab === 'poc' && <PocReportTab />}
        </div>
    );
};

export default ReportPage;
