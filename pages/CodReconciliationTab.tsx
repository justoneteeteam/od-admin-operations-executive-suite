import React, { useState, useEffect, useRef } from 'react';
import { financialService, UploadResult } from '../src/services/financial.service';
import { fulfillmentService, FulfillmentCenter } from '../src/services/fulfillment.service';

interface CodReconciliationTabProps {
    onImportSuccess?: () => void;
}

// Extended upload result for FFEU PDF invoices
interface FfeuUploadResult extends UploadResult {
    invoiceFormat?: 'ffeu_pdf';
    header?: {
        invoiceNumber: string;
        dateFrom: string;
        dateTo: string;
        numberOfOrders: number;
        totalDue: number;
        bankName: string;
        bankNumber: string;
        country: string;
        taxNumber: string;
        subtotalFees: number;
        vat: number;
        totalFees: number;
        totalOrders: number;
    };
}

const SECTION_COLORS: Record<string, string> = {
    'CALL CENTER FEES': 'text-violet-400 bg-violet-500/10 border-violet-500/20',
    'SHIPPING FEES': 'text-sky-400 bg-sky-500/10 border-sky-500/20',
    'FULFILLEMENT': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    'FULFILLMENT': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    'ORDERS': 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    'GENERAL': 'text-blue-400 bg-blue-500/10 border-blue-500/20',
};

const SECTION_ICON: Record<string, string> = {
    'CALL CENTER FEES': 'call',
    'SHIPPING FEES': 'local_shipping',
    'FULFILLEMENT': 'inventory_2',
    'FULFILLMENT': 'inventory_2',
    'ORDERS': 'shopping_cart',
    'GENERAL': 'receipt',
};

