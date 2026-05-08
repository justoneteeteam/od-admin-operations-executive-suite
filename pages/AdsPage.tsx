import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { adsCampaignsService, exchangeRatesService, AdsCampaign, DashboardData, ChangeLogEntry, ExchangeRate } from '../src/services/ads-campaigns.service';
import { productsService } from '../src/services/products.service';
import { customersService } from '../src/services/customers.service';

// ─── Types ───────────────────────────────────────────────────────────────────
interface StagedRecord {
    date: string; campaign: string; country: string; platform: string;
    sku: string; stage: string; pic: string; spendVnd: number; notes: string;
    source?: string;
    // Meta Ads fields
    adName?: string; adSetName?: string; cpc?: number; cpm?: number; ctr?: number;
    resultType?: string; costPerResult?: number; metaPurchases?: number;
    reportStart?: string; reportEnd?: string; orderNumber?: string;
    _orderMatched?: boolean; // frontend-only: whether order was found
}

// ═══════════════════════════════════════════════════════════════════════════════
// INPUT TAB
// ═══════════════════════════════════════════════════════════════════════════════

// Vietnamese header keywords for Meta CSV auto-detection
const META_HEADERS = [
    'Tên chiến dịch', 'Số tiền đã chi tiêu', 'Lượt mua',
    'Tên quảng cáo', 'Tên nhóm quảng cáo', 'Chi phí trên mỗi kết quả',
];

// Country mapping from campaign name keywords
const COUNTRY_MAP: Record<string, string> = {
    SPAIN: 'ES', ITALY: 'IT', GERMANY: 'DE', POLAND: 'PL',
    FRANCE: 'FR', PORTUGAL: 'PT', NETHERLANDS: 'NL', BELGIUM: 'BE',
    AUSTRIA: 'AT', CZECH: 'CZ', ROMANIA: 'RO', HUNGARY: 'HU',
};

const inferCountry = (campaign: string): string => {
    const upper = campaign.toUpperCase();
    for (const [keyword, code] of Object.entries(COUNTRY_MAP)) {
        if (upper.includes(keyword)) return code;
    }
    return '';
};

