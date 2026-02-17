
import React, { useState, useEffect } from 'react';
import { DashboardMetrics, Product, Warehouse } from '../types';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import StockLevelsTable from '../components/inventory/StockLevelsTable';
import InventoryLedger from '../components/inventory/InventoryLedger';
import InventoryOperations from '../components/inventory/InventoryOperations';

const InventoryDashboard: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'overview' | 'stock' | 'ledger' | 'operations'>('overview');
    const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
    const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    const [selectedWarehouse, setSelectedWarehouse] = useState<string>('all');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchWarehouses = async () => {
            try {
                const token = localStorage.getItem('authToken');
                const res = await fetch('http://localhost:3000/inventory/warehouses', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setWarehouses(data);
                }
            } catch (err) {
                console.error("Failed to fetch warehouses", err);
            }
        };
        fetchWarehouses();
    }, []);

    useEffect(() => {
        if (activeTab !== 'overview') return;

        const fetchMetrics = async () => {
            try {
                const url = selectedWarehouse === 'all'
                    ? 'http://localhost:3000/inventory/dashboard'
                    : `http://localhost:3000/inventory/dashboard?warehouseId=${selectedWarehouse}`;

                const token = localStorage.getItem('authToken');
                const res = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setMetrics(data);
                }
            } catch (err) {
                console.error("Failed to fetch metrics", err);
            }
        };

        const fetchProducts = async () => {
            try {
                const token = localStorage.getItem('authToken');
                const res = await fetch('http://localhost:3000/products', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    const low = data.filter((p: Product) => (p.stockLevel || 0) <= (p.reorderPoint || 10));
                    setLowStockProducts(low);
                }
            } catch (err) {
                console.error("Failed to fetch products", err);
            }
        };

        setLoading(true);
        Promise.all([fetchMetrics(), fetchProducts()]).finally(() => setLoading(false));
    }, [selectedWarehouse, activeTab]);

    const COLORS = ['#0088FE', '#FFBB28', '#FF8042'];

    const pieData = metrics ? [
        { name: 'Healthy', value: Math.max(0, metrics.totalProducts - metrics.lowStockCount - metrics.outOfStockCount) },
        { name: 'Low Stock', value: metrics.lowStockCount },
        { name: 'Out of Stock', value: metrics.outOfStockCount },
    ] : [];

    return (
        <div className="p-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <h1 className="text-2xl font-bold text-white">Inventory Management</h1>

                <div className="flex items-center gap-4">
                    {/* Warehouse Selector */}
                    <div className="flex items-center gap-2">
                        <span className="text-gray-400 text-sm">Warehouse:</span>
                        <select
                            className="bg-[#1c2d3d] border border-[#2d445a] text-white text-sm rounded-lg p-2.5 focus:ring-primary focus:border-primary"
                            value={selectedWarehouse}
                            onChange={(e) => setSelectedWarehouse(e.target.value)}
                        >
                            <option value="all">All Warehouses</option>
                            {warehouses.map(w => (
                                <option key={w.id} value={w.id}>{w.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border-dark mb-6">
                <button
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'overview'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-gray-400 hover:text-white'
                        }`}
                    onClick={() => setActiveTab('overview')}
                >
                    Overview
                </button>
                <button
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'stock'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-gray-400 hover:text-white'
                        }`}
                    onClick={() => setActiveTab('stock')}
                >
                    Stock Levels
                </button>
                <button
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'ledger'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-gray-400 hover:text-white'
                        }`}
                    onClick={() => setActiveTab('ledger')}
                >
                    Ledger
                </button>
                <button
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'operations'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-gray-400 hover:text-white'
                        }`}
                    onClick={() => setActiveTab('operations')}
                >
                    Operations
                </button>
            </div>

            {activeTab === 'overview' && (
                <>
                    {loading && !metrics ? (
                        <div className="text-white">Loading Inventory Dashboard...</div>
                    ) : (
                        <>
                            {/* KPI Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                                <div className="bg-card-dark p-6 rounded-lg shadow-sm border border-border-dark">
                                    <p className="text-gray-400 text-sm">Total Inventory Value</p>
                                    <p className="text-2xl font-bold text-white">
                                        ${metrics?.totalInventoryValue?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                                    </p>
                                </div>
                                <div className="bg-card-dark p-6 rounded-lg shadow-sm border border-border-dark">
                                    <p className="text-gray-400 text-sm">Low Stock Items</p>
                                    <p className="text-2xl font-bold text-orange-500">{metrics?.lowStockCount || 0}</p>
                                </div>
                                <div className="bg-card-dark p-6 rounded-lg shadow-sm border border-border-dark">
                                    <p className="text-gray-400 text-sm">Out of Stock</p>
                                    <p className="text-2xl font-bold text-red-500">{metrics?.outOfStockCount || 0}</p>
                                </div>
                                <div className="bg-card-dark p-6 rounded-lg shadow-sm border border-border-dark">
                                    <p className="text-gray-400 text-sm">Total Products</p>
                                    <p className="text-2xl font-bold text-blue-400">{metrics?.totalProducts || 0}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                {/* Stock Status Chart */}
                                <div className="bg-card-dark p-6 rounded-lg shadow-sm border border-border-dark h-96">
                                    <h3 className="text-lg font-semibold mb-4 text-white">Stock Status Distribution</h3>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={pieData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={60}
                                                outerRadius={80}
                                                fill="#8884d8"
                                                paddingAngle={5}
                                                dataKey="value"
                                            >
                                                {pieData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip contentStyle={{ backgroundColor: '#1c2d3d', borderColor: '#2d445a', color: '#fff' }} />
                                            <Legend verticalAlign="bottom" height={36} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>

                                {/* Low Stock Alerts */}
                                <div className="bg-card-dark p-6 rounded-lg shadow-sm border border-border-dark">
                                    <h3 className="text-lg font-semibold mb-4 text-white">Low Stock Alerts</h3>
                                    <div className="overflow-auto max-h-80 custom-scrollbar">
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="text-gray-400 text-sm border-b border-border-dark">
                                                    <th className="pb-2">Product</th>
                                                    <th className="pb-2">SKU</th>
                                                    <th className="pb-2 text-right">Stock</th>
                                                    <th className="pb-2 text-right">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {lowStockProducts.map(product => (
                                                    <tr key={product.id} className="border-b last:border-0 border-border-dark hover:bg-[#2d445a]/50 transition-colors">
                                                        <td className="py-2 text-sm font-medium text-white">{product.name}</td>
                                                        <td className="py-2 text-sm text-gray-400">{product.sku}</td>
                                                        <td className="py-2 text-sm text-right font-bold text-white">{product.stockLevel}</td>
                                                        <td className="py-2 text-sm text-right">
                                                            <span className={`px-2 py-1 rounded-full text-xs ${(product.stockLevel || 0) === 0 ? 'bg-red-900/50 text-red-200' : 'bg-orange-900/50 text-orange-200'
                                                                }`}>
                                                                {(product.stockLevel || 0) === 0 ? 'Out of Stock' : 'Low Stock'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {lowStockProducts.length === 0 && (
                                                    <tr>
                                                        <td colSpan={4} className="py-4 text-center text-gray-400">All stock levels healthy</td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </>
            )}

            {activeTab === 'stock' && (
                <StockLevelsTable selectedWarehouse={selectedWarehouse} />
            )}

            {activeTab === 'ledger' && (
                <InventoryLedger selectedWarehouse={selectedWarehouse} />
            )}

            {activeTab === 'operations' && (
                <InventoryOperations warehouses={warehouses} />
            )}
        </div>
    );
};

export default InventoryDashboard;
