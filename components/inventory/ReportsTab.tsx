import React, { useState, useEffect } from 'react';
import { inventoryService } from '../../src/services/inventory.service';

interface ReportsTabProps {
    selectedWarehouse: string;
}

const ReportsTab: React.FC<ReportsTabProps> = ({ selectedWarehouse }) => {
    const [reports, setReports] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchReports = async () => {
            setLoading(true);
            try {
                const data = await inventoryService.getReports();
                setReports(data);
            } catch (err) {
                console.error("Failed to fetch reports data", err);
            } finally {
                setLoading(false);
            }
        };

        fetchReports();
    }, [selectedWarehouse]);

    if (loading) {
        return <div className="text-white p-4">Loading reports...</div>;
    }

    if (!reports) {
        return <div className="text-white p-4">Failed to load reports</div>;
    }

    const totalWriteOffUnits = (reports.writeOffBreakdown || []).reduce((s: number, w: any) => s + (w.totalUnits || 0), 0);
    const totalWriteOffCount = (reports.writeOffBreakdown || []).reduce((s: number, w: any) => s + (w.count || 0), 0);

    return (
        <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-card-dark p-6 rounded-xl shadow-sm border border-border-dark flex flex-col items-center justify-center h-48">
                    <p className="text-text-muted text-sm mb-2">Total Write-Offs (Last 30 Days)</p>
                    <p className="text-4xl font-bold text-red-500">{totalWriteOffUnits}</p>
                    <p className="text-sm mt-3 text-red-400/80">{totalWriteOffCount} incidents</p>
                </div>

                <div className="bg-card-dark p-6 rounded-xl shadow-sm border border-border-dark flex flex-col items-center justify-center h-48">
                    <p className="text-text-muted text-sm mb-2">Recovery Rate</p>
                    <p className={`text-4xl font-bold ${reports.recoveryRate?.rate >= 90 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {reports.recoveryRate ? `${reports.recoveryRate.rate.toFixed(1)}%` : 'N/A'}
                    </p>
                    <p className="text-sm mt-3 text-text-muted">
                        Target: {reports.recoveryRate?.target || 90}%
                        {reports.recoveryRate?.isBelowTarget && (
                            <span className="text-red-400 ml-2">⚠ Below target</span>
                        )}
                    </p>
                </div>

                <div className="bg-card-dark p-6 rounded-xl shadow-sm border border-border-dark flex flex-col items-center justify-center h-48">
                    <p className="text-text-muted text-sm mb-2">Markets Tracked</p>
                    <p className="text-4xl font-bold text-blue-400">{(reports.returnRateByMarket || []).length}</p>
                    <p className="text-sm mt-3 text-text-muted">Active delivery markets</p>
                </div>
            </div>

            {/* Return Rate by Market */}
            {reports.returnRateByMarket && reports.returnRateByMarket.length > 0 && (
                <div className="bg-card-dark rounded-xl border border-border-dark overflow-hidden">
                    <div className="p-4 border-b border-border-dark bg-[#17232f]">
                        <h3 className="text-lg font-bold text-white">Return Rate by Market</h3>
                    </div>
                    <table className="w-full text-left text-sm">
                        <thead className="bg-[#17232f] text-[10px] uppercase font-bold text-text-muted tracking-wider">
                            <tr className="border-b border-border-dark">
                                <th className="px-6 py-3">Market</th>
                                <th className="px-6 py-3 text-right">Delivered</th>
                                <th className="px-6 py-3 text-right">Returned</th>
                                <th className="px-6 py-3 text-right">Return Rate</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reports.returnRateByMarket.map((m: any, idx: number) => (
                                <tr key={idx} className="border-b border-border-dark hover:bg-[#1c2d3d]/30 transition-colors">
                                    <td className="px-6 py-3 text-white font-medium">{m.market || 'Unknown'}</td>
                                    <td className="px-6 py-3 text-right text-text-muted">{m.deliveredCount}</td>
                                    <td className="px-6 py-3 text-right text-orange-400">{m.returnCount}</td>
                                    <td className="px-6 py-3 text-right">
                                        <span className={`font-bold ${m.returnRate > 15 ? 'text-red-400' : m.returnRate > 10 ? 'text-orange-400' : 'text-emerald-400'}`}>
                                            {m.returnRate}%
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Write-Off Breakdown */}
            {reports.writeOffBreakdown && reports.writeOffBreakdown.length > 0 && (
                <div className="bg-card-dark rounded-xl border border-border-dark overflow-hidden">
                    <div className="p-4 border-b border-border-dark bg-[#17232f]">
                        <h3 className="text-lg font-bold text-white">Write-Off Breakdown</h3>
                    </div>
                    <table className="w-full text-left text-sm">
                        <thead className="bg-[#17232f] text-[10px] uppercase font-bold text-text-muted tracking-wider">
                            <tr className="border-b border-border-dark">
                                <th className="px-6 py-3">Reason</th>
                                <th className="px-6 py-3 text-right">Incidents</th>
                                <th className="px-6 py-3 text-right">Units Lost</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reports.writeOffBreakdown.map((w: any, idx: number) => (
                                <tr key={idx} className="border-b border-border-dark hover:bg-[#1c2d3d]/30 transition-colors">
                                    <td className="px-6 py-3 text-white font-medium">{w.reason}</td>
                                    <td className="px-6 py-3 text-right text-text-muted">{w.count}</td>
                                    <td className="px-6 py-3 text-right text-red-400 font-bold">{w.totalUnits}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default ReportsTab;
