import React, { useState, useRef } from 'react';
import FinancialRecordsTab from './FinancialRecordsTab';
import CodReconciliationTab from './CodReconciliationTab';

const FinancialPage: React.FC = () => {
    const [tab, setTab] = useState<'records' | 'reconciliation'>('records');
    const recordsRefreshRef = useRef(0);

    return (
        <div className="flex flex-col gap-6 pb-12">
            {/* Header */}
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-text-muted text-xs font-bold uppercase tracking-wider opacity-60">Home</span>
                    <span className="text-text-muted text-xs opacity-30">/</span>
                    <span className="text-on-surface text-xs font-bold uppercase tracking-wider">Financial</span>
                </div>
                <h1 className="text-on-surface text-3xl font-black tracking-tight">Financial Management</h1>
                <p className="text-text-muted text-sm">Track expenses, upload invoices, and reconcile fulfillment costs.</p>
            </div>

            {/* Tab Switcher */}
            <div className="flex gap-1 p-1 bg-surface-lowest rounded-xl border border-border-dark w-fit">
                {([
                    { key: 'records' as const, label: '📊 Financial Records' },
                    { key: 'reconciliation' as const, label: '🔄 COD Reconciliation' },
                ]).map((t) => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${tab === t.key
                            ? 'bg-primary text-white shadow-lg shadow-primary/20'
                            : 'text-text-muted hover:text-on-surface hover:bg-white/5'
                            }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            {tab === 'records' && <FinancialRecordsTab key={recordsRefreshRef.current} />}
            {tab === 'reconciliation' && (
                <CodReconciliationTab
                    onImportSuccess={() => {
                        recordsRefreshRef.current++;
                        setTab('records');
                    }}
                />
            )}
        </div>
    );
};

export default FinancialPage;
