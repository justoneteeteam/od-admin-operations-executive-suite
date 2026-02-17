
import React, { useState, useEffect } from 'react';
import { Product, Warehouse } from '../../types';

interface InventoryOperationsProps {
    warehouses: Warehouse[];
}

const InventoryOperations: React.FC<InventoryOperationsProps> = ({ warehouses }) => {
    const [operation, setOperation] = useState<'adjust' | 'transfer'>('adjust');
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Form States
    const [selectedProduct, setSelectedProduct] = useState('');
    const [sourceWarehouse, setSourceWarehouse] = useState('');
    const [targetWarehouse, setTargetWarehouse] = useState('');
    const [quantity, setQuantity] = useState<number>(0);
    const [reason, setReason] = useState('');

    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const token = localStorage.getItem('authToken');
                const res = await fetch('http://localhost:3000/products', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setProducts(data);
                }
            } catch (err) {
                console.error("Failed to fetch products", err);
            }
        };
        fetchProducts();
    }, []);

    const resetForm = () => {
        setQuantity(0);
        setReason('');
        setMessage(null);
    };

    const handleAdjust = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        try {
            const token = localStorage.getItem('authToken');
            const res = await fetch('http://localhost:3000/inventory/adjust', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    productId: selectedProduct,
                    warehouseId: sourceWarehouse,
                    quantity: Number(quantity),
                    reason,
                    type: 'adjustment'
                })
            });

            if (res.ok) {
                setMessage({ type: 'success', text: 'Stock adjustment successful' });
                resetForm();
            } else {
                const err = await res.json();
                setMessage({ type: 'error', text: err.message || 'Adjustment failed' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Network error during adjustment' });
        } finally {
            setLoading(false);
        }
    };

    const handleTransfer = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        if (sourceWarehouse === targetWarehouse) {
            setMessage({ type: 'error', text: 'Source and Target warehouses cannot be the same' });
            setLoading(false);
            return;
        }

        try {
            const token = localStorage.getItem('authToken');
            const res = await fetch('http://localhost:3000/inventory/transfer', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    productId: selectedProduct,
                    fromWarehouseId: sourceWarehouse,
                    toWarehouseId: targetWarehouse,
                    quantity: Number(quantity),
                    reason
                })
            });

            if (res.ok) {
                setMessage({ type: 'success', text: 'Stock transfer successful' });
                resetForm();
            } else {
                const err = await res.json();
                setMessage({ type: 'error', text: err.message || 'Transfer failed' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Network error during transfer' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-card-dark rounded-lg border border-border-dark p-6">
            <h2 className="text-xl font-bold text-white mb-6">Inventory Operations</h2>

            {/* Operation Type Toggle */}
            <div className="flex gap-4 mb-8">
                <button
                    onClick={() => { setOperation('adjust'); setMessage(null); }}
                    className={`flex-1 py-3 px-4 rounded-lg border text-sm font-medium transition-colors ${operation === 'adjust'
                        ? 'bg-primary/20 border-primary text-primary'
                        : 'bg-[#1c2d3d] border-[#2d445a] text-gray-400 hover:text-white'
                        }`}
                >
                    Stock Adjustment
                </button>
                <button
                    onClick={() => { setOperation('transfer'); setMessage(null); }}
                    className={`flex-1 py-3 px-4 rounded-lg border text-sm font-medium transition-colors ${operation === 'transfer'
                        ? 'bg-primary/20 border-primary text-primary'
                        : 'bg-[#1c2d3d] border-[#2d445a] text-gray-400 hover:text-white'
                        }`}
                >
                    Stock Transfer
                </button>
            </div>

            {message && (
                <div className={`p-4 rounded-lg mb-6 text-sm ${message.type === 'success' ? 'bg-green-900/50 text-green-200 border border-green-900' : 'bg-red-900/50 text-red-200 border border-red-900'
                    }`}>
                    {message.text}
                </div>
            )}

            <form onSubmit={operation === 'adjust' ? handleAdjust : handleTransfer} className="space-y-6 max-w-2xl mx-auto">

                {/* Product Select */}
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Product</label>
                    <select
                        required
                        className="w-full bg-[#1c2d3d] border border-[#2d445a] text-white rounded-lg p-2.5 focus:ring-primary focus:border-primary"
                        value={selectedProduct}
                        onChange={(e) => setSelectedProduct(e.target.value)}
                    >
                        <option value="">Select Product...</option>
                        {products.map(p => (
                            <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                        ))}
                    </select>
                </div>

                {/* Warehouse Selects */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">
                            {operation === 'transfer' ? 'From Warehouse' : 'Warehouse'}
                        </label>
                        <select
                            required
                            className="w-full bg-[#1c2d3d] border border-[#2d445a] text-white rounded-lg p-2.5 focus:ring-primary focus:border-primary"
                            value={sourceWarehouse}
                            onChange={(e) => setSourceWarehouse(e.target.value)}
                        >
                            <option value="">Select Warehouse...</option>
                            {warehouses.map(w => (
                                <option key={w.id} value={w.id}>{w.name}</option>
                            ))}
                        </select>
                    </div>

                    {operation === 'transfer' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">To Warehouse</label>
                            <select
                                required
                                className="w-full bg-[#1c2d3d] border border-[#2d445a] text-white rounded-lg p-2.5 focus:ring-primary focus:border-primary"
                                value={targetWarehouse}
                                onChange={(e) => setTargetWarehouse(e.target.value)}
                            >
                                <option value="">Select Warehouse...</option>
                                {warehouses.map(w => (
                                    <option key={w.id} value={w.id}>{w.name}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                {/* Quantity & Reason */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Quantity</label>
                        <input
                            type="number"
                            required
                            className="w-full bg-[#1c2d3d] border border-[#2d445a] text-white rounded-lg p-2.5 focus:ring-primary focus:border-primary"
                            value={quantity}
                            onChange={(e) => setQuantity(Number(e.target.value))}
                            placeholder="0"
                        />
                        {operation === 'adjust' && (
                            <p className="text-xs text-gray-500 mt-1">Use negative values to remove stock.</p>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Reason (Reference)</label>
                        <input
                            type="text"
                            required
                            className="w-full bg-[#1c2d3d] border border-[#2d445a] text-white rounded-lg p-2.5 focus:ring-primary focus:border-primary"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="e.g. Broken Item, Restock, PO-123"
                        />
                    </div>
                </div>

                <div className="pt-4">
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-primary hover:bg-primary/90 text-white font-medium py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Processing...' : (operation === 'adjust' ? 'Update Stock' : 'Transfer Stock')}
                    </button>
                </div>

            </form>
        </div>
    );
};

export default InventoryOperations;
