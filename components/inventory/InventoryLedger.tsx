
import React, { useState, useEffect } from 'react';
import { InventoryTransaction } from '../../types';

interface InventoryLedgerProps {
    selectedWarehouse: string;
}

const InventoryLedger: React.FC<InventoryLedgerProps> = ({ selectedWarehouse }) => {
    const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchTransactions = async () => {
            setLoading(true);
            try {
                const url = selectedWarehouse === 'all'
                    ? 'http://localhost:3000/inventory/transactions'
                    : `http://localhost:3000/inventory/transactions?warehouseId=${selectedWarehouse}`;

                const token = localStorage.getItem('authToken');
                const res = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setTransactions(data);
                }
            } catch (err) {
                console.error("Failed to fetch transactions", err);
            } finally {
                setLoading(false);
            }
        };

        fetchTransactions();
    }, [selectedWarehouse]);

    if (loading) {
        return <div className="text-white p-4">Loading ledger...</div>;
    }

    return (
        <div className="bg-card-dark rounded-lg border border-border-dark overflow-hidden">
            <div className="p-4 border-b border-border-dark bg-[#1c2d3d]">
                <h3 className="text-lg font-semibold text-white">Inventory Ledger</h3>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-400">
                    <thead className="bg-[#1c2d3d] text-xs uppercase font-bold text-gray-300">
                        <tr>
                            <th className="px-6 py-3">Date</th>
                            <th className="px-6 py-3">Type</th>
                            <th className="px-6 py-3">Product</th>
                            <th className="px-6 py-3">Warehouse</th>
                            <th className="px-6 py-3 text-right">Quantity</th>
                            <th className="px-6 py-3">Reference</th>
                        </tr>
                    </thead>
                    <tbody>
                        {transactions.map((tx) => (
                            <tr key={tx.id} className="border-b border-border-dark hover:bg-[#2d445a]/30 transition-colors">
                                <td className="px-6 py-4">{new Date(tx.createdAt).toLocaleString()}</td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${tx.type === 'purchase_in' || tx.type === 'return_restock' ? 'bg-green-900/50 text-green-200' :
                                        tx.type === 'order_out' ? 'bg-blue-900/50 text-blue-200' :
                                            'bg-gray-700 text-gray-300'
                                        }`}>
                                        {tx.type.replace('_', ' ').toUpperCase()}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-white font-medium">
                                    {/* @ts-ignore: joined fields */}
                                    {tx.product?.name || 'Unknown Product'}
                                    <div className="text-xs text-gray-500">{/* @ts-ignore */}
                                        {tx.product?.sku}</div>
                                </td>
                                <td className="px-6 py-4 text-gray-300">
                                    {/* @ts-ignore: joined fields */}
                                    {tx.warehouse?.name || 'Unknown'}
                                </td>
                                <td className={`px-6 py-4 text-right font-bold ${tx.quantity > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {tx.quantity > 0 ? '+' : ''}{tx.quantity}
                                </td>
                                <td className="px-6 py-4 text-gray-500">{tx.referenceId || '-'}</td>
                            </tr>
                        ))}
                        {transactions.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                                    No transactions found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default InventoryLedger;
