import React, { useState, useEffect, useRef } from 'react';
import { financialService, UploadResult } from '../src/services/financial.service';
import { fulfillmentService, FulfillmentCenter } from '../src/services/fulfillment.service';

interface CodReconciliationTabProps {
    onImportSuccess?: () => void;
}

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
    const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
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

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file && file.name.endsWith('.xlsx')) {
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
            setUploadResult(result);
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
            setToast(`✅ Imported ${result.imported} records. ${result.updatedOrders} orders updated.`);
            // Reset after short delay
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

    const formatEur = (val: number) => `€${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
                        {subTab === 'per_order' ? '📦 Upload Beeping Per-order Invoice' : '📋 Upload Monthly Invoice'}
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
                            accept=".xlsx"
                            className="hidden"
                            onChange={handleFileSelect}
                        />
                        {selectedFile ? (
                            <div className="flex flex-col items-center gap-2">
                                <span className="material-symbols-outlined text-[40px] text-emerald-400">description</span>
                                <p className="text-white font-bold text-sm">{selectedFile.name}</p>
                                <p className="text-text-muted text-xs">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-2">
                                <span className="material-symbols-outlined text-[40px] text-text-muted/30">cloud_upload</span>
                                <p className="text-text-muted text-sm font-bold">Drag & drop your .xlsx file here, or click to browse</p>
                                <p className="text-text-muted/50 text-xs">Only .xlsx files are accepted</p>
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

            {/* ─── Preview Table ───────────────────────────────── */}
            {uploadResult && (
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
                                                <th className="px-4 py-2.5 text-text-muted font-black text-[10px] uppercase tracking-widest">Client</th>
                                                <th className="px-4 py-2.5 text-text-muted font-black text-[10px] uppercase tracking-widest">Shop</th>
                                                <th className="px-4 py-2.5 text-text-muted font-black text-[10px] uppercase tracking-widest">Concept</th>
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
                                                    <td className="px-4 py-2.5 text-xs text-white">{row.clientName}</td>
                                                    <td className="px-4 py-2.5 text-xs text-white">{row.shop}</td>
                                                    <td className="px-4 py-2.5 text-xs text-white">{row.concept}</td>
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
                                                <td colSpan={4} className="px-4 py-3 text-xs font-black text-text-muted uppercase text-right">Total:</td>
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