const InputTab: React.FC = () => {
    const [staged, setStaged] = useState<StagedRecord[]>([]);
    const [saving, setSaving] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [isMetaCsv, setIsMetaCsv] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    // Defaults panel
    const [defaults, setDefaults] = useState({ platform: 'Meta', sku: '', stage: '', pic: '' });

    // Manual entry state
    const [manual, setManual] = useState<StagedRecord>({
        date: '', campaign: '', country: '', platform: '', sku: '', stage: '', pic: '', spendVnd: 0, notes: '', source: 'manual'
    });

    const [products, setProducts] = useState<any[]>([]);
    const [countries, setCountries] = useState<string[]>([]);

    useEffect(() => {
        const fetchValidationData = async () => {
            try {
                const [prodsRes, custsRes] = await Promise.all([
                    productsService.getAll(),
                    customersService.getAll()
                ]);
                const prods = Array.isArray(prodsRes) ? prodsRes : (prodsRes.data || []);
                setProducts(prods);

                const custs = Array.isArray(custsRes) ? custsRes : (custsRes.data || []);
                const uniqueCountries = [...new Set(custs.map((c: any) => c.country).filter(Boolean))] as string[];
                setCountries(uniqueCountries);
            } catch (err) {
                console.error("Failed to fetch validation data", err);
            }
        };
        fetchValidationData();
    }, []);

    // Check order existence in batch
    const checkOrderMatches = async (records: StagedRecord[]): Promise<StagedRecord[]> => {
        // Collect all unique individual order numbers (split by ;)
        const allNums = new Set<string>();
        for (const r of records) {
            if (r.orderNumber) {
                for (const num of r.orderNumber.split(';').map(s => s.trim()).filter(Boolean)) {
                    allNums.add(num);
                }
            }
        }
        if (allNums.size === 0) return records;

        try {
            const matchedSet = new Set<string>();
            const apiClient = (await import('../src/services/apiClient')).default;

            // Query each unique order number individually
            for (const num of allNums) {
                try {
                    const resp = await apiClient.get('/orders', { params: { search: num, searchType: 'orderNumber', limit: 1 } });
                    const data = resp.data?.data || resp.data || [];
                    if (Array.isArray(data) && data.length > 0) {
                        matchedSet.add(num);
                    }
                } catch { /* ignore individual lookup errors */ }
            }

            return records.map(r => {
                if (!r.orderNumber) return { ...r, _orderMatched: undefined };
                // Check if ALL order numbers in this record are matched
                const nums = r.orderNumber.split(';').map(s => s.trim()).filter(Boolean);
                const allMatched = nums.length > 0 && nums.every(n => matchedSet.has(n));
                return { ...r, _orderMatched: allMatched };
            });
        } catch {
            return records;
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs' as any);
            const data = await file.arrayBuffer();
            const wb = XLSX.read(data, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const json: any[] = XLSX.utils.sheet_to_json(ws);

            if (json.length === 0) {
                setResult('❌ File is empty or could not be parsed.');
                return;
            }

            // Auto-detect Meta CSV by checking Vietnamese header keywords
            const headers = Object.keys(json[0]);
            const metaMatch = META_HEADERS.filter(h => headers.some(hdr => hdr.includes(h)));
            const isMeta = metaMatch.length >= 2;

            if (isMeta) {
                setIsMetaCsv(true);
                await parseMetaCsv(json);
            } else {
                setIsMetaCsv(false);
                parseGenericCsv(json);
            }
        } catch (err) {
            console.error('File parse error:', err);
            setResult('❌ Failed to parse file. Please check the format.');
        }

        // Reset the file input so the same file can be re-uploaded
        if (fileRef.current) fileRef.current.value = '';
    };

    // ─── META CSV PARSER ──────────────────────────────────────────────────
    const parseMetaCsv = async (json: any[]) => {
        const records: StagedRecord[] = [];

        for (const row of json) {
            const getCol = (keywords: string[]) => {
                const key = Object.keys(row).find(k => keywords.some(kw => k.includes(kw)));
                return key ? row[key] : '';
            };

            const campaign = String(getCol(['Tên chiến dịch']) || '').trim();
            if (!campaign) continue;

            const adName = String(getCol(['Tên quảng cáo']) || '').trim();
            const adSetName = String(getCol(['Tên nhóm quảng cáo']) || '').trim();

            // Numeric parsing — Vietnamese numbers may use comma as decimal separator
            const parseNum = (val: any): number => {
                if (!val && val !== 0) return 0;
                const s = String(val).replace(/\s/g, '').replace(',', '.');
                return parseFloat(s) || 0;
            };

            // Date parsing — handles Excel serial numbers and DD/MM/YYYY formats
            const parseDate = (val: any): string => {
                if (!val && val !== 0) return '';
                if (typeof val === 'number') {
                    // Excel date serial number → JS Date
                    const d = new Date((val - 25569) * 86400 * 1000);
                    return d.toISOString().split('T')[0];
                }
                const s = String(val).trim();
                // Handle DD/MM/YYYY format
                const parts = s.split('/');
                if (parts.length === 3) {
                    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                }
                return s;
            };

            const cpc = parseNum(getCol(['CPC']));
            const cpm = parseNum(getCol(['CPM']));
            const ctr = parseNum(getCol(['CTR']));
            const spendVnd = parseNum(getCol(['Số tiền đã chi tiêu']));
            const resultType = String(getCol(['Loại kết quả']) || '').trim();
            const costPerResult = parseNum(getCol(['Chi phí trên mỗi kết quả']));
            const metaPurchases = parseInt(String(getCol(['Lượt mua']) || '0'), 10) || 0;
            const reportStart = parseDate(getCol(['Bắt đầu báo cáo']));
            const reportEnd = parseDate(getCol(['Kết thúc báo cáo']));
            const rawOrderNum = String(getCol(['Order ID']) || '').trim();
            const orderNumber = rawOrderNum ? rawOrderNum.split(';').map(s => s.trim()).filter(Boolean).join(';') : '';
            const stage = String(getCol(['Stage', 'Giai đoạn']) || '').trim();


            const country = inferCountry(campaign);

            records.push({
                date: reportStart || new Date().toISOString().split('T')[0],
                campaign,
                country: country || defaults.sku ? country : '',
                platform: defaults.platform || 'Meta',
                sku: defaults.sku || '',
                stage: stage || defaults.stage || '',
                pic: defaults.pic || '',
                spendVnd,
                notes: '',
                source: 'meta_upload',
                adName,
                adSetName,
                cpc,
                cpm,
                ctr,
                resultType,
                costPerResult,
                metaPurchases,
                reportStart,
                reportEnd,
                orderNumber: orderNumber || undefined,
            });
        }

        // Batch check order matches
        const matched = await checkOrderMatches(records);
        setStaged(matched);

        const totalSpend = matched.reduce((s, r) => s + r.spendVnd, 0);
        const matchedOrders = matched.filter(r => r._orderMatched).length;
        const countriesDetected = [...new Set(matched.map(r => r.country).filter(Boolean))];

        setResult(`✅ Meta CSV detected — ${matched.length} rows parsed. Total spend: ₫${totalSpend.toLocaleString()} | Orders matched: ${matchedOrders}/${matched.filter(r => r.orderNumber).length} | Countries: ${countriesDetected.join(', ') || 'None'}`);
    };

    // ─── GENERIC CSV PARSER ───────────────────────────────────────────────
    const parseGenericCsv = (json: any[]) => {
        const records: StagedRecord[] = [];
        let invalidSkus = 0;
        let invalidCountries = 0;

        for (const row of json) {
            const getVal = (keys: string[]) => {
                const foundKey = Object.keys(row).find(k => keys.some(search => k.toLowerCase().includes(search.toLowerCase())));
                return foundKey ? row[foundKey] : '';
            };

            let dateStr = '';
            const rawDate = getVal(['date']);
            if (rawDate) {
                if (typeof rawDate === 'number') {
                    const d = new Date((rawDate - 25569) * 86400 * 1000);
                    dateStr = d.toISOString().split('T')[0];
                } else {
                    const parts = String(rawDate).split('/');
                    if (parts.length === 3) {
                        dateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                    } else {
                        dateStr = String(rawDate);
                    }
                }
            }

            const sku = String(getVal(['sku'])).trim();
            const country = String(getVal(['country'])).trim();
            const campaign = String(getVal(['campaign'])).trim();

            if (!campaign || !sku) continue;

            if (products.length > 0 && !products.some(p => p.sku === sku)) {
                invalidSkus++;
                continue;
            }

            if (countries.length > 0 && country && !countries.includes(country)) {
                invalidCountries++;
                continue;
            }

            const rawSpend = getVal(['spend']);
            const spendVnd = rawSpend ? Number(String(rawSpend).replace(/[^0-9]/g, "")) : 0;

            records.push({
                date: dateStr,
                campaign,
                country,
                platform: String(getVal(['platform']) || ''),
                sku,
                stage: String(getVal(['stage']) || ''),
                pic: String(getVal(['pic', 'person']) || ''),
                spendVnd,
                notes: String(getVal(['note']) || ''),
                source: 'upload',
            });
        }

        setStaged(records);
        let resMsg = `✅ Parsed ${records.length} records.`;
        if (invalidSkus > 0 || invalidCountries > 0) {
            resMsg = `⚠️ Parsed ${records.length} records. Skipped: ${invalidSkus} invalid SKUs, ${invalidCountries} invalid countries.`;
        }
        setResult(resMsg);
    };

    // ─── TEMPLATE DOWNLOAD ────────────────────────────────────────────────
    const downloadMetaTemplate = () => {
        const header = 'Tên chiến dịch,Tên quảng cáo,Tên nhóm quảng cáo,Tên nhóm quảng cáo,CPC (tất cả),CPM (Chi phí trên mỗi 1.000 lượt hiển thị),CTR (Tất cả),Số tiền đã chi tiêu (VND),Loại kết quả,Chi phí trên mỗi kết quả,Lượt mua,Bắt đầu báo cáo,Kết thúc báo cáo,Order ID – Match,Stage';
        const rows = [
            'TEST-SPAIN-5ADS-LONG-1203,TEST025,TEST-SET,TEST-SET,3074.67,266589.60,8.67,46120,Lượt mua trên web,46120,1,2026-03-12,2026-03-12,ORD-1234567-ABCDEF,Test',
            'TEST-ITALY-VIDEO-LONG-1203,IT_AD001,IT-SET,IT-SET,2500.00,220000.00,7.50,85000,Lượt mua trên web,85000,2,2026-03-12,2026-03-12,,POC',
            'TEST-GERMANY-IMG-LONG-1203,DE_AD001,DE-SET,DE-SET,,,,,,,0,2026-03-12,2026-03-12,,Win',
        ];
        const csv = [header, ...rows].join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'meta_ads_template.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    const addManualRecord = () => {
        if (!manual.campaign || !manual.date) {
            setResult('❌ Date and Campaign are required.');
            return;
        }

        if (manual.sku && products.length > 0 && !products.some(p => p.sku === manual.sku)) {
            setResult('❌ Invalid - SKU not in the database');
            return;
        }

        setStaged(prev => [...prev, { ...manual, source: 'manual' }]);
        setManual({ date: '', campaign: '', country: '', platform: '', sku: '', stage: '', pic: '', spendVnd: 0, notes: '', source: 'manual' });
        setResult('✅ Record added successfully');
    };

    const removeStaged = (index: number) => {
        setStaged(prev => prev.filter((_, i) => i !== index));
    };

    const saveAll = async () => {
        if (staged.length === 0) return;
        setSaving(true);
        setResult(null);
        try {
            // Apply defaults to records before saving, strip frontend-only fields
            const records = staged.map(r => {
                const { _orderMatched, ...rest } = r;
                return {
                    ...rest,
                    platform: r.platform || defaults.platform,
                    sku: r.sku || defaults.sku || undefined,
                    stage: r.stage || defaults.stage || undefined,
                    pic: r.pic || defaults.pic || undefined,
                };
            });
            const res = await adsCampaignsService.bulkCreate(records as any);
            let msg = `✅ Successfully saved ${res.created} records to database.`;
            if (res.orderMatchedCount !== undefined) {
                msg += ` Orders matched: ${res.orderMatchedCount}.`;
            }
            if (res.unresolvedOrderNumbers?.length > 0) {
                msg += ` ⚠️ Unresolved order IDs: ${res.unresolvedOrderNumbers.join(', ')}`;
            }
            setResult(msg);
            setStaged([]);
            setIsMetaCsv(false);
        } catch (err: any) {
            setResult(`❌ ${err.response?.data?.message || 'Failed to save records.'}`);
        } finally { setSaving(false); }
    };

    // ─── Preview columns differ for Meta vs Generic ───────────────────────
    const previewHeaders = isMetaCsv
        ? ['Campaign', 'Ad Name', 'Country', 'Spend (VND)', 'Purchases', 'Order ID', 'Match', '']
        : ['Date', 'Campaign', 'Country', 'SKU', 'Stage', 'PIC', 'Spend (VND)', ''];

    return (
        <div className="flex flex-col gap-6">
            {/* File Upload + Template Download */}
            <div className="bg-surface-lowest rounded-2xl border border-border-dark p-6">
                <h3 className="text-xs font-black uppercase tracking-widest text-text-muted mb-4">📁 Upload Meta CSV / Excel</h3>
                <div className="flex items-center gap-4 flex-wrap">
                    <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" />
                    <button onClick={() => fileRef.current?.click()}
                        className="px-6 py-3 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary/90 transition-all shadow-lg shadow-primary/20">
                        <span className="material-symbols-outlined mr-2 align-middle" style={{ fontSize: 18 }}>upload_file</span>
                        Choose File
                    </button>
                    <button onClick={downloadMetaTemplate}
                        className="px-5 py-3 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded-xl font-bold text-sm hover:bg-cyan-500/20 transition-all">
                        <span className="material-symbols-outlined mr-2 align-middle" style={{ fontSize: 18 }}>download</span>
                        Download Template
                    </button>
                    <span className="text-text-muted text-sm">Auto-detects Meta CSV (Vietnamese headers) vs generic format</span>
                </div>
            </div>

            {/* Meta Defaults Panel — only shown for Meta uploads or empty state */}
            <div className="bg-surface-lowest rounded-2xl border border-border-dark p-6">
                <h3 className="text-xs font-black uppercase tracking-widest text-text-muted mb-4">⚙️ Upload Defaults (applied to all rows)</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">Platform</label>
                        <input value={defaults.platform} onChange={e => setDefaults(d => ({ ...d, platform: e.target.value }))}
                            className="bg-surface-high border border-border-dark rounded-lg px-3 py-2.5 text-on-surface text-sm" placeholder="e.g. Meta" />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">Default SKU</label>
                        <select value={defaults.sku} onChange={e => setDefaults(d => ({ ...d, sku: e.target.value }))}
                            className="bg-surface-high border border-border-dark rounded-lg px-3 py-2.5 text-on-surface text-sm appearance-none cursor-pointer">
                            <option value="">— None —</option>
                            {products.map(p => <option key={p.sku} value={p.sku}>{p.sku} — {p.name}</option>)}
                        </select>
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">Stage</label>
                        <select value={defaults.stage} onChange={e => setDefaults(d => ({ ...d, stage: e.target.value }))}
                            className="bg-surface-high border border-border-dark rounded-lg px-3 py-2.5 text-on-surface text-sm appearance-none cursor-pointer">
                            <option value="">— None —</option>
                            <option>Test</option><option>POC</option><option>Win</option><option>Scale</option>
                        </select>
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">PIC</label>
                        <input value={defaults.pic} onChange={e => setDefaults(d => ({ ...d, pic: e.target.value }))}
                            className="bg-surface-high border border-border-dark rounded-lg px-3 py-2.5 text-on-surface text-sm" placeholder="e.g. Thanh Long" />
                    </div>
                </div>
            </div>

            {/* Manual Entry */}
            <div className="bg-surface-lowest rounded-2xl border border-border-dark p-6">
                <h3 className="text-xs font-black uppercase tracking-widest text-text-muted mb-4">✍️ Manual Entry</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <input type="date" value={manual.date} onChange={e => setManual(m => ({ ...m, date: e.target.value }))}
                        className="bg-surface-high border border-border-dark rounded-lg px-3 py-2.5 text-on-surface text-sm" placeholder="Date" />
                    <input value={manual.campaign} onChange={e => setManual(m => ({ ...m, campaign: e.target.value }))}
                        className="bg-surface-high border border-border-dark rounded-lg px-3 py-2.5 text-on-surface text-sm" placeholder="Campaign Name" />
                    <select value={manual.country} onChange={e => setManual(m => ({ ...m, country: e.target.value }))}
                        className="bg-surface-high border border-border-dark rounded-lg px-3 py-2.5 text-on-surface text-sm appearance-none cursor-pointer">
                        <option value="">Country</option>
                        {countries.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input value={manual.sku} onChange={e => setManual(m => ({ ...m, sku: e.target.value }))}
                        className="bg-surface-high border border-border-dark rounded-lg px-3 py-2.5 text-on-surface text-sm" placeholder="SKU (optional)" />
                    <input value={manual.platform} onChange={e => setManual(m => ({ ...m, platform: e.target.value }))}
                        className="bg-surface-high border border-border-dark rounded-lg px-3 py-2.5 text-on-surface text-sm" placeholder="Platform" />
                    <select value={manual.stage} onChange={e => setManual(m => ({ ...m, stage: e.target.value }))}
                        className="bg-surface-high border border-border-dark rounded-lg px-3 py-2.5 text-on-surface text-sm appearance-none cursor-pointer">
                        <option value="">Stage</option>
                        <option>Test</option><option>POC</option><option>Win</option><option>Scale</option>
                    </select>
                    <input value={manual.pic} onChange={e => setManual(m => ({ ...m, pic: e.target.value }))}
                        className="bg-surface-high border border-border-dark rounded-lg px-3 py-2.5 text-on-surface text-sm" placeholder="PIC" />
                    <input type="number" value={manual.spendVnd || ''} onChange={e => setManual(m => ({ ...m, spendVnd: Number(e.target.value) }))}
                        className="bg-surface-high border border-border-dark rounded-lg px-3 py-2.5 text-on-surface text-sm" placeholder="Spend (VND)" />
                </div>
                <button onClick={addManualRecord}
                    className="mt-4 px-5 py-2.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-sm font-bold hover:bg-emerald-500/20 transition-all">
                    + Add Record
                </button>
            </div>

            {/* Result Message */}
            {result && (
                <div className={`px-5 py-3 rounded-xl text-sm font-medium ${result.startsWith('✅') ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : result.startsWith('❌') ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                    {result}
                </div>
            )}

            {/* Staged Records Preview */}
            {staged.length > 0 && (
                <div className="bg-surface-lowest rounded-2xl border border-border-dark overflow-hidden">
                    <div className="px-6 py-4 border-b border-border-dark bg-surface-low flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <h3 className="text-xs font-black uppercase tracking-widest text-text-muted">
                                Preview ({staged.length} staged records)
                            </h3>
                            {isMetaCsv && (
                                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                    META CSV
                                </span>
                            )}
                        </div>
                        <button onClick={saveAll} disabled={saving}
                            className="px-5 py-2 bg-primary text-white rounded-lg font-bold text-sm hover:bg-primary/90 disabled:opacity-50 transition-all shadow-lg shadow-primary/20">
                            {saving ? 'Saving...' : `💾 Save All (${staged.length})`}
                        </button>
                    </div>
                    <div className="overflow-x-auto custom-scrollbar max-h-[500px] overflow-y-auto">
                        <table className="w-full text-left border-collapse min-w-[900px]">
                            <thead className="sticky top-0 bg-surface-container">
                                <tr>
                                    {previewHeaders.map(h => (
                                        <th key={h} className="px-4 py-3 text-text-muted font-black text-[10px] uppercase tracking-widest">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-dark/50">
                                {staged.map((r, i) => (
                                    <tr key={i} className="hover:bg-primary/[0.02]">
                                        {isMetaCsv ? (
                                            <>
                                                <td className="px-4 py-2.5 text-xs text-on-surface font-bold max-w-[220px] truncate" title={r.campaign}>{r.campaign}</td>
                                                <td className="px-4 py-2.5 text-xs text-text-muted max-w-[150px] truncate" title={r.adName}>{r.adName || '—'}</td>
                                                <td className="px-4 py-2.5">
                                                    {r.country ? (
                                                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">{r.country}</span>
                                                    ) : <span className="text-text-muted text-xs">—</span>}
                                                </td>
                                                <td className="px-4 py-2.5 text-xs text-on-surface font-bold">₫{r.spendVnd.toLocaleString()}</td>
                                                <td className="px-4 py-2.5 text-xs text-on-surface font-bold">{r.metaPurchases || 0}</td>
                                                <td className="px-4 py-2.5 text-xs text-primary font-mono">{r.orderNumber || '—'}</td>
                                                <td className="px-4 py-2.5">
                                                    {r.orderNumber ? (
                                                        r._orderMatched ? (
                                                            <span className="text-[11px] font-black text-emerald-400">✅</span>
                                                        ) : (
                                                            <span className="text-[11px] font-black text-red-400" title="Order not found">❌</span>
                                                        )
                                                    ) : <span className="text-text-muted text-xs">—</span>}
                                                </td>
                                                <td className="px-4 py-2.5">
                                                    <button onClick={() => removeStaged(i)} className="text-red-400 hover:text-red-300">
                                                        <span className="material-symbols-outlined text-sm">close</span>
                                                    </button>
                                                </td>
                                            </>
                                        ) : (
                                            <>
                                                <td className="px-4 py-2.5 text-xs text-on-surface font-mono">{r.date}</td>
                                                <td className="px-4 py-2.5 text-xs text-on-surface font-bold max-w-[180px] truncate">{r.campaign}</td>
                                                <td className="px-4 py-2.5 text-xs text-text-muted uppercase font-bold">{r.country}</td>
                                                <td className="px-4 py-2.5 text-xs text-primary font-mono">{r.sku}</td>
                                                <td className="px-4 py-2.5 text-xs text-text-muted">{r.stage}</td>
                                                <td className="px-4 py-2.5 text-xs text-text-muted">{r.pic}</td>
                                                <td className="px-4 py-2.5 text-xs text-on-surface font-bold">₫{r.spendVnd.toLocaleString()}</td>
                                                <td className="px-4 py-2.5">
                                                    <button onClick={() => removeStaged(i)} className="text-red-400 hover:text-red-300">
                                                        <span className="material-symbols-outlined text-sm">close</span>
                                                    </button>
                                                </td>
                                            </>
                                        )}
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
// DASHBOARD TAB
// ═══════════════════════════════════════════════════════════════════════════════
const DashboardTab: React.FC = () => {
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [countryFilter, setCountryFilter] = useState('');
    const [stageFilter, setStageFilter] = useState('');
    const [skuFilter, setSkuFilter] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [dateRangePreset, setDateRangePreset] = useState('All Time');
    const [currency, setCurrency] = useState<'EUR' | 'VND'>('EUR');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [deleting, setDeleting] = useState(false);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const toggleExpand = (key: string) => setExpandedRows(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    });

    const [dbProducts, setDbProducts] = useState<any[]>([]);
    const [dbCountries, setDbCountries] = useState<string[]>([]);

    useEffect(() => {
        const fetchFilters = async () => {
            try {
                const [prodsRes, custsRes] = await Promise.all([
                    productsService.getAll(),
                    customersService.getAll()
                ]);
                const prods = Array.isArray(prodsRes) ? prodsRes : (prodsRes.data || []);
                setDbProducts(prods);
                const custs = Array.isArray(custsRes) ? custsRes : (custsRes.data || []);
                const uniqueCountries = [...new Set(custs.map((c: any) => c.country).filter(Boolean))] as string[];
                setDbCountries(uniqueCountries);
            } catch (err) { console.error("Failed to fetch filter options", err); }
        };
        fetchFilters();
    }, []);

    const handlePresetChange = (preset: string) => {
        setDateRangePreset(preset);
        const today = new Date();
        const formatDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        switch (preset) {
            case 'Today': setStartDate(formatDate(today)); setEndDate(formatDate(today)); break;
            case 'Yesterday': { const y = new Date(today); y.setDate(y.getDate() - 1); setStartDate(formatDate(y)); setEndDate(formatDate(y)); break; }
            case 'Last 7 days': { const d = new Date(today); d.setDate(d.getDate() - 7); setStartDate(formatDate(d)); setEndDate(formatDate(today)); break; }
            case 'This month': { setStartDate(formatDate(new Date(today.getFullYear(), today.getMonth(), 1))); setEndDate(formatDate(today)); break; }
            case 'Last month': { setStartDate(formatDate(new Date(today.getFullYear(), today.getMonth() - 1, 1))); setEndDate(formatDate(new Date(today.getFullYear(), today.getMonth(), 0))); break; }
            case 'All Time': setStartDate(''); setEndDate(''); break;
        }
    };

    const fetchDashboard = async () => {
        setLoading(true);
        try {
            const params: any = {};
            if (countryFilter) params.country = countryFilter;
            if (stageFilter) params.stage = stageFilter;
            if (skuFilter) params.sku = skuFilter;
            if (startDate) params.startDate = startDate;
            if (endDate) params.endDate = endDate;
            const result = await adsCampaignsService.getDashboard(params);
            setData(result);
        } catch (err) { console.error('Dashboard fetch error:', err); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchDashboard(); }, [countryFilter, stageFilter, skuFilter, startDate, endDate]);

    if (loading) return <div className="text-text-muted text-sm py-12 text-center">Loading dashboard...</div>;
    if (!data) return <div className="text-red-400 text-sm py-12 text-center">Failed to load dashboard data.</div>;

    const k = data.kpis;
    const kpis = [
        { label: 'Total Spend', value: currency === 'EUR' ? `€${k.totalSpendEur.toLocaleString()}` : `₫${k.totalSpendVnd.toLocaleString()}`, icon: 'payments', color: 'text-blue-400', border: 'border-l-blue-500' },
        { label: 'Leads', value: k.totalLeads.toLocaleString(), icon: 'group', color: 'text-indigo-400', border: 'border-l-indigo-500' },
        { label: 'Confirmed Leads', value: (k.totalConfirmedLeads || 0).toLocaleString(), icon: 'verified', color: 'text-teal-400', border: 'border-l-teal-500' },
        { label: 'Orders', value: k.totalOrders.toLocaleString(), icon: 'package_2', color: 'text-pink-400', border: 'border-l-pink-500' },
        { label: 'Revenue', value: `€${k.totalRevenue.toLocaleString()}`, icon: 'trending_up', color: 'text-emerald-400', border: 'border-l-emerald-500' },
        { label: 'CPL', value: `€${k.cpl.toLocaleString()}`, icon: 'person_add', color: 'text-cyan-400', border: 'border-l-cyan-500' },
        { label: 'CPO', value: `€${k.cpo.toLocaleString()}`, icon: 'shopping_cart', color: 'text-purple-400', border: 'border-l-purple-500' },
        { label: 'CVR', value: `${k.cvr}%`, icon: 'percent', color: 'text-amber-400', border: 'border-l-amber-500' },
        { label: 'ROAS', value: `${k.roas}x`, icon: 'speed', color: k.roas >= 2 ? 'text-emerald-400' : 'text-amber-400', border: k.roas >= 2 ? 'border-l-emerald-500' : 'border-l-amber-500' },
    ];

    const filterCountries = dbCountries.length > 0 ? dbCountries : [...new Set(data.campaigns.map(c => c.country).filter(Boolean))] as string[];
    const filterSkus = dbProducts.length > 0 ? dbProducts.map(p => p.sku) : [...new Set(data.campaigns.map(c => c.sku).filter(Boolean))] as string[];
    const stages = [...new Set(data.campaigns.map(c => c.stage).filter(Boolean))] as string[];

    return (
        <div className="flex flex-col gap-6">
            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-end">
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">Country</label>
                    <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)} className="bg-surface-lowest border border-border-dark rounded-lg px-3 py-2 text-on-surface text-sm appearance-none cursor-pointer min-w-[120px]"><option value="">All</option>{filterCountries.map(c => <option key={c} value={c}>{c}</option>)}</select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">Stage</label>
                    <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} className="bg-surface-lowest border border-border-dark rounded-lg px-3 py-2 text-on-surface text-sm appearance-none cursor-pointer min-w-[120px]"><option value="">All</option>{stages.map(s => <option key={s} value={s}>{s}</option>)}</select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">SKU</label>
                    <select value={skuFilter} onChange={e => setSkuFilter(e.target.value)} className="bg-surface-lowest border border-border-dark rounded-lg px-3 py-2 text-on-surface text-sm appearance-none cursor-pointer min-w-[120px]"><option value="">All</option>{filterSkus.map(s => <option key={s} value={s}>{s}</option>)}</select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">Date Range</label>
                    <select value={dateRangePreset} onChange={e => handlePresetChange(e.target.value)} className="bg-surface-lowest border border-border-dark rounded-lg px-3 py-2 text-on-surface text-sm appearance-none cursor-pointer min-w-[140px]">
                        <option value="All Time">All Time</option><option value="Today">Today</option><option value="Yesterday">Yesterday</option><option value="Last 7 days">Last 7 days</option><option value="This month">This month</option><option value="Last month">Last month</option><option value="Custom">Custom range</option>
                    </select>
                </div>
                {dateRangePreset === 'Custom' && (
                    <>
                        <div className="flex flex-col gap-1"><label className="text-[10px] font-black text-text-muted uppercase tracking-widest">From</label><input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setDateRangePreset('Custom'); }} className="bg-surface-lowest border border-border-dark rounded-lg px-3 py-2 text-on-surface text-sm" /></div>
                        <div className="flex flex-col gap-1"><label className="text-[10px] font-black text-text-muted uppercase tracking-widest">To</label><input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setDateRangePreset('Custom'); }} className="bg-surface-lowest border border-border-dark rounded-lg px-3 py-2 text-on-surface text-sm" /></div>
                    </>
                )}
                <button onClick={() => setCurrency(c => c === 'EUR' ? 'VND' : 'EUR')} className="h-[38px] px-4 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 text-sm font-bold hover:bg-amber-500/20 transition-all">{currency === 'EUR' ? '€ EUR' : '₫ VND'}</button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {kpis.map((kpi, i) => (
                    <div key={i} className={`bg-surface-lowest p-5 rounded-2xl border border-border-dark border-l-4 ${kpi.border} relative overflow-hidden group hover:shadow-lg transition-shadow`}>
                        <div className="absolute -right-2 -bottom-2 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity"><span className="material-symbols-outlined text-[80px]">{kpi.icon}</span></div>
                        <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em]">{kpi.label}</p>
                        <h3 className={`text-2xl font-black tracking-tight mt-2 ${kpi.color}`}>{kpi.value}</h3>
                    </div>
                ))}
            </div>

            {/* Chart */}
            {data.chartData.length > 0 && (
                <div className="bg-surface-lowest rounded-2xl border border-border-dark p-6">
                    <h3 className="text-xs font-black uppercase tracking-widest text-text-muted mb-6">Spend vs Revenue Trend</h3>
                    <ResponsiveContainer width="100%" height={280}>
                        <AreaChart data={data.chartData}>
                            <defs>
                                <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
                                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#233648" />
                            <XAxis dataKey="date" tick={{ fill: '#9CA3AF', fontSize: 10 }} />
                            <YAxis tick={{ fill: '#9CA3AF', fontSize: 10 }} />
                            <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #c3c6d7', borderRadius: 12, fontSize: 12 }} />
                            <Area type="monotone" dataKey="spendEur" stroke="#3b82f6" fill="url(#spendGrad)" strokeWidth={2} name="Spend (EUR)" />
                            <Area type="monotone" dataKey="revenue" stroke="#10b981" fill="url(#revGrad)" strokeWidth={2} name="Revenue (EUR)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Campaign Breakdown — Hierarchical View */}
            {(() => {
                // Group campaigns: Campaign → Ad Set → Ads
                const campaignGroups = new Map<string, { campaigns: any[]; country: string; sku: string; stage: string; }>();
                for (const c of data.campaigns as any[]) {
                    const key = c.campaign;
                    if (!campaignGroups.has(key)) {
                        campaignGroups.set(key, { campaigns: [], country: c.country || '', sku: c.sku || '', stage: c.stage || '' });
                    }
                    campaignGroups.get(key)!.campaigns.push(c);
                }

                // Build ad-set groups within each campaign
                const buildAdSetGroups = (rows: any[]) => {
                    const groups = new Map<string, any[]>();
                    for (const r of rows) {
                        const adSet = r.adName || r.adSetName || '(no ad)';
                        if (!groups.has(adSet)) groups.set(adSet, []);
                        groups.get(adSet)!.push(r);
                    }
                    return groups;
                };

                // Aggregate metrics for a group of rows
                const agg = (rows: any[]) => ({
                    spendEur: rows.reduce((s, c) => s + (c.spendEur || 0), 0),
                    revenueEur: rows.reduce((s, c) => s + (c.revenueEur || 0), 0),
                    leads: rows.reduce((s, c) => s + (c.leads || 0), 0),
                    confirmedLeads: rows.reduce((s, c) => s + (c.confirmedLeads || 0), 0),
                    orders: rows.reduce((s, c) => s + (c.orders || 0), 0),
                    matchedOrderDetails: rows.flatMap(c => c.matchedOrderDetails || []),
                    ids: rows.map(c => c.id),
                });

                return (
                <div className="bg-surface-lowest rounded-2xl border border-border-dark overflow-hidden">
                <div className="px-6 py-4 border-b border-border-dark bg-surface-low flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase tracking-widest text-text-muted">Campaign Breakdown ({data.campaigns.length} records · {campaignGroups.size} campaigns)</h3>
                    {selectedIds.size > 0 && (
                        <div className="flex items-center gap-3">
                            <span className="text-xs text-amber-400 font-bold">{selectedIds.size} selected</span>
                            <button
                                onClick={async () => {
                                    if (!confirm(`Delete ${selectedIds.size} selected records?`)) return;
                                    setDeleting(true);
                                    try {
                                        await adsCampaignsService.bulkDelete([...selectedIds]);
                                        setSelectedIds(new Set());
                                        fetchDashboard();
                                    } catch (err) { console.error('Bulk delete error:', err); }
                                    finally { setDeleting(false); }
                                }}
                                disabled={deleting}
                                className="px-3 py-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-xs font-bold hover:bg-red-500/30 transition-colors disabled:opacity-50"
                            >
                                {deleting ? 'Deleting...' : `🗑 Delete (${selectedIds.size})`}
                            </button>
                        </div>
                    )}
                </div>
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse min-w-[1300px]">
                        <thead><tr className="bg-surface-container">
                            <th className="px-3 py-3 w-10">
                                <input
                                    type="checkbox"
                                    className="accent-primary w-4 h-4 cursor-pointer"
                                    checked={data.campaigns.length > 0 && selectedIds.size === data.campaigns.length}
                                    onChange={e => {
                                        if (e.target.checked) {
                                            setSelectedIds(new Set(data.campaigns.map((c: any) => c.id)));
                                        } else {
                                            setSelectedIds(new Set());
                                        }
                                    }}
                                />
                            </th>
                            {['Campaign / Ad', 'Country', 'Stage', 'Spend (EUR)', 'Revenue', 'Leads', 'Confirmed', 'Orders', 'ROAS', 'CPO', 'CVR'].map(h => (<th key={h} className="px-4 py-3 text-text-muted font-black text-[10px] uppercase tracking-widest">{h}</th>))}
                        </tr></thead>
                        <tbody className="divide-y divide-border-dark/50">
                            {[...campaignGroups.entries()].map(([campaignName, group]) => {
                                const a = agg(group.campaigns);
                                const roas = a.spendEur > 0 ? a.revenueEur / a.spendEur : 0;
                                const cpo = a.orders > 0 ? a.spendEur / a.orders : 0;
                                const cvr = a.leads > 0 ? (a.orders / a.leads) * 100 : 0;
                                const isExpanded = expandedRows.has(campaignName);
                                const adSetGroups = buildAdSetGroups(group.campaigns);
                                const hasMultipleAds = group.campaigns.length > 1;

                                return (
                                <React.Fragment key={campaignName}>
                                {/* ── Campaign Row (aggregated) ── */}
                                <tr className={`hover:bg-primary/[0.03] transition-colors ${hasMultipleAds ? 'cursor-pointer' : ''} ${a.ids.some((id: string) => selectedIds.has(id)) ? 'bg-primary/[0.05]' : ''}`}
                                    onClick={() => hasMultipleAds && toggleExpand(campaignName)}>
                                    <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                                        <input type="checkbox" className="accent-primary w-4 h-4 cursor-pointer"
                                            checked={a.ids.every((id: string) => selectedIds.has(id))}
                                            onChange={e => {
                                                const next = new Set(selectedIds);
                                                if (e.target.checked) a.ids.forEach((id: string) => next.add(id));
                                                else a.ids.forEach((id: string) => next.delete(id));
                                                setSelectedIds(next);
                                            }} />
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            {hasMultipleAds && (
                                                <span className={`material-symbols-outlined text-[14px] text-text-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`}>chevron_right</span>
                                            )}
                                            <span className="text-xs text-on-surface font-bold">{campaignName}</span>
                                            {hasMultipleAds && (
                                                <span className="text-[9px] font-bold text-text-muted bg-white/5 px-1.5 py-0.5 rounded-full">{group.campaigns.length} ads</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3"><span className="text-[10px] font-black text-text-muted uppercase tracking-widest">{group.country || '—'}</span></td>
                                    <td className="px-4 py-3"><span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${group.stage === 'Win' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : group.stage === 'Scale' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : group.stage === 'POC' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : group.stage === 'Test' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : 'bg-gray-500/10 text-on-surface-variant border-gray-500/20'}`}>{group.stage || '—'}</span></td>
                                    <td className="px-4 py-3 text-xs font-black text-on-surface">€{Math.round(a.spendEur * 100) / 100}</td>
                                    <td className="px-4 py-3 text-xs font-black text-emerald-400">€{Math.round(a.revenueEur * 100) / 100}</td>
                                    <td className="px-4 py-3 text-xs font-bold text-on-surface">{a.leads}</td>
                                    <td className="px-4 py-3 text-xs font-bold text-teal-400">{a.confirmedLeads}</td>
                                    <td className="px-4 py-3 text-xs font-bold text-on-surface">{a.orders}</td>
                                    <td className="px-4 py-3 text-xs font-black"><span className={roas >= 2 ? 'text-emerald-400' : roas >= 1 ? 'text-amber-400' : 'text-red-400'}>{roas.toFixed(2)}x</span></td>
                                    <td className="px-4 py-3 text-xs font-bold text-on-surface">€{cpo.toFixed(2)}</td>
                                    <td className="px-4 py-3 text-xs font-bold text-on-surface">{cvr.toFixed(1)}%</td>
                                </tr>

                                {/* ── Expanded: Ad-level rows ── */}
                                {isExpanded && [...adSetGroups.entries()].map(([adName, adRows]) => {
                                    const adAgg = agg(adRows);
                                    const adRoas = adAgg.spendEur > 0 ? adAgg.revenueEur / adAgg.spendEur : 0;
                                    const adCpo = adAgg.orders > 0 ? adAgg.spendEur / adAgg.orders : 0;
                                    const adCvr = adAgg.leads > 0 ? (adAgg.orders / adAgg.leads) * 100 : 0;
                                    const dateRange = adRows.length > 1
                                        ? `${new Date(adRows[adRows.length-1].date).toLocaleDateString('en-GB')} – ${new Date(adRows[0].date).toLocaleDateString('en-GB')}`
                                        : new Date(adRows[0].date).toLocaleDateString('en-GB');
                                    const isAdExpanded = expandedRows.has(`${campaignName}::${adName}`);

                                    return (
                                    <React.Fragment key={adName}>
                                    <tr className="bg-[#0f1923] hover:bg-[#132233] transition-colors cursor-pointer"
                                        onClick={() => toggleExpand(`${campaignName}::${adName}`)}>
                                        <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                                            <input type="checkbox" className="accent-primary w-3.5 h-3.5 cursor-pointer"
                                                checked={adAgg.ids.every((id: string) => selectedIds.has(id))}
                                                onChange={e => {
                                                    const next = new Set(selectedIds);
                                                    if (e.target.checked) adAgg.ids.forEach((id: string) => next.add(id));
                                                    else adAgg.ids.forEach((id: string) => next.delete(id));
                                                    setSelectedIds(next);
                                                }} />
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center gap-2 pl-6">
                                                {adAgg.matchedOrderDetails.length > 0 && (
                                                    <span className={`material-symbols-outlined text-[12px] text-text-muted transition-transform ${isAdExpanded ? 'rotate-90' : ''}`}>chevron_right</span>
                                                )}
                                                <span className="text-[11px] text-cyan-400 font-bold font-mono">{adName}</span>
                                                <span className="text-[9px] text-text-muted/60">{dateRange}</span>
                                                {adRows.length > 1 && <span className="text-[9px] text-text-muted bg-white/5 px-1.5 py-0.5 rounded-full">{adRows.length} rows</span>}
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5"><span className="text-[10px] text-text-muted/60 uppercase">{group.country || '—'}</span></td>
                                        <td className="px-4 py-2.5"></td>
                                        <td className="px-4 py-2.5 text-[11px] font-bold text-on-surface/80">€{(Math.round(adAgg.spendEur * 100) / 100).toLocaleString()}</td>
                                        <td className="px-4 py-2.5 text-[11px] font-bold text-emerald-400/80">€{(Math.round(adAgg.revenueEur * 100) / 100).toLocaleString()}</td>
                                        <td className="px-4 py-2.5 text-[11px] font-bold text-on-surface/80">{adAgg.leads}</td>
                                        <td className="px-4 py-2.5 text-[11px] font-bold text-teal-400/80">{adAgg.confirmedLeads}</td>
                                        <td className="px-4 py-2.5 text-[11px] font-bold text-on-surface/80">{adAgg.orders}</td>
                                        <td className="px-4 py-2.5 text-[11px] font-black"><span className={adRoas >= 2 ? 'text-emerald-400/80' : adRoas >= 1 ? 'text-amber-400/80' : 'text-red-400/80'}>{adRoas.toFixed(2)}x</span></td>
                                        <td className="px-4 py-2.5 text-[11px] font-bold text-on-surface/80">€{adCpo.toFixed(2)}</td>
                                        <td className="px-4 py-2.5 text-[11px] font-bold text-on-surface/80">{adCvr.toFixed(1)}%</td>
                                    </tr>
                                    {/* Ad-level order match details */}
                                    {isAdExpanded && adAgg.matchedOrderDetails.length > 0 && (
                                        <tr>
                                            <td colSpan={12} className="bg-[#0a1218] px-6 py-3 border-t border-border-dark/20">
                                                <div className="pl-10">
                                                    <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-2">📎 Matched Orders ({adAgg.matchedOrderDetails.length})</p>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5">
                                                        {adAgg.matchedOrderDetails.map((o: any, j: number) => (
                                                            <div key={j} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-lowest border border-border-dark/40">
                                                                <span className="text-[11px] font-mono text-primary font-bold">{o.orderNumber}</span>
                                                                <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full border ${
                                                                    o.confirmationStatus === 'Confirmed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                                    o.confirmationStatus === 'No Answer' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                                                    o.confirmationStatus === 'Call Center' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                                                    'bg-gray-500/10 text-on-surface-variant border-gray-500/20'
                                                                }`}>{o.confirmationStatus || 'Pending'}</span>
                                                                <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full border ${
                                                                    o.orderStatus === 'Delivered' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                                    'bg-gray-500/10 text-on-surface-variant border-gray-500/20'
                                                                }`}>{o.orderStatus || 'Pending'}</span>
                                                                <span className="text-[10px] text-text-muted ml-auto">€{(o.totalAmount || 0).toFixed(2)}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                    </React.Fragment>
                                    );
                                })}

                                {/* Single-ad campaign (no children) — show order details directly */}
                                {!hasMultipleAds && isExpanded && a.matchedOrderDetails.length > 0 && (
                                    <tr>
                                        <td colSpan={12} className="bg-[#0f1923] px-6 py-3 border-t border-border-dark/30">
                                            <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-2">📎 Matched Orders ({a.matchedOrderDetails.length})</p>
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5">
                                                {a.matchedOrderDetails.map((o: any, j: number) => (
                                                    <div key={j} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-lowest border border-border-dark/40">
                                                        <span className="text-[11px] font-mono text-primary font-bold">{o.orderNumber}</span>
                                                        <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full border ${
                                                            o.confirmationStatus === 'Confirmed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                            o.confirmationStatus === 'No Answer' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                                            o.confirmationStatus === 'Call Center' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                                            'bg-gray-500/10 text-on-surface-variant border-gray-500/20'
                                                        }`}>{o.confirmationStatus || 'Pending'}</span>
                                                        <span className="text-[10px] text-text-muted ml-auto">€{(o.totalAmount || 0).toFixed(2)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                                </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
                );
            })()}
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
        (r.sku || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.country || '').toLowerCase().includes(search.toLowerCase())
    );

    if (loading) return <div className="text-text-muted text-sm py-12 text-center">Loading records...</div>;

    return (
        <div className="flex flex-col gap-4">
            <div className="flex gap-4 items-center">
                <div className="relative flex-1 max-w-md">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-[18px]">search</span>
                    <input value={search} onChange={e => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-surface-lowest border border-border-dark rounded-xl text-on-surface text-sm placeholder:text-text-muted/50 focus:ring-2 focus:ring-primary/50"
                        placeholder="Search campaigns, SKU, country..." />
                </div>
            </div>

            {saveResult && (
                <div className={`px-5 py-3 rounded-xl text-sm font-medium ${saveResult.startsWith('✅') ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                    {saveResult}
                </div>
            )}

            <div className="bg-surface-lowest rounded-2xl border border-border-dark overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse min-w-[1100px]">
                        <thead>
                            <tr className="bg-surface-container">
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
                                                <td className="px-4 py-2"><input type="date" value={editData.date?.toString().split('T')[0] || ''} onChange={e => setEditData(d => ({ ...d, date: e.target.value }))} className="bg-surface-high border border-border-dark rounded px-2 py-1 text-on-surface text-xs w-full" /></td>
                                                <td className="px-4 py-2"><input value={editData.campaign || ''} onChange={e => setEditData(d => ({ ...d, campaign: e.target.value }))} className="bg-surface-high border border-border-dark rounded px-2 py-1 text-on-surface text-xs w-full" /></td>
                                                <td className="px-4 py-2"><input value={editData.country || ''} onChange={e => setEditData(d => ({ ...d, country: e.target.value }))} className="bg-surface-high border border-border-dark rounded px-2 py-1 text-on-surface text-xs w-full max-w-[60px]" /></td>
                                                <td className="px-4 py-2"><input value={editData.sku || ''} onChange={e => setEditData(d => ({ ...d, sku: e.target.value }))} className="bg-surface-high border border-border-dark rounded px-2 py-1 text-on-surface text-xs w-full" /></td>
                                                <td className="px-4 py-2">
                                                    <select value={editData.stage || ''} onChange={e => setEditData(d => ({ ...d, stage: e.target.value }))} className="bg-surface-high border border-border-dark rounded px-2 py-1 text-on-surface text-xs w-full appearance-none">
                                                        <option value="">—</option><option>Test</option><option>POC</option><option>Win</option><option>Scale</option>
                                                    </select>
                                                </td>
                                                <td className="px-4 py-2"><input value={editData.pic || ''} onChange={e => setEditData(d => ({ ...d, pic: e.target.value }))} className="bg-surface-high border border-border-dark rounded px-2 py-1 text-on-surface text-xs w-full" /></td>
                                                <td className="px-4 py-2"><input type="number" value={editData.spendVnd || ''} onChange={e => setEditData(d => ({ ...d, spendVnd: Number(e.target.value) }))} className="bg-surface-high border border-border-dark rounded px-2 py-1 text-on-surface text-xs w-full" /></td>
                                                <td className="px-4 py-2 flex gap-2">
                                                    <button onClick={saveEdit} className="text-emerald-400 hover:text-emerald-300"><span className="material-symbols-outlined text-sm">check</span></button>
                                                    <button onClick={cancelEdit} className="text-red-400 hover:text-red-300"><span className="material-symbols-outlined text-sm">close</span></button>
                                                </td>
                                            </>
                                        ) : (
                                            <>
                                                <td className="px-4 py-3 text-xs text-on-surface font-mono">{new Date(r.date).toLocaleDateString('en-GB')}</td>
                                                <td className="px-4 py-3 text-xs text-on-surface font-bold max-w-[200px] truncate">{r.campaign}</td>
                                                <td className="px-4 py-3 text-xs text-text-muted uppercase font-bold">{r.country || '—'}</td>
                                                <td className="px-4 py-3 text-xs text-primary font-mono">{r.sku}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${r.stage === 'Win' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : r.stage === 'Scale' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : r.stage === 'POC' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-gray-500/10 text-on-surface-variant border-gray-500/20'}`}>
                                                        {r.stage || '—'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-xs text-text-muted">{r.pic || '—'}</td>
                                                <td className="px-4 py-3 text-xs text-on-surface font-bold">₫{Number(r.spendVnd).toLocaleString()}</td>
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
                                                            <span className="text-on-surface font-bold">{log.fieldName}:</span>
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
            <div className="bg-surface-lowest rounded-2xl border border-border-dark p-6">
                <h3 className="text-xs font-black uppercase tracking-widest text-text-muted mb-4">💱 Add / Update Exchange Rate (VND → EUR)</h3>
                <div className="flex gap-4 items-end flex-wrap">
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-black text-text-muted uppercase">Date</label>
                        <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                            className="bg-surface-high border border-border-dark rounded-lg px-3 py-2.5 text-on-surface text-sm" />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-black text-text-muted uppercase">Rate (VND → EUR)</label>
                        <input type="text" value={newRate} onChange={e => setNewRate(e.target.value)}
                            className="bg-surface-high border border-border-dark rounded-lg px-3 py-2.5 text-on-surface text-sm w-48"
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
            <div className="bg-surface-lowest rounded-2xl border border-border-dark overflow-hidden">
                <div className="px-6 py-4 border-b border-border-dark bg-surface-low">
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
                                <tr className="bg-surface-container">
                                    <th className="px-6 py-3 text-text-muted font-black text-[10px] uppercase tracking-widest">Date</th>
                                    <th className="px-6 py-3 text-text-muted font-black text-[10px] uppercase tracking-widest">VND → EUR Rate</th>
                                    <th className="px-6 py-3 text-text-muted font-black text-[10px] uppercase tracking-widest">1 EUR =</th>
                                    <th className="px-6 py-3 text-text-muted font-black text-[10px] uppercase tracking-widest">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-dark/50">
                                {rates.map(r => (
                                    <tr key={r.id} className="hover:bg-primary/[0.02] transition-colors">
                                        <td className="px-6 py-3 text-sm text-on-surface font-mono">{new Date(r.date).toLocaleDateString('en-GB')}</td>
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
                    <span className="text-on-surface text-xs font-bold uppercase tracking-wider">Ads Analytics</span>
                </div>
                <h1 className="text-on-surface text-3xl font-black tracking-tight">Ads Campaign Analytics</h1>
                <p className="text-text-muted text-sm">Track ad spend, compute ROAS from live order data, and manage exchange rates.</p>
            </div>

            {/* Tab Switcher */}
            <div className="flex gap-1 p-1 bg-surface-lowest rounded-xl border border-border-dark w-fit">
                {(['dashboard', 'input', 'adjust', 'rates'] as const).map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`px-5 py-2 rounded-lg text-sm font-bold transition-all capitalize ${tab === t ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-text-muted hover:text-on-surface hover:bg-white/5'}`}
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

export default AdsPage;
