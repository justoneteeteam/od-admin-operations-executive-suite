import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { adsCampaignsService, exchangeRatesService, AdsCampaign, DashboardData, ChangeLogEntry, ExchangeRate } from '../src/services/ads-campaigns.service';

// ─── Types ───────────────────────────────────────────────────────────────────
interface StagedRecord {
    date: string; campaign: string; country: string; platform: string;
    sku: string; stage: string; pic: string; spendVnd: number; notes: string;
}

// ─── ADS PAGE ────────────────────────────────────────────────────────────────
const AdsPage: React.FC = () => {
    const [tab, setTab] = useState<'dashboard' | 'input' | 'adjust' | 'rates'>('dashboard');

    return (
        <div className="flex flex-col gap-6 pb-12">
            {/* Header */}
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-text-muted text-xs font-bold uppercase tracking-wider opacity-60">Home</span>
                    <span className="text-text-muted text-xs opacity-30">/</span>
                    <span className="text-white text-xs font-bold uppercase tracking-wider">Ads Analytics</span>
                </div>
                <h1 className="text-white text-3xl font-black tracking-tight">Ads Campaign Analytics</h1>
                <p className="text-text-muted text-sm">Track ad spend, compute ROAS from live order data, and manage exchange rates.</p>
            </div>

            {/* Tab Switcher */}
            <div className="flex gap-1 p-1 bg-card-dark rounded-xl border border-border-dark w-fit">
                {(['dashboard', 'input', 'adjust', 'rates'] as const).map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`px-5 py-2 rounded-lg text-sm font-bold transition-all capitalize ${tab === t ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-text-muted hover:text-white hover:bg-white/5'}`}
                    >
                        {t === 'dashboard' ? '📊 Dashboard' : t === 'input' ? '📥 Input' : t === 'adjust' ? '✏️ Adjust' : '💱 Rates'}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            {tab === 'dashboard' && <DashboardTab />}
            {tab === 'input' && <InputTab />}
            {tab === 'adjust' && <AdjustTab />}
            {tab === 'rates' && <RatesTab />}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD TAB
// ═══════════════════════════════════════════════════════════════════════════════
const DashboardTab: React.FC = () => {
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [countryFilter, setCountryFilter] = useState('');
    const [stageFilter, setStageFilter] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [currency, setCurrency] = useState<'EUR' | 'VND'>('EUR');

    const fetchDashboard = async () => {
        setLoading(true);
        try {
            const params: any = {};
            if (countryFilter) params.country = countryFilter;
            if (stageFilter) params.stage = stageFilter;
            if (startDate) params.startDate = startDate;
            if (endDate) params.endDate = endDate;
            const result = await adsCampaignsService.getDashboard(params);
            setData(result);
        } catch (err) { console.error('Dashboard fetch error:', err); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchDashboard(); }, [countryFilter, stageFilter, startDate, endDate]);

    if (loading) return <div className="text-text-muted text-sm py-12 text-center">Loading dashboard...</div>;
    if (!data) return <div className="text-red-400 text-sm py-12 text-center">Failed to load dashboard data.</div>;

    const k = data.kpis;
    const vndRate = k.totalSpendEur > 0 ? k.totalSpendVnd / k.totalSpendEur : 27027;

    const kpis = [
        { label: 'Total Spend', value: currency === 'EUR' ? `€${k.totalSpendEur.toLocaleString()}` : `₫${k.totalSpendVnd.toLocaleString()}`, icon: 'payments', color: 'text-blue-400', border: 'border-l-blue-500' },
        { label: 'Revenue', value: `€${k.totalRevenue.toLocaleString()}`, icon: 'trending_up', color: 'text-emerald-400', border: 'border-l-emerald-500' },
        { label: 'ROAS', value: `${k.roas}x`, icon: 'speed', color: k.roas >= 2 ? 'text-emerald-400' : 'text-amber-400', border: k.roas >= 2 ? 'border-l-emerald-500' : 'border-l-amber-500' },
        { label: 'CPO', value: `€${k.cpo.toLocaleString()}`, icon: 'shopping_cart', color: 'text-purple-400', border: 'border-l-purple-500' },
        { label: 'CPL', value: `€${k.cpl.toLocaleString()}`, icon: 'person_add', color: 'text-cyan-400', border: 'border-l-cyan-500' },
        { label: 'CVR', value: `${k.cvr}%`, icon: 'percent', color: 'text-amber-400', border: 'border-l-amber-500' },
        { label: 'Total Leads', value: k.totalLeads.toLocaleString(), icon: 'group', color: 'text-indigo-400', border: 'border-l-indigo-500' },
        { label: 'Total Orders', value: k.totalOrders.toLocaleString(), icon: 'package_2', color: 'text-pink-400', border: 'border-l-pink-500' },
    ];

    // Countries for filter
    const countries = [...new Set(data.campaigns.map(c => c.country).filter(Boolean))] as string[];
    const stages = [...new Set(data.campaigns.map(c => c.stage).filter(Boolean))] as string[];

    return (
        <div className="flex flex-col gap-6">
            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-end">
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">Country</label>
                    <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)}
                        className="bg-card-dark border border-border-dark rounded-lg px-3 py-2 text-white text-sm appearance-none cursor-pointer min-w-[120px]">
                        <option value="">All</option>
                        {countries.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">Stage</label>
                    <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
                        className="bg-card-dark border border-border-dark rounded-lg px-3 py-2 text-white text-sm appearance-none cursor-pointer min-w-[120px]">
                        <option value="">All</option>
                        {stages.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">From</label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                        className="bg-card-dark border border-border-dark rounded-lg px-3 py-2 text-white text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">To</label>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                        className="bg-card-dark border border-border-dark rounded-lg px-3 py-2 text-white text-sm" />
                </div>
                <button onClick={() => setCurrency(c => c === 'EUR' ? 'VND' : 'EUR')}
                    className="h-[38px] px-4 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 text-sm font-bold hover:bg-amber-500/20 transition-all">
                    {currency === 'EUR' ? '€ EUR' : '₫ VND'}
                </button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {kpis.map((kpi, i) => (
                    <div key={i} className={`bg-card-dark p-5 rounded-2xl border border-border-dark border-l-4 ${kpi.border} relative overflow-hidden group hover:shadow-lg transition-shadow`}>
                        <div className="absolute -right-2 -bottom-2 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity">
                            <span className="material-symbols-outlined text-[80px]">{kpi.icon}</span>
                        </div>
                        <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em]">{kpi.label}</p>
                        <h3 className={`text-2xl font-black tracking-tight mt-2 ${kpi.color}`}>{kpi.value}</h3>
                    </div>
                ))}
            </div>

            {/* Chart */}
            {data.chartData.length > 0 && (
                <div className="bg-card-dark rounded-2xl border border-border-dark p-6">
                    <h3 className="text-xs font-black uppercase tracking-widest text-text-muted mb-6">Spend vs Revenue Trend</h3>
                    <ResponsiveContainer width="100%" height={280}>
                        <AreaChart data={data.chartData}>
                            <defs>
                                <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#233648" />
                            <XAxis dataKey="date" tick={{ fill: '#9CA3AF', fontSize: 10 }} />
                            <YAxis tick={{ fill: '#9CA3AF', fontSize: 10 }} />
                            <Tooltip contentStyle={{ backgroundColor: '#111a22', border: '1px solid #233648', borderRadius: 12, fontSize: 12 }} />
                            <Area type="monotone" dataKey="spendEur" stroke="#3b82f6" fill="url(#spendGrad)" strokeWidth={2} name="Spend (EUR)" />
                            <Area type="monotone" dataKey="revenue" stroke="#10b981" fill="url(#revGrad)" strokeWidth={2} name="Revenue (EUR)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Campaign Breakdown Table */}
            <div className="bg-card-dark rounded-2xl border border-border-dark overflow-hidden">
                <div className="px-6 py-4 border-b border-border-dark bg-[#14202c]">
                    <h3 className="text-xs font-black uppercase tracking-widest text-text-muted">Campaign Breakdown ({data.campaigns.length} records)</h3>
                </div>
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse min-w-[1200px]">
                        <thead>
                            <tr className="bg-[#17232f]">
                                {['Date', 'Campaign', 'Country', 'SKU', 'Stage', 'Spend (EUR)', 'Revenue', 'Leads', 'Orders', 'ROAS', 'CPO', 'CVR'].map(h => (
                                    <th key={h} className="px-4 py-3 text-text-muted font-black text-[10px] uppercase tracking-widest">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-dark/50">
                            {data.campaigns.map((c, i) => (
                                <tr key={i} className="hover:bg-primary/[0.02] transition-colors">
                                    <td className="px-4 py-3 text-xs text-white font-mono">{new Date(c.date).toLocaleDateString('en-GB')}</td>
                                    <td className="px-4 py-3 text-xs text-white font-bold max-w-[200px] truncate">{c.campaign}</td>
                                    <td className="px-4 py-3"><span className="text-[10px] font-black text-text-muted uppercase tracking-widest">{c.country || '—'}</span></td>
                                    <td className="px-4 py-3 text-xs text-primary font-mono">{c.sku}</td>
                                    <td className="px-4 py-3">
                                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${c.stage === 'Win' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : c.stage === 'Scale' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : c.stage === 'POC' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>
                                            {c.stage || '—'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-xs font-black text-white">€{(c.spendEur || 0).toLocaleString()}</td>
                                    <td className="px-4 py-3 text-xs font-black text-emerald-400">€{(c.revenueEur || 0).toLocaleString()}</td>
                                    <td className="px-4 py-3 text-xs font-bold text-white">{c.leads || 0}</td>
                                    <td className="px-4 py-3 text-xs font-bold text-white">{c.orders || 0}</td>
                                    <td className="px-4 py-3 text-xs font-black">
                                        <span className={(c.roas || 0) >= 2 ? 'text-emerald-400' : (c.roas || 0) >= 1 ? 'text-amber-400' : 'text-red-400'}>{(c.roas || 0).toFixed(2)}x</span>
                                    </td>
                                    <td className="px-4 py-3 text-xs font-bold text-white">€{(c.cpo || 0).toFixed(2)}</td>
                                    <td className="px-4 py-3 text-xs font-bold text-white">{(c.cvr || 0).toFixed(1)}%</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════════
// INPUT TAB
// ═══════════════════════════════════════════════════════════════════════════════
const InputTab: React.FC = () => {
    const [staged, setStaged] = useState<StagedRecord[]>([]);
    const [saving, setSaving] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    // Manual entry state
    const [manual, setManual] = useState<StagedRecord>({
        date: '', campaign: '', country: '', platform: '', sku: '', stage: '', pic: '', spendVnd: 0, notes: '',
    });

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            // Dynamic import xlsx
            const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs' as any);
            const data = await file.arrayBuffer();
            const wb = XLSX.read(data, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const json: any[] = XLSX.utils.sheet_to_json(ws);

            const records: StagedRecord[] = json.map((row: any) => {
                // Try to parse date from various formats
                let dateStr = '';
                const rawDate = row['Date'] || row['date'] || row['DATE'] || '';
                if (rawDate) {
                    if (typeof rawDate === 'number') {
                        // Excel serial date
                        const d = new Date((rawDate - 25569) * 86400 * 1000);
                        dateStr = d.toISOString().split('T')[0];
                    } else {
                        // Try DD/MM/YYYY format
                        const parts = String(rawDate).split('/');
                        if (parts.length === 3) {
                            dateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                        } else {
                            dateStr = String(rawDate);
                        }
                    }
                }

                return {
                    date: dateStr,
                    campaign: row['Campaign'] || row['campaign'] || row['CAMPAIGN'] || '',
                    country: row['Country'] || row['country'] || row['COUNTRY'] || '',
                    platform: row['Platform'] || row['platform'] || row['PLATFORM'] || '',
                    sku: row['SKU'] || row['sku'] || row['Sku'] || '',
                    stage: row['Stage'] || row['stage'] || row['STAGE'] || '',
                    pic: row['PIC'] || row['pic'] || row['Person'] || '',
                    spendVnd: Number(row['Spend VND'] || row['spend_vnd'] || row['SpendVND'] || row['Spend'] || 0),
                    notes: row['Notes'] || row['notes'] || '',
                };
            }).filter((r: StagedRecord) => r.campaign && r.sku);

            setStaged(records);
            setResult(`Parsed ${records.length} records from ${file.name}`);
        } catch (err) {
            console.error('File parse error:', err);
            setResult('Failed to parse file. Please check the format.');
        }
    };

    const addManualRecord = () => {
        if (!manual.campaign || !manual.sku || !manual.date) {
            setResult('Date, Campaign, and SKU are required.');
            return;
        }
        setStaged(prev => [...prev, { ...manual }]);
        setManual({ date: '', campaign: '', country: '', platform: '', sku: '', stage: '', pic: '', spendVnd: 0, notes: '' });
        setResult(null);
    };

    const removeStaged = (index: number) => {
        setStaged(prev => prev.filter((_, i) => i !== index));
    };

    const saveAll = async () => {
        if (staged.length === 0) return;
        setSaving(true);
        setResult(null);
        try {
            const res = await adsCampaignsService.bulkCreate(staged as any);
            setResult(`✅ Successfully saved ${res.created} records to database.`);
            setStaged([]);
        } catch (err: any) {
            setResult(`❌ ${err.response?.data?.message || 'Failed to save records.'}`);
        } finally { setSaving(false); }
    };

    return (
        <div className="flex flex-col gap-6">
            {/* File Upload */}
            <div className="bg-card-dark rounded-2xl border border-border-dark p-6">
                <h3 className="text-xs font-black uppercase tracking-widest text-text-muted mb-4">📁 Upload Excel / CSV</h3>
                <div className="flex items-center gap-4">
                    <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" />
                    <button onClick={() => fileRef.current?.click()}
                        className="px-6 py-3 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary/90 transition-all shadow-lg shadow-primary/20">
                        <span className="material-symbols-outlined mr-2 align-middle" style={{ fontSize: 18 }}>upload_file</span>
                        Choose File
                    </button>
                    <span className="text-text-muted text-sm">Supported: .xlsx, .xls, .csv</span>
                </div>
            </div>

            {/* Manual Entry */}
            <div className="bg-card-dark rounded-2xl border border-border-dark p-6">
                <h3 className="text-xs font-black uppercase tracking-widest text-text-muted mb-4">✍️ Manual Entry</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <input type="date" value={manual.date} onChange={e => setManual(m => ({ ...m, date: e.target.value }))}
                        className="bg-[#1c2d3d] border border-border-dark rounded-lg px-3 py-2.5 text-white text-sm" placeholder="Date" />
                    <input value={manual.campaign} onChange={e => setManual(m => ({ ...m, campaign: e.target.value }))}
                        className="bg-[#1c2d3d] border border-border-dark rounded-lg px-3 py-2.5 text-white text-sm" placeholder="Campaign Name" />
                    <input value={manual.country} onChange={e => setManual(m => ({ ...m, country: e.target.value }))}
                        className="bg-[#1c2d3d] border border-border-dark rounded-lg px-3 py-2.5 text-white text-sm" placeholder="Country (e.g. IT)" />
                    <input value={manual.sku} onChange={e => setManual(m => ({ ...m, sku: e.target.value }))}
                        className="bg-[#1c2d3d] border border-border-dark rounded-lg px-3 py-2.5 text-white text-sm" placeholder="SKU" />
                    <input value={manual.platform} onChange={e => setManual(m => ({ ...m, platform: e.target.value }))}
                        className="bg-[#1c2d3d] border border-border-dark rounded-lg px-3 py-2.5 text-white text-sm" placeholder="Platform" />
                    <select value={manual.stage} onChange={e => setManual(m => ({ ...m, stage: e.target.value }))}
                        className="bg-[#1c2d3d] border border-border-dark rounded-lg px-3 py-2.5 text-white text-sm appearance-none cursor-pointer">
                        <option value="">Stage</option>
                        <option>Test</option><option>POC</option><option>Win</option><option>Scale</option>
                    </select>
                    <input value={manual.pic} onChange={e => setManual(m => ({ ...m, pic: e.target.value }))}
                        className="bg-[#1c2d3d] border border-border-dark rounded-lg px-3 py-2.5 text-white text-sm" placeholder="PIC" />
                    <input type="number" value={manual.spendVnd || ''} onChange={e => setManual(m => ({ ...m, spendVnd: Number(e.target.value) }))}
                        className="bg-[#1c2d3d] border border-border-dark rounded-lg px-3 py-2.5 text-white text-sm" placeholder="Spend (VND)" />
                </div>
                <button onClick={addManualRecord}
                    className="mt-4 px-5 py-2.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-sm font-bold hover:bg-emerald-500/20 transition-all">
                    + Add Record
                </button>
            </div>

            {/* Result Message */}
            {result && (
                <div className={`px-5 py-3 rounded-xl text-sm font-medium ${result.startsWith('✅') ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : result.startsWith('❌') ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'}`}>
                    {result}
                </div>
            )}

            {/* Staged Records Preview */}
            {staged.length > 0 && (
                <div className="bg-card-dark rounded-2xl border border-border-dark overflow-hidden">
                    <div className="px-6 py-4 border-b border-border-dark bg-[#14202c] flex justify-between items-center">
                        <h3 className="text-xs font-black uppercase tracking-widest text-text-muted">
                            Preview ({staged.length} staged records)
                        </h3>
                        <button onClick={saveAll} disabled={saving}
                            className="px-5 py-2 bg-primary text-white rounded-lg font-bold text-sm hover:bg-primary/90 disabled:opacity-50 transition-all shadow-lg shadow-primary/20">
                            {saving ? 'Saving...' : `💾 Save All (${staged.length})`}
                        </button>
                    </div>
                    <div className="overflow-x-auto custom-scrollbar max-h-[400px] overflow-y-auto">
                        <table className="w-full text-left border-collapse min-w-[900px]">
                            <thead className="sticky top-0 bg-[#17232f]">
                                <tr>
                                    {['Date', 'Campaign', 'Country', 'SKU', 'Stage', 'PIC', 'Spend (VND)', ''].map(h => (
                                        <th key={h} className="px-4 py-3 text-text-muted font-black text-[10px] uppercase tracking-widest">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-dark/50">
                                {staged.map((r, i) => (
                                    <tr key={i} className="hover:bg-primary/[0.02]">
                                        <td className="px-4 py-2.5 text-xs text-white font-mono">{r.date}</td>
                                        <td className="px-4 py-2.5 text-xs text-white font-bold max-w-[180px] truncate">{r.campaign}</td>
                                        <td className="px-4 py-2.5 text-xs text-text-muted uppercase font-bold">{r.country}</td>
                                        <td className="px-4 py-2.5 text-xs text-primary font-mono">{r.sku}</td>
                                        <td className="px-4 py-2.5 text-xs text-text-muted">{r.stage}</td>
                                        <td className="px-4 py-2.5 text-xs text-text-muted">{r.pic}</td>
                                        <td className="px-4 py-2.5 text-xs text-white font-bold">₫{r.spendVnd.toLocaleString()}</td>
                                        <td className="px-4 py-2.5">
                                            <button onClick={() => removeStaged(i)} className="text-red-400 hover:text-red-300">
                                                <span className="material-symbols-outlined text-sm">close</span>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ADJUST TAB
// ═══════════════════════════════════════════════════════════════════════════════
const AdjustTab: React.FC = () => {
    const [records, setRecords] = useState<AdsCampaign[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<string | null>(null);
    const [editData, setEditData] = useState<Partial<AdsCampaign>>({});
    const [changeLog, setChangeLog] = useState<ChangeLogEntry[]>([]);
    const [showLogFor, setShowLogFor] = useState<string | null>(null);
    const [saveResult, setSaveResult] = useState<string | null>(null);
    const [search, setSearch] = useState('');

    const fetchRecords = async () => {
        setLoading(true);
        try {
            const data = await adsCampaignsService.getAll();
            setRecords(data);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchRecords(); }, []);

    const startEdit = (record: AdsCampaign) => {
        setEditing(record.id);
        setEditData({ ...record });
        setSaveResult(null);
    };

    const cancelEdit = () => {
        setEditing(null);
        setEditData({});
    };

    const saveEdit = async () => {
        if (!editing) return;
        try {
            const res = await adsCampaignsService.update(editing, editData);
            setSaveResult(res.changes?.length > 0
                ? `✅ Updated. Changes: ${res.changes.map((c: any) => `${c.fieldName}: ${c.oldValue} → ${c.newValue}`).join(', ')}`
                : '✅ No changes detected.');
            setEditing(null);
            fetchRecords();
        } catch (err: any) {
            setSaveResult(`❌ ${err.response?.data?.message || 'Update failed'}`);
        }
    };

    const deleteRecord = async (id: string) => {
        if (!window.confirm('Delete this campaign record?')) return;
        try {
            await adsCampaignsService.remove(id);
            fetchRecords();
        } catch (err) { console.error(err); }
    };

    const viewChangeLog = async (id: string) => {
        try {
            const log = await adsCampaignsService.getChangeLog(id);
            setChangeLog(log);
            setShowLogFor(showLogFor === id ? null : id);
        } catch (err) { console.error(err); }
    };

    const filtered = records.filter(r =>
        r.campaign.toLowerCase().includes(search.toLowerCase()) ||
        r.sku.toLowerCase().includes(search.toLowerCase()) ||
        (r.country || '').toLowerCase().includes(search.toLowerCase())
    );

    if (loading) return <div className="text-text-muted text-sm py-12 text-center">Loading records...</div>;

    return (
        <div className="flex flex-col gap-4">
            <div className="flex gap-4 items-center">
                <div className="relative flex-1 max-w-md">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-[18px]">search</span>
                    <input value={search} onChange={e => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-card-dark border border-border-dark rounded-xl text-white text-sm placeholder:text-text-muted/50 focus:ring-2 focus:ring-primary/50"
                        placeholder="Search campaigns, SKU, country..." />
                </div>
            </div>

            {saveResult && (
                <div className={`px-5 py-3 rounded-xl text-sm font-medium ${saveResult.startsWith('✅') ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                    {saveResult}
                </div>
            )}

            <div className="bg-card-dark rounded-2xl border border-border-dark overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse min-w-[1100px]">
                        <thead>
                            <tr className="bg-[#17232f]">
                                {['Date', 'Campaign', 'Country', 'SKU', 'Stage', 'PIC', 'Spend (VND)', 'Actions'].map(h => (
                                    <th key={h} className="px-4 py-3 text-text-muted font-black text-[10px] uppercase tracking-widest">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-dark/50">
                            {filtered.map(r => (
                                <React.Fragment key={r.id}>
                                    <tr className="hover:bg-primary/[0.02] transition-colors">
                                        {editing === r.id ? (
                                            <>
                                                <td className="px-4 py-2"><input type="date" value={editData.date?.toString().split('T')[0] || ''} onChange={e => setEditData(d => ({ ...d, date: e.target.value }))} className="bg-[#1c2d3d] border border-border-dark rounded px-2 py-1 text-white text-xs w-full" /></td>
                                                <td className="px-4 py-2"><input value={editData.campaign || ''} onChange={e => setEditData(d => ({ ...d, campaign: e.target.value }))} className="bg-[#1c2d3d] border border-border-dark rounded px-2 py-1 text-white text-xs w-full" /></td>
                                                <td className="px-4 py-2"><input value={editData.country || ''} onChange={e => setEditData(d => ({ ...d, country: e.target.value }))} className="bg-[#1c2d3d] border border-border-dark rounded px-2 py-1 text-white text-xs w-full max-w-[60px]" /></td>
                                                <td className="px-4 py-2"><input value={editData.sku || ''} onChange={e => setEditData(d => ({ ...d, sku: e.target.value }))} className="bg-[#1c2d3d] border border-border-dark rounded px-2 py-1 text-white text-xs w-full" /></td>
                                                <td className="px-4 py-2">
                                                    <select value={editData.stage || ''} onChange={e => setEditData(d => ({ ...d, stage: e.target.value }))} className="bg-[#1c2d3d] border border-border-dark rounded px-2 py-1 text-white text-xs w-full appearance-none">
                                                        <option value="">—</option><option>Test</option><option>POC</option><option>Win</option><option>Scale</option>
                                                    </select>
                                                </td>
                                                <td className="px-4 py-2"><input value={editData.pic || ''} onChange={e => setEditData(d => ({ ...d, pic: e.target.value }))} className="bg-[#1c2d3d] border border-border-dark rounded px-2 py-1 text-white text-xs w-full" /></td>
                                                <td className="px-4 py-2"><input type="number" value={editData.spendVnd || ''} onChange={e => setEditData(d => ({ ...d, spendVnd: Number(e.target.value) }))} className="bg-[#1c2d3d] border border-border-dark rounded px-2 py-1 text-white text-xs w-full" /></td>
                                                <td className="px-4 py-2 flex gap-2">
                                                    <button onClick={saveEdit} className="text-emerald-400 hover:text-emerald-300"><span className="material-symbols-outlined text-sm">check</span></button>
                                                    <button onClick={cancelEdit} className="text-red-400 hover:text-red-300"><span className="material-symbols-outlined text-sm">close</span></button>
                                                </td>
                                            </>
                                        ) : (
                                            <>
                                                <td className="px-4 py-3 text-xs text-white font-mono">{new Date(r.date).toLocaleDateString('en-GB')}</td>
                                                <td className="px-4 py-3 text-xs text-white font-bold max-w-[200px] truncate">{r.campaign}</td>
                                                <td className="px-4 py-3 text-xs text-text-muted uppercase font-bold">{r.country || '—'}</td>
                                                <td className="px-4 py-3 text-xs text-primary font-mono">{r.sku}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${r.stage === 'Win' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : r.stage === 'Scale' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : r.stage === 'POC' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>
                                                        {r.stage || '—'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-xs text-text-muted">{r.pic || '—'}</td>
                                                <td className="px-4 py-3 text-xs text-white font-bold">₫{Number(r.spendVnd).toLocaleString()}</td>
                                                <td className="px-4 py-3">
                                                    <div className="flex gap-2">
                                                        <button onClick={() => startEdit(r)} className="text-text-muted hover:text-primary transition-colors"><span className="material-symbols-outlined text-sm">edit</span></button>
                                                        <button onClick={() => viewChangeLog(r.id)} className="text-text-muted hover:text-amber-400 transition-colors"><span className="material-symbols-outlined text-sm">history</span></button>
                                                        <button onClick={() => deleteRecord(r.id)} className="text-text-muted hover:text-red-400 transition-colors"><span className="material-symbols-outlined text-sm">delete</span></button>
                                                    </div>
                                                </td>
                                            </>
                                        )}
                                    </tr>
                                    {/* Change Log Expansion */}
                                    {showLogFor === r.id && changeLog.length > 0 && (
                                        <tr>
                                            <td colSpan={8} className="bg-amber-500/5 px-6 py-4 border-t border-amber-500/10">
                                                <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-2">Change History</p>
                                                <div className="space-y-1">
                                                    {changeLog.map(log => (
                                                        <div key={log.id} className="flex items-center gap-3 text-xs">
                                                            <span className="text-text-muted font-mono">{new Date(log.createdAt).toLocaleString()}</span>
                                                            <span className="text-white font-bold">{log.fieldName}:</span>
                                                            <span className="text-red-400 line-through">{log.oldValue}</span>
                                                            <span className="text-text-muted">→</span>
                                                            <span className="text-emerald-400 font-bold">{log.newValue}</span>
                                                            <span className="text-text-muted/50">by {log.changedBy}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════════
// RATES TAB
// ═══════════════════════════════════════════════════════════════════════════════
const RatesTab: React.FC = () => {
    const [rates, setRates] = useState<ExchangeRate[]>([]);
    const [loading, setLoading] = useState(true);
    const [newDate, setNewDate] = useState('');
    const [newRate, setNewRate] = useState('');
    const [result, setResult] = useState<string | null>(null);

    const fetchRates = async () => {
        setLoading(true);
        try { setRates(await exchangeRatesService.getAll()); }
        catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchRates(); }, []);

    const addRate = async () => {
        if (!newDate || !newRate) { setResult('Date and rate are required.'); return; }
        try {
            await exchangeRatesService.upsert(newDate, Number(newRate));
            setResult(`✅ Rate for ${newDate} saved.`);
            setNewDate('');
            setNewRate('');
            fetchRates();
        } catch (err: any) {
            setResult(`❌ ${err.response?.data?.message || 'Failed to save rate'}`);
        }
    };

    const deleteRate = async (id: string) => {
        if (!window.confirm('Delete this rate?')) return;
        try { await exchangeRatesService.remove(id); fetchRates(); }
        catch (err) { console.error(err); }
    };

    return (
        <div className="flex flex-col gap-6">
            {/* Add Rate Form */}
            <div className="bg-card-dark rounded-2xl border border-border-dark p-6">
                <h3 className="text-xs font-black uppercase tracking-widest text-text-muted mb-4">💱 Add / Update Exchange Rate (VND → EUR)</h3>
                <div className="flex gap-4 items-end flex-wrap">
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-black text-text-muted uppercase">Date</label>
                        <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                            className="bg-[#1c2d3d] border border-border-dark rounded-lg px-3 py-2.5 text-white text-sm" />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-black text-text-muted uppercase">Rate (VND → EUR)</label>
                        <input type="text" value={newRate} onChange={e => setNewRate(e.target.value)}
                            className="bg-[#1c2d3d] border border-border-dark rounded-lg px-3 py-2.5 text-white text-sm w-48"
                            placeholder="e.g. 0.0000370" />
                    </div>
                    <button onClick={addRate}
                        className="px-5 py-2.5 bg-primary text-white rounded-lg font-bold text-sm hover:bg-primary/90 transition-all shadow-lg shadow-primary/20">
                        Save Rate
                    </button>
                </div>
                {result && (
                    <div className={`mt-4 px-4 py-2 rounded-lg text-sm ${result.startsWith('✅') ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                        {result}
                    </div>
                )}
            </div>

            {/* Rates Table */}
            <div className="bg-card-dark rounded-2xl border border-border-dark overflow-hidden">
                <div className="px-6 py-4 border-b border-border-dark bg-[#14202c]">
                    <h3 className="text-xs font-black uppercase tracking-widest text-text-muted">Saved Rates ({rates.length})</h3>
                </div>
                {loading ? (
                    <div className="p-8 text-center text-text-muted text-sm">Loading rates...</div>
                ) : rates.length === 0 ? (
                    <div className="p-8 text-center text-text-muted text-sm">No exchange rates saved yet. Add one above.</div>
                ) : (
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-[#17232f]">
                                    <th className="px-6 py-3 text-text-muted font-black text-[10px] uppercase tracking-widest">Date</th>
                                    <th className="px-6 py-3 text-text-muted font-black text-[10px] uppercase tracking-widest">VND → EUR Rate</th>
                                    <th className="px-6 py-3 text-text-muted font-black text-[10px] uppercase tracking-widest">1 EUR =</th>
                                    <th className="px-6 py-3 text-text-muted font-black text-[10px] uppercase tracking-widest">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-dark/50">
                                {rates.map(r => (
                                    <tr key={r.id} className="hover:bg-primary/[0.02] transition-colors">
                                        <td className="px-6 py-3 text-sm text-white font-mono">{new Date(r.date).toLocaleDateString('en-GB')}</td>
                                        <td className="px-6 py-3 text-sm text-emerald-400 font-bold font-mono">{Number(r.vndToEur).toFixed(10)}</td>
                                        <td className="px-6 py-3 text-sm text-text-muted font-mono">₫{Math.round(1 / Number(r.vndToEur)).toLocaleString()}</td>
                                        <td className="px-6 py-3">
                                            <button onClick={() => deleteRate(r.id)} className="text-text-muted hover:text-red-400 transition-colors">
                                                <span className="material-symbols-outlined text-sm">delete</span>
                                            </button>
                                        </td>
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

export default AdsPage;
