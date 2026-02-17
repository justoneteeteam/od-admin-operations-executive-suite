
import React, { useState, useEffect } from 'react';
import { Product } from '../../types';

interface StockLevelsProps {
    selectedWarehouse: string;
}

interface ProductWithStock extends Product {
    currentStock: number;
    reservedStock: number;
    warehouseBreakdown: {
        warehouseId: string;
        current: number;
        reserved: number;
    }[];
}

const StockLevelsTable: React.FC<StockLevelsProps> = ({ selectedWarehouse }) => {
    const [products, setProducts] = useState<ProductWithStock[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchStock = async () => {
            setLoading(true);
            try {
                const url = selectedWarehouse === 'all'
                    ? 'http://localhost:3000/inventory/stock'
                    : `http://localhost:3000/inventory/stock?warehouseId=${selectedWarehouse}`;

                const token = localStorage.getItem('authToken');
                const res = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setProducts(data);
                }
            } catch (err) {
                console.error("Failed to fetch stock levels", err);
            } finally {
                setLoading(false);
            }
        };

        fetchStock();
    }, [selectedWarehouse]);

    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) {
        return <div className="text-white p-4">Loading stock levels...</div>;
    }

    return (
        <div className="bg-card-dark rounded-lg border border-border-dark overflow-hidden">
            <div className="p-4 border-b border-border-dark flex justify-between items-center bg-[#1c2d3d]">
                <h3 className="text-lg font-semibold text-white">Stock Levels</h3>
                <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-2.5 text-gray-400 text-sm">search</span>
                    <input
                        type="text"
                        placeholder="Search products..."
                        className="bg-[#0f172a] border border-[#2d445a] text-white text-sm rounded-lg pl-9 p-2 focus:ring-primary focus:border-primary w-64"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-400">
                    <thead className="bg-[#1c2d3d] text-xs uppercase font-bold text-gray-300">
                        <tr>
                            <th className="px-6 py-3">Product Name</th>
                            <th className="px-6 py-3">SKU</th>
                            <th className="px-6 py-3 text-right">Unit Cost</th>
                            <th className="px-6 py-3 text-right">Available</th>
                            <th className="px-6 py-3 text-right">Reserved</th>
                            <th className="px-6 py-3 text-right">Total On Hand</th>
                            <th className="px-6 py-3 text-center">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredProducts.map((product) => {
                            const total = product.currentStock;
                            const available = total - product.reservedStock;
                            const status = available <= (product.reorderPoint || 10)
                                ? available === 0 ? 'Out of Stock' : 'Low Stock'
                                : 'Healthy';

                            return (
                                <tr key={product.id} className="border-b border-border-dark hover:bg-[#2d445a]/30 transition-colors">
                                    <td className="px-6 py-4 font-medium text-white">{product.name}</td>
                                    <td className="px-6 py-4">{product.sku}</td>
                                    <td className="px-6 py-4 text-right">${product.unitCost?.toFixed(2)}</td>
                                    <td className="px-6 py-4 text-right font-bold text-blue-400">{available}</td>
                                    <td className="px-6 py-4 text-right text-yellow-500">{product.reservedStock}</td>
                                    <td className="px-6 py-4 text-right font-bold text-white">{total}</td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${status === 'Out of Stock' ? 'bg-red-900/50 text-red-200' :
                                            status === 'Low Stock' ? 'bg-orange-900/50 text-orange-200' :
                                                'bg-green-900/50 text-green-200'
                                            }`}>
                                            {status}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                        {filteredProducts.length === 0 && (
                            <tr>
                                <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                                    No products found matching your search.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default StockLevelsTable;
