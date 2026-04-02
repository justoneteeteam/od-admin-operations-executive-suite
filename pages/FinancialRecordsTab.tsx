import React, { useState, useEffect, useCallback } from 'react';
import { financialService, FinancialRecord, RecordsSummary } from '../src/services/financial.service';
import * as XLSX from 'xlsx';

const CATEGORY_BADGES: Record<string, string> = {
    Fulfillment: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    Ads: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    Personnel: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    Others: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
};

const SOURCE_BADGES: Record<string, string> = {
    manual: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    beeping: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    meta_ads: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
};

const FinancialRecordsTab: React.FC = () => {
    const [records, setRecords] = useState<FinancialRecord[]>([]);
    const [summary, setSummary] = useState<RecordsSummary | null>(null);
    const [loading, setLoading] = useState(true);

    const [exchangeRate, setExchangeRate] = useState<number | null>(null);
    const [uniqueSources, setUniqueSources] = useState<string[]>([]);
    
    // Import Modal State
    const [showImportModal, setShowImportModal] = useState(false);
    const [importStep, setImportStep] = useState(1);
    const [importData, setImportData] = useState<any[]>([]);
    const [isImporting, setIsImporting] = useState(false);
    const [importResults, setImportResults] = useState<{ importedCount: number } | null>(null);

    // Filters
    const [month, setMonth] = useState('');
    const [category, setCategory] = useState('');
    const [market, setMarket] = useState('');
    const [source, setSource] = useState('');

    // Inline add form
    const [showAddForm, setShowAddForm] = useState(false);
    const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
    const [formDesc, setFormDesc] = useState('');
    const [formCategory, setFormCategory] = useState('Fulfillment');
    const [formMarket, setFormMarket] = useState('');
    const [formAmountEur, setFormAmountEur] = useState('');
    const [formAmountVnd, setFormAmountVnd] = useState('');
    const [formSource, setFormSource] = useState('manual');
    const [formNotes, setFormNotes] = useState('');
    const [saving, setSaving] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const filters: any = {};
            if (month) filters.month = month;
            if (category) filters.category = category;
            if (market) filters.market = market;
            if (source) filters.source = source;

            const [recs, sum] = await Promise.all([
                financialService.getRecords(filters),
                financialService.getRecordsSummary({ month: month || undefined, market: market || undefined }),
            ]);
            setRecords(recs);
            setSummary(sum);
        } catch (err) {
            console.error('Failed to fetch financial records:', err);
        } finally {
            setLoading(false);
        }
    }, [month, category, market, source]);

    useEffect(() => { 
        fetchData(); 
        financialService.getLatestExchangeRate().then(rate => {
            if (rate) setExchangeRate(rate.vndToEur);
        }).catch(console.error);
        financialService.getUniqueSources().then(setUniqueSources).catch(console.error);
    }, [fetchData]);

    const handleAmountVndChange = (val: string) => {
        setFormAmountVnd(val);
        if (val && exchangeRate) {
            setFormAmountEur((parseFloat(val) / exchangeRate).toFixed(2));
        } else if (!val) {
            setFormAmountEur('');
        }
    };

    const handleAmountEurChange = (val: string) => {
        setFormAmountEur(val);
        if (val && exchangeRate) {
            setFormAmountVnd(Math.round(parseFloat(val) * exchangeRate).toString());
        } else if (!val) {
            setFormAmountVnd('');
        }
    };

    const handleAddExpense = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formDesc || !formAmountEur) return;
        setSaving(true);
        try {
            await financialService.createRecord({
                date: formDate,
                description: formDesc,
                category: formCategory,
                market: formMarket || undefined,
                amountEur: formAmountEur ? parseFloat(formAmountEur) : undefined,
                amountVnd: formAmountVnd ? parseFloat(formAmountVnd) : undefined,
                source: formSource,
                notes: formNotes || undefined,
            });
            // Reset form
            setFormDesc('');
            setFormAmountEur('');
            setFormAmountVnd('');
            setFormNotes('');
            setShowAddForm(false);
            fetchData();
            // Refresh sources in case a new one was added
            financialService.getUniqueSources().then(setUniqueSources).catch(console.error);
        } catch (err) {
            console.error('Failed to create record:', err);
            alert('Failed to create expense record');
        } finally {
            setSaving(false);
        }
    };

    const formatEur = (val: number) => `€${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const formatVnd = (val: number | null) => val ? `₫${Math.round(val).toLocaleString()}` : '—';

    // ========== IMPORT LOGIC ========== //
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = new Uint8Array(event.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false });

                // Map Excel columns to payload format
                const mappedData = jsonData.map((row: any) => ({
                    date: row['Date'] || new Date().toISOString(),
                    description: row['Description'] || 'Imported Expense',
                    category: row['Category'] || 'Others',
                    market: row['Market'] || null,
                    amountEur: row['Amount EUR'] ? parseFloat(row['Amount EUR']) : undefined,
                    amountVnd: row['Amount VND'] ? parseFloat(row['Amount VND']) : undefined,
                    source: row['Source'] || 'manual',
                    notes: row['Notes'] || '',
                }));

                setImportData(mappedData);
                setImportStep(2);
            } catch (err) {
                console.error("Failed to parse file", err);
                alert("Failed to parse file. Please ensure it's a valid CSV/XLSX.");
            }
        };
        reader.readAsArrayBuffer(file);
        e.target.value = ''; // reset input
    };

    const downloadTemplate = () => {
        const headers = ["Date", "Description", "Category", "Market", "Amount EUR", "Amount VND", "Source", "Notes"];
        const exampleRow1 = ["2026-04-01", "Facebook Campaign", "Ads", "IT", "150.00", "", "Meta Ads", "Monthly spend"];
        const exampleRow2 = ["2026-04-02", "Office Supplies", "Others", "", "", "500000", "VCB Card", "Bought paper"];

        const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow1, exampleRow2]);
        ws['!cols'] = headers.map(() => ({ wch: 18 }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Expenses");
        XLSX.writeFile(wb, "import_expenses_template.xlsx");
    };

    const executeImport = async () => {
        setIsImporting(true);
        setImportStep(3);
        try {
            const results = await financialService.bulkCreate(importData);
            setImportResults(results);
            if (results.importedCount > 0) {
                fetchData();
                financialService.getUniqueSources().then(setUniqueSources).catch(console.error);
            }
        } catch (err) {
            console.error("Import failed:", err);
            alert("Failed to import records.");
            setImportResults({ importedCount: 0 });
        } finally {
            setIsImporting(false);
        }
    };

    const closeImportModal = () => {
        setShowImportModal(false);
        setTimeout(() => {
            setImportStep(1);
            setImportData([]);
            setImportResults(null);
        }, 300);
    };

    return (
        <div className="flex flex-col gap-6">
            {/* ─── Filter Bar ─────────────────────────────────── */}
            <div className="flex flex-wrap gap-3 items-end">
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">Month</label>
                    <input
                        type="month"
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                        className="bg-card-dark border border-border-dark rounded-lg px-3 py-2 text-white text-sm min-w-[160px]"
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">Category</label>
                    <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="bg-card-dark border border-border-dark rounded-lg px-3 py-2 text-white text-sm appearance-none cursor-pointer min-w-[140px]"
                    >
                        <option value="">All</option>
                        <option value="Fulfillment">Fulfillment</option>
                        <option value="Ads">Ads</option>
                        <option value="Personnel">Personnel</option>
                        <option value="Others">Others</option>
                    </select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">Market</label>
                    <select
                        value={market}
                        onChange={(e) => setMarket(e.target.value)}
                        className="bg-card-dark border border-border-dark rounded-lg px-3 py-2 text-white text-sm appearance-none cursor-pointer min-w-[100px]"
                    >
                        <option value="">All</option>
                        <option value="ES">ES</option>
                        <option value="IT">IT</option>
                        <option value="DE">DE</option>
                        <option value="PL">PL</option>
                    </select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">Source</label>
                    <div className="relative">
                        <input
                            list="source-list"
                            value={source}
                            onChange={(e) => setSource(e.target.value)}
                            placeholder="All"
                            className="bg-card-dark border border-border-dark rounded-lg px-3 py-2 text-white text-sm min-w-[140px] w-full focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                        <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none text-[20px]">arrow_drop_down</span>
                    </div>
                </div>
                <button
                    onClick={() => setShowImportModal(true)}
                    className="flex justify-center items-center gap-1.5 px-4 py-2 bg-[#1c2d3d] hover:bg-[#233648] text-emerald-400 border border-[#2d445a] rounded-lg text-sm font-bold transition-all"
                >
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>upload_file</span>
                    Import Expenses
                </button>
                <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/80 text-white rounded-lg text-sm font-bold transition-all shadow-lg shadow-primary/20"
                >
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
                    Add Expense
                </button>

                <datalist id="source-list">
                    <option value="Manual" />
                    <option value="Beeping" />
                    <option value="Meta Ads" />
                    <option value="MB Bank" />
                    <option value="VCB Bank" />
                    <option value="MB Card" />
                    <option value="VCB Card" />
                    {uniqueSources.map(src => <option key={src} value={src} />)}
                </datalist>
            </div>

            {/* ─── Inline Add Form ────────────────────────────── */}
            {showAddForm && (
                <form onSubmit={handleAddExpense} className="bg-card-dark rounded-2xl border border-border-dark p-6">
                    <h3 className="text-xs font-black uppercase tracking-widest text-text-muted mb-4">New Expense Record</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">Date *</label>
                            <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} required
                                className="bg-[#1c2d3d] border border-border-dark rounded-lg px-3 py-2 text-white text-sm" />
                        </div>
                        <div className="flex flex-col gap-1 col-span-2">
                            <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">Description *</label>
                            <input type="text" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} required placeholder="e.g. Facebook Ads — January campaign"
                                className="bg-[#1c2d3d] border border-border-dark rounded-lg px-3 py-2 text-white text-sm placeholder:text-text-muted/40" />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">Category *</label>
                            <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)}
                                className="bg-[#1c2d3d] border border-border-dark rounded-lg px-3 py-2 text-white text-sm appearance-none cursor-pointer">
                                <option value="Fulfillment">Fulfillment</option>
                                <option value="Ads">Ads</option>
                                <option value="Personnel">Personnel</option>
                                <option value="Others">Others</option>
                            </select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">Market</label>
                            <select value={formMarket} onChange={(e) => setFormMarket(e.target.value)}
                                className="bg-[#1c2d3d] border border-border-dark rounded-lg px-3 py-2 text-white text-sm appearance-none cursor-pointer">
                                <option value="">—</option>
                                <option value="ES">ES</option>
                                <option value="IT">IT</option>
                                <option value="DE">DE</option>
                                <option value="PL">PL</option>
                            </select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">Amount EUR {exchangeRate ? '' : '*'}</label>
                            <input type="number" step="0.01" value={formAmountEur} onChange={(e) => handleAmountEurChange(e.target.value)} required={!formAmountVnd} placeholder="0.00"
                                className="bg-[#1c2d3d] border border-border-dark rounded-lg px-3 py-2 text-white text-sm placeholder:text-text-muted/40" />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">Amount VND {exchangeRate ? '' : '(Read Only)'}</label>
                            <input type="number" step="1" value={formAmountVnd} onChange={(e) => handleAmountVndChange(e.target.value)} placeholder="0" readOnly={!exchangeRate && !!formAmountEur}
                                className="bg-[#1c2d3d] border border-border-dark rounded-lg px-3 py-2 text-white text-sm placeholder:text-text-muted/40" />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">Source</label>
                            <input
                                list="source-list"
                                value={formSource}
                                onChange={(e) => setFormSource(e.target.value)}
                                placeholder="Type or select source"
                                className="bg-[#1c2d3d] border border-border-dark rounded-lg px-3 py-2 text-white text-sm placeholder:text-text-muted/40 w-full focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                        </div>
                        <div className="flex flex-col gap-1 col-span-2 md:col-span-4">
                            <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">Notes</label>
                            <input type="text" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Optional notes"
                                className="bg-[#1c2d3d] border border-border-dark rounded-lg px-3 py-2 text-white text-sm placeholder:text-text-muted/40" />
                        </div>
                    </div>
                    <div className="flex gap-3 mt-4">
                        <button type="submit" disabled={saving}
                            className="flex items-center gap-1.5 px-5 py-2 bg-primary hover:bg-primary/80 text-white rounded-lg text-sm font-bold transition-all disabled:opacity-50">
                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>save</span>
                            {saving ? 'Saving...' : 'Save Record'}
                        </button>
                        <button type="button" onClick={() => setShowAddForm(false)}
                            className="px-4 py-2 text-text-muted hover:text-white border border-border-dark rounded-lg text-sm font-bold transition-all">
                            Cancel
                        </button>
                    </div>
                </form>
            )}

            {/* ─── Summary Cards ──────────────────────────────── */}
            {summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                        { label: 'Total EUR Spend', value: formatEur(summary.totalEur), icon: 'euro', color: 'text-blue-400', border: 'border-l-blue-500' },
                        { label: 'Total VND Spend', value: formatVnd(summary.totalVnd), icon: 'currency_exchange', color: 'text-teal-400', border: 'border-l-teal-500' },
                        { label: 'Fulfillment Costs', value: formatEur(summary.byCategory.Fulfillment || 0), icon: 'local_shipping', color: 'text-cyan-400', border: 'border-l-cyan-500' },
                        { label: 'Record Count', value: summary.recordCount.toString(), icon: 'receipt_long', color: 'text-purple-400', border: 'border-l-purple-500' },
                    ].map((card, i) => (
                        <div key={i} className={`bg-card-dark p-5 rounded-2xl border border-border-dark border-l-4 ${card.border} relative overflow-hidden group hover:shadow-lg transition-shadow`}>
                            <div className="absolute -right-2 -bottom-2 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity">
                                <span className="material-symbols-outlined text-[80px]">{card.icon}</span>
                            </div>
                            <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em]">{card.label}</p>
                            <h3 className={`text-2xl font-black tracking-tight mt-2 ${card.color}`}>{card.value}</h3>
                        </div>
                    ))}
                </div>
            )}

            {/* ─── Records Table ──────────────────────────────── */}
            <div className="bg-card-dark rounded-2xl border border-border-dark overflow-hidden">
                <div className="px-6 py-4 border-b border-border-dark bg-[#14202c]">
                    <h3 className="text-xs font-black uppercase tracking-widest text-text-muted">
                        📊 Financial Records ({records.length})
                    </h3>
                </div>

                {loading ? (
                    <div className="p-12 text-center text-text-muted text-sm">Loading records...</div>
                ) : records.length === 0 ? (
                    <div className="p-12 text-center text-text-muted text-sm">
                        <span className="material-symbols-outlined text-[48px] block mb-3 opacity-20">receipt_long</span>
                        No financial records found. Upload an invoice or add a manual expense.
                    </div>
                ) : (
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse min-w-[1000px]">
                            <thead>
                                <tr className="bg-[#17232f]">
                                    <th className="px-4 py-2.5 text-text-muted font-black text-[10px] uppercase tracking-widest">Date</th>
                                    <th className="px-4 py-2.5 text-text-muted font-black text-[10px] uppercase tracking-widest">Description</th>
                                    <th className="px-4 py-2.5 text-text-muted font-black text-[10px] uppercase tracking-widest">Category</th>
                                    <th className="px-4 py-2.5 text-text-muted font-black text-[10px] uppercase tracking-widest">Market</th>
                                    <th className="px-4 py-2.5 text-text-muted font-black text-[10px] uppercase tracking-widest text-right">Amount EUR</th>
                                    <th className="px-4 py-2.5 text-text-muted font-black text-[10px] uppercase tracking-widest text-right">Amount VND</th>
                                    <th className="px-4 py-2.5 text-text-muted font-black text-[10px] uppercase tracking-widest">Source</th>
                                    <th className="px-4 py-2.5 text-text-muted font-black text-[10px] uppercase tracking-widest">Order#</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-dark/50">
                                {records.map((r) => (
                                    <tr key={r.id} className="hover:bg-primary/[0.03] transition-colors">
                                        <td className="px-4 py-2.5 text-xs text-white font-medium whitespace-nowrap">
                                            {new Date(r.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                        </td>
                                        <td className="px-4 py-2.5 text-xs text-white font-bold max-w-[280px] truncate" title={r.description}>
                                            {r.description}
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${CATEGORY_BADGES[r.category] || CATEGORY_BADGES.Others}`}>
                                                {r.category}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            {r.market ? (
                                                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                                                    {r.market}
                                                </span>
                                            ) : <span className="text-text-muted text-xs">—</span>}
                                        </td>
                                        <td className="px-4 py-2.5 text-xs font-black text-white text-right">{formatEur(Number(r.amountEur))}</td>
                                        <td className="px-4 py-2.5 text-xs font-bold text-teal-400 text-right">{formatVnd(r.amountVnd ? Number(r.amountVnd) : null)}</td>
                                        <td className="px-4 py-2.5">
                                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${SOURCE_BADGES[r.source] || SOURCE_BADGES.manual}`}>
                                                {r.source}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5 text-xs text-primary font-mono">
                                            {r.order?.orderNumber || '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ─── IMPORT EXPENSES MODAL ──────────────────────────────── */}
            {showImportModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-[#111a22] border border-border-dark rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-border-dark bg-[#17232f]">
                            <div>
                                <h2 className="text-lg font-black text-white tracking-tight">Import Expenses</h2>
                                <p className="text-xs text-text-muted mt-0.5">Upload a spreadsheet of financial records</p>
                            </div>
                            <button
                                onClick={closeImportModal}
                                disabled={isImporting}
                                className="text-text-muted hover:text-white transition-colors disabled:opacity-50"
                            >
                                <span className="material-symbols-outlined text-xl">close</span>
                            </button>
                        </div>

                        <div className="p-6">
                            {importStep === 1 && (
                                <div className="flex flex-col items-center justify-center py-12 px-6 border-2 border-dashed border-border-dark rounded-xl bg-card-dark relative group overflow-hidden">
                                    <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    <span className="material-symbols-outlined text-5xl text-text-muted mb-4 group-hover:text-primary transition-colors">cloud_upload</span>
                                    <h3 className="text-white font-bold mb-2">Upload Excel or CSV File</h3>
                                    <p className="text-text-muted text-sm text-center max-w-sm mb-6">
                                        Drop your file here or click to browse. Make sure it matches our template format.
                                    </p>
                                    <input
                                        type="file"
                                        accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                        onChange={handleFileUpload}
                                    />
                                    <div className="flex gap-3 relative z-20">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); downloadTemplate(); }}
                                            className="px-4 py-2 bg-[#1c2d3d] hover:bg-[#233648] text-white rounded-lg text-sm font-bold border border-border-dark transition-all flex items-center gap-2"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">download</span>
                                            Download Template
                                        </button>
                                        <button className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold shadow-lg shadow-primary/20 pointer-events-none">
                                            Select File
                                        </button>
                                    </div>
                                </div>
                            )}

                            {importStep === 2 && (
                                <div className="flex flex-col gap-6">
                                    <div className="flex items-start gap-4 p-4 bg-primary/10 border border-primary/20 rounded-xl">
                                        <span className="material-symbols-outlined text-primary mt-0.5">info</span>
                                        <div>
                                            <h4 className="text-white font-bold text-sm">File Ready for Import</h4>
                                            <p className="text-text-muted text-sm mt-1">
                                                We found <strong className="text-white">{importData.length}</strong> record{importData.length !== 1 && 's'} in your file.
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex justify-end gap-3 mt-2">
                                        <button
                                            onClick={() => setImportStep(1)}
                                            className="px-4 py-2 text-text-muted hover:text-white border border-border-dark rounded-lg text-sm font-bold transition-all"
                                        >
                                            Back
                                        </button>
                                        <button
                                            onClick={executeImport}
                                            className="flex items-center gap-2 px-6 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-bold shadow-lg shadow-primary/20 transition-all"
                                        >
                                            Start Import
                                            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                                        </button>
                                    </div>
                                </div>
                            )}

                            {importStep === 3 && (
                                <div className="flex flex-col items-center justify-center py-10">
                                    {isImporting ? (
                                        <>
                                            <div className="relative size-16 mb-6">
                                                <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
                                                <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                                            </div>
                                            <h3 className="text-lg font-bold text-white mb-2">Importing Records...</h3>
                                            <p className="text-text-muted text-sm">Please do not close this window.</p>
                                        </>
                                    ) : importResults ? (
                                        <>
                                            <div className="size-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mb-6">
                                                <span className="material-symbols-outlined text-3xl text-emerald-500">check_circle</span>
                                            </div>
                                            <h3 className="text-lg font-bold text-white mb-2">Import Complete!</h3>
                                            
                                            <div className="flex gap-4 mb-6">
                                                <div className="flex flex-col items-center p-3 bg-card-dark border border-border-dark rounded-xl min-w-[120px]">
                                                    <span className="text-2xl font-black text-emerald-400">{importResults.importedCount}</span>
                                                    <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest mt-1">Imported</span>
                                                </div>
                                            </div>

                                            <button
                                                onClick={closeImportModal}
                                                className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-bold shadow-lg shadow-primary/20"
                                            >
                                                Done
                                            </button>
                                        </>
                                    ) : null}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FinancialRecordsTab;