const CodReconciliationTab: React.FC<CodReconciliationTabProps> = ({ onImportSuccess }) => {
    const [subTab, setSubTab] = useState<'per_order' | 'monthly'>('per_order');
    const [fulfillmentCenters, setFulfillmentCenters] = useState<FulfillmentCenter[]>([]);

    // Upload state
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [fulfillmentCenterId, setFulfillmentCenterId] = useState('');
    const [periodMonth, setPeriodMonth] = useState('');
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Preview state
    const [uploadResult, setUploadResult] = useState<FfeuUploadResult | null>(null);
    const [importing, setImporting] = useState(false);
    const [importDone, setImportDone] = useState(false);

    // Toast
    const [toast, setToast] = useState<string | null>(null);

    useEffect(() => {
        const loadFc = async () => {
            try {
                const data = await fulfillmentService.getAll();
                setFulfillmentCenters(data);
                if (data.length > 0) setFulfillmentCenterId(data[0].id);
            } catch (err) {
                console.error('Failed to load fulfillment centers:', err);
            }
        };
        loadFc();
    }, []);

    // Auto-dismiss toast
    useEffect(() => {
        if (toast) {
            const t = setTimeout(() => setToast(null), 5000);
            return () => clearTimeout(t);
        }
    }, [toast]);

    // Accept .pdf only in monthly mode, .xlsx in per_order mode
    const acceptedExtensions = subTab === 'monthly' ? '.xlsx,.pdf' : '.xlsx';

    const isValidFile = (file: File) => {
        if (subTab === 'monthly') {
            return file.name.endsWith('.xlsx') || file.name.endsWith('.pdf');
        }
        return file.name.endsWith('.xlsx');
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file && isValidFile(file)) {
            setSelectedFile(file);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) setSelectedFile(file);
    };

    const handleUpload = async () => {
        if (!selectedFile || !fulfillmentCenterId) return;
        setUploading(true);
        try {
            const result = await financialService.uploadInvoice(
                selectedFile,
                fulfillmentCenterId,
                periodMonth || undefined,
                subTab,
            );
            setUploadResult(result as FfeuUploadResult);
        } catch (err: any) {
            console.error('Upload failed:', err);
            alert(err.response?.data?.message || 'Failed to upload and parse invoice');
        } finally {
            setUploading(false);
        }
    };

    const handleImport = async () => {
        if (!uploadResult?.uploadId) return;
        setImporting(true);
        try {
            const result = await financialService.importInvoice(uploadResult.uploadId);
            setImportDone(true);
            const isFfeu = uploadResult.invoiceFormat === 'ffeu_pdf';
            if (isFfeu) {
                setToast(`✅ Imported ${result.imported} FFEU fee records into Financial.`);
            } else {
                setToast(`✅ Imported ${result.imported} records. ${result.updatedOrders} orders updated.`);
            }
            setTimeout(() => {
                handleClear();
                onImportSuccess?.();
            }, 1500);
        } catch (err: any) {
            console.error('Import failed:', err);
            alert(err.response?.data?.message || 'Failed to import records');
        } finally {
            setImporting(false);
        }
    };

    const handleClear = () => {
        setUploadResult(null);
        setSelectedFile(null);
        setImportDone(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const formatEur = (val: number) =>
        `€${(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const isFfeu = uploadResult?.invoiceFormat === 'ffeu_pdf';

    // Group FFEU rows by category
    const ffeuGrouped: Record<string, any[]> = {};
    if (isFfeu && uploadResult?.rows) {
        for (const row of uploadResult.rows) {
            const cat = row.category || 'GENERAL';
            if (!ffeuGrouped[cat]) ffeuGrouped[cat] = [];
            ffeuGrouped[cat].push(row);
        }
    }

    return (
        <div className="flex flex-col gap-6">
            {/* Toast */}
            {toast && (
                <div className="fixed top-4 right-4 z-[200] bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 px-6 py-3 rounded-xl text-sm font-bold shadow-2xl shadow-black/40 backdrop-blur-sm animate-in fade-in slide-in-from-top-2 duration-200">
                    {toast}
                </div>
            )}

            {/* Sub-tabs */}
            <div className="flex gap-1 p-1 bg-card-dark rounded-xl border border-border-dark w-fit">
                {([
                    { key: 'per_order' as const, label: '📦 Per-order Invoice' },
                    { key: 'monthly' as const, label: '📋 Monthly Invoice' },
                ]).map((t) => (
                    <button
                        key={t.key}
                        onClick={() => { setSubTab(t.key); handleClear(); }}
                        className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${subTab === t.key
                            ? 'bg-primary text-white shadow-lg shadow-primary/20'
                            : 'text-text-muted hover:text-white hover:bg-white/5'
                            }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* ─── Upload Zone ─────────────────────────────────── */}
            {!uploadResult && (
                <div className="bg-card-dark rounded-2xl border border-border-dark p-6">
                    <h3 className="text-xs font-black uppercase tracking-widest text-text-muted mb-5">
                        {subTab === 'per_order' ? '📦 Upload Beeping Per-order Invoice' : '📋 Upload Monthly Invoice (XLSX or FFEU PDF)'}
                    </h3>

                    {/* Drag-and-drop area */}
                    <div
                        className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${dragOver
                            ? 'border-primary bg-primary/5'
                            : selectedFile
                                ? 'border-emerald-500/30 bg-emerald-500/5'
                                : 'border-border-dark hover:border-primary/40 hover:bg-primary/[0.02]'
                            }`}
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept={acceptedExtensions}
                            className="hidden"
                            onChange={handleFileSelect}
                        />
                        {selectedFile ? (
                            <div className="flex flex-col items-center gap-2">
                                <span className="material-symbols-outlined text-[40px] text-emerald-400">
                                    {selectedFile.name.endsWith('.pdf') ? 'picture_as_pdf' : 'description'}
                                </span>
                                <p className="text-white font-bold text-sm">{selectedFile.name}</p>
                                <p className="text-text-muted text-xs">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                                {selectedFile.name.endsWith('.pdf') && (
                                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20">
                                        FFEU PDF
                                    </span>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-2">
                                <span className="material-symbols-outlined text-[40px] text-text-muted/30">cloud_upload</span>
                                <p className="text-text-muted text-sm font-bold">Drag & drop your file here, or click to browse</p>
                                <p className="text-text-muted/50 text-xs">
                                    {subTab === 'monthly'
                                        ? 'Accepts .xlsx (Beeping) or .pdf (FFEU invoice)'
                                        : 'Only .xlsx files are accepted'}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Config fields */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">Fulfillment Center *</label>
                            <select
                                value={fulfillmentCenterId}
                                onChange={(e) => setFulfillmentCenterId(e.target.value)}
                                className="bg-[#1c2d3d] border border-border-dark rounded-lg px-3 py-2 text-white text-sm appearance-none cursor-pointer"
                            >
                                {fulfillmentCenters.map((fc) => (
                                    <option key={fc.id} value={fc.id}>{fc.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">Period Month</label>
                            <input
                                type="month"
                                value={periodMonth}
                                onChange={(e) => setPeriodMonth(e.target.value)}
                                className="bg-[#1c2d3d] border border-border-dark rounded-lg px-3 py-2 text-white text-sm"
                            />
                        </div>
                        <div className="flex items-end">
                            <button
                                onClick={handleUpload}
                                disabled={!selectedFile || !fulfillmentCenterId || uploading}
                                className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/80 text-white rounded-lg text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
                            >
                                {uploading ? (
                                    <>
                                        <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                                        Parsing...
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>upload_file</span>
                                        Upload & Preview
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── FFEU PDF Preview ───────────────────────────────── */}
            {uploadResult && isFfeu && uploadResult.header && (
                <div className="flex flex-col gap-5">
                    {/* FFEU Header Card */}
                    <div className="bg-gradient-to-br from-violet-500/10 to-blue-500/5 rounded-2xl border border-violet-500/20 p-5">
                        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-violet-400" style={{ fontSize: '20px' }}>receipt_long</span>
                                </div>
                                <div>
                                    <p className="text-white font-black text-lg">INVOICE #{uploadResult.header.invoiceNumber || '—'}</p>
                                    <p className="text-text-muted text-xs">
                                        {uploadResult.header.dateFrom} → {uploadResult.header.dateTo}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-[10px] font-black uppercase px-3 py-1 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20">
                                    FFEU PDF
                                </span>
                                <span className="text-[10px] font-black uppercase px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                    {uploadResult.header.numberOfOrders} Orders
                                </span>
                            </div>
                        </div>

                        {/* Invoice metadata grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                                <p className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Bank</p>
                                <p className="text-white font-medium">{uploadResult.header.bankName || '—'}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Bank Number</p>
                                <p className="text-white font-mono text-xs">{uploadResult.header.bankNumber || '—'}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Country</p>
                                <p className="text-white font-medium">{uploadResult.header.country || '—'}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Tax Number</p>
                                <p className="text-white font-mono text-xs">{uploadResult.header.taxNumber || '—'}</p>
                            </div>
                        </div>
                    </div>

                    {/* Fee breakdown by section */}
                    <div className="flex flex-col gap-4">
                        {Object.entries(ffeuGrouped).map(([category, catRows]) => {
                            const colorClass = SECTION_COLORS[category] || SECTION_COLORS['GENERAL'];
                            const icon = SECTION_ICON[category] || 'receipt';
                            const sectionTotal = catRows.reduce((sum, r) => sum + r.amountEur, 0);
                            return (
                                <div key={category} className="bg-card-dark rounded-2xl border border-border-dark overflow-hidden">
                                    {/* Section header */}
                                    <div className="flex items-center justify-between px-5 py-3 bg-[#17232f] border-b border-border-dark">
                                        <div className="flex items-center gap-2">
                                            <span className={`material-symbols-outlined text-[16px] ${colorClass.split(' ')[0]}`}>{icon}</span>
                                            <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${colorClass}`}>
                                                {category}
                                            </span>
                                        </div>
                                        <span className="text-sm font-black text-white">{formatEur(sectionTotal)}</span>
                                    </div>
                                    {/* Rows */}
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-[#141e29]">
                                                <th className="px-5 py-2 text-text-muted font-black text-[10px] uppercase tracking-widest w-full">Item</th>
                                                <th className="px-5 py-2 text-text-muted font-black text-[10px] uppercase tracking-widest text-center whitespace-nowrap">Qty</th>
                                                <th className="px-5 py-2 text-text-muted font-black text-[10px] uppercase tracking-widest text-right whitespace-nowrap">Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border-dark/40">
                                            {catRows.map((row: any, idx: number) => (
                                                <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                                                    <td className="px-5 py-2.5 text-xs text-white font-medium">{row.item}</td>
                                                    <td className="px-5 py-2.5 text-xs text-text-muted text-center">
                                                        {row.total !== null ? row.total : '—'}
                                                    </td>
                                                    <td className="px-5 py-2.5 text-xs font-black text-right">
                                                        <span className={row.amountEur > 0 ? 'text-white' : 'text-text-muted'}>
                                                            {formatEur(row.amountEur)}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            );
                        })}
                    </div>

                    {/* FFEU Summary totals */}
                    <div className="bg-card-dark rounded-2xl border border-border-dark p-5">
                        <h4 className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-4">Invoice Summary</h4>
                        <div className="flex flex-col gap-2">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-text-muted">Subtotal Fees</span>
                                <span className="text-white font-bold">{formatEur(uploadResult.header.subtotalFees)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-text-muted">VAT (0%)</span>
                                <span className="text-white font-bold">{formatEur(uploadResult.header.vat)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm border-t border-border-dark pt-2 mt-1">
                                <span className="text-text-muted font-bold">Total Fees</span>
                                <span className="text-blue-400 font-black">{formatEur(uploadResult.header.totalFees)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-text-muted">Total Orders (COD Collected)</span>
                                <span className="text-amber-400 font-bold">{formatEur(uploadResult.header.totalOrders)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm border-t border-border-dark pt-2 mt-1">
                                <span className="text-white font-black text-base">Total Payment Due</span>
                                <span className="text-emerald-400 font-black text-base">{formatEur(uploadResult.header.totalDue)}</span>
                            </div>
                        </div>
                        <p className="text-text-muted/50 text-[10px] mt-4">
                            * Only fee rows (excluding ORDERS) will be imported as Fulfillment expense records.
                        </p>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-3">
                        <button
                            onClick={handleImport}
                            disabled={importing || importDone}
                            className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary/80 text-white rounded-lg text-sm font-bold transition-all disabled:opacity-40 shadow-lg shadow-primary/20"
                        >
                            {importing ? (
                                <>
                                    <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                                    Importing...
                                </>
                            ) : importDone ? (
                                <>
                                    <span className="material-symbols-outlined text-[16px]">check_circle</span>
                                    Imported!
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>download</span>
                                    Import {uploadResult.rows.filter((r: any) => r.category !== 'ORDERS' && r.amountEur > 0).length} Fee Records
                                </>
                            )}
                        </button>
                        <button
                            onClick={handleClear}
                            className="px-4 py-2.5 text-text-muted hover:text-white border border-border-dark rounded-lg text-sm font-bold transition-all"
                        >
                            Clear
                        </button>
                    </div>
                </div>
            )}

            {/* ─── Standard XLSX Preview Table ───────────────────────── */}
            {uploadResult && !isFfeu && (
                <div className="flex flex-col gap-4">
                    {/* Info banner */}
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-5 py-3 flex items-start gap-3">
                        <span className="material-symbols-outlined text-blue-400 mt-0.5" style={{ fontSize: '20px' }}>info</span>
                        <div>
                            <p className="text-blue-400 text-sm font-bold">
                                {subTab === 'per_order'
                                    ? 'Expense = Shipping€ + Fulfillment€. COD€ is excluded (it is revenue, not cost).'
                                    : 'Each row will create one Fulfillment expense record.'}
                            </p>
                        </div>
                    </div>

                    {/* Summary bar */}
                    <div className="bg-card-dark rounded-xl border border-border-dark p-4 flex flex-wrap gap-6">
                        <div>
                            <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">File</p>
                            <p className="text-white text-sm font-bold mt-1">{selectedFile?.name}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">Total Lines</p>
                            <p className="text-white text-sm font-bold mt-1">{uploadResult.summary.total}</p>
                        </div>
                        {subTab === 'per_order' && (
                            <>
                                <div>
                                    <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">Matched</p>
                                    <p className="text-emerald-400 text-sm font-bold mt-1">{uploadResult.summary.matched}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">Unmatched</p>
                                    <p className="text-amber-400 text-sm font-bold mt-1">{uploadResult.summary.unmatched}</p>
                                </div>
                            </>
                        )}
                        <div>
                            <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">Total Expense</p>
                            <p className="text-blue-400 text-sm font-bold mt-1">{formatEur(uploadResult.summary.totalAmountEur)}</p>
                        </div>
                    </div>

                    {/* Data table */}
                    <div className="bg-card-dark rounded-2xl border border-border-dark overflow-hidden">
                        <div className="overflow-x-auto custom-scrollbar">
                            <table className="w-full text-left border-collapse min-w-[900px]">
                                <thead>
                                    <tr className="bg-[#17232f]">
                                        {subTab === 'per_order' ? (
                                            <>
                                                <th className="px-4 py-2.5 text-text-muted font-black text-[10px] uppercase tracking-widest">Order#</th>
                                                <th className="px-4 py-2.5 text-text-muted font-black text-[10px] uppercase tracking-widest">Store</th>
                                                <th className="px-4 py-2.5 text-text-muted font-black text-[10px] uppercase tracking-widest">Concept</th>
                                                <th className="px-4 py-2.5 text-text-muted font-black text-[10px] uppercase tracking-widest text-right">Shipping€</th>
                                                <th className="px-4 py-2.5 text-text-muted font-black text-[10px] uppercase tracking-widest text-right">Fulfillment€</th>
                                                <th className="px-4 py-2.5 text-text-muted font-black text-[10px] uppercase tracking-widest text-right">COD€</th>
                                                <th className="px-4 py-2.5 text-text-muted font-black text-[10px] uppercase tracking-widest text-right">Expense€</th>
                                                <th className="px-4 py-2.5 text-text-muted font-black text-[10px] uppercase tracking-widest">Match</th>
                                            </>
                                        ) : (
                                            <>
                                                <th className="px-4 py-2.5 text-text-muted font-black text-[10px] uppercase tracking-widest">Shop</th>
                                                <th className="px-4 py-2.5 text-text-muted font-black text-[10px] uppercase tracking-widest text-right">Orders</th>
                                                <th className="px-4 py-2.5 text-text-muted font-black text-[10px] uppercase tracking-widest text-right">Total€</th>
                                            </>
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border-dark/50">
                                    {uploadResult.rows.map((row: any, idx: number) => (
                                        <tr key={idx} className="hover:bg-primary/[0.03] transition-colors">
                                            {subTab === 'per_order' ? (
                                                <>
                                                    <td className="px-4 py-2.5 text-xs text-primary font-mono font-bold">{row.orderNumber}</td>
                                                    <td className="px-4 py-2.5 text-xs text-white">{row.store}</td>
                                                    <td className="px-4 py-2.5 text-xs text-white">{row.concept}</td>
                                                    <td className="px-4 py-2.5 text-xs text-white text-right">{formatEur(row.shippingEur)}</td>
                                                    <td className="px-4 py-2.5 text-xs text-white text-right">{formatEur(row.fulfillmentEur)}</td>
                                                    <td className="px-4 py-2.5 text-xs text-text-muted text-right">{formatEur(row.codEur)}</td>
                                                    <td className="px-4 py-2.5 text-xs text-blue-400 font-black text-right">{formatEur(row.expenseEur)}</td>
                                                    <td className="px-4 py-2.5">
                                                        {row.matched ? (
                                                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                                Matched
                                                            </span>
                                                        ) : (
                                                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                                                Unmatched
                                                            </span>
                                                        )}
                                                    </td>
                                                </>
                                            ) : (
                                                <>
                                                    <td className="px-4 py-2.5 text-xs text-white">{row.shop}</td>
                                                    <td className="px-4 py-2.5 text-xs text-white text-right">{row.orders}</td>
                                                    <td className="px-4 py-2.5 text-xs text-blue-400 font-black text-right">{formatEur(row.expenseEur)}</td>
                                                </>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                                {/* Footer */}
                                <tfoot>
                                    <tr className="bg-[#14202c] border-t border-border-dark">
                                        {subTab === 'per_order' ? (
                                            <>
                                                <td colSpan={6} className="px-4 py-3 text-xs font-black text-text-muted uppercase text-right">Total Expense:</td>
                                                <td className="px-4 py-3 text-sm font-black text-blue-400 text-right">{formatEur(uploadResult.summary.totalAmountEur)}</td>
                                                <td></td>
                                            </>
                                        ) : (
                                            <>
                                                <td colSpan={2} className="px-4 py-3 text-xs font-black text-text-muted uppercase text-right">Total:</td>
                                                <td className="px-4 py-3 text-sm font-black text-blue-400 text-right">{formatEur(uploadResult.summary.totalAmountEur)}</td>
                                            </>
                                        )}
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-3">
                        <button
                            onClick={handleImport}
                            disabled={importing || importDone}
                            className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary/80 text-white rounded-lg text-sm font-bold transition-all disabled:opacity-40 shadow-lg shadow-primary/20"
                        >
                            {importing ? (
                                <>
                                    <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                                    Importing...
                                </>
                            ) : importDone ? (
                                <>
                                    <span className="material-symbols-outlined text-[16px]">check_circle</span>
                                    Imported!
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>download</span>
                                    Import {uploadResult.summary.total} records
                                </>
                            )}
                        </button>
                        <button
                            onClick={handleClear}
                            className="px-4 py-2.5 text-text-muted hover:text-white border border-border-dark rounded-lg text-sm font-bold transition-all"
                        >
                            Clear
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CodReconciliationTab;
