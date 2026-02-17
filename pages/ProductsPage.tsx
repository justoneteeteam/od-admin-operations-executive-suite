
import React from 'react';
import { Product } from '../types';
import { productsService } from '../src/services/products.service';
import { fulfillmentService } from '../src/services/fulfillment.service';
import { ProductModal } from '../src/components/ProductModal';

interface FulfillmentCenter {
  id: string;
  name: string;
  location?: string;
  status?: string;
}

const ProductsPage: React.FC = () => {
  const [products, setProducts] = React.useState<Product[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [fulfillmentCenters, setFulfillmentCenters] = React.useState<FulfillmentCenter[]>([]);

  // Modal state
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [productToEdit, setProductToEdit] = React.useState<Product | null>(null);

  React.useEffect(() => {
    fetchProducts();
    fetchFulfillmentCenters();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const data = await productsService.getAll();
      const productList = Array.isArray(data) ? data : (data.data || []);
      setProducts(productList);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch products:', err);
      setError('Failed to load products. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchFulfillmentCenters = async () => {
    try {
      const data = await fulfillmentService.getAll();
      const fcList = Array.isArray(data) ? data : (data.data || []);
      setFulfillmentCenters(fcList);
    } catch (err) {
      console.error('Failed to fetch fulfillment centers:', err);
    }
  };

  // Open create modal
  const openCreateModal = () => {
    setProductToEdit(null);
    setIsModalOpen(true);
  };

  // Open edit modal
  const openEditModal = (product: Product) => {
    setProductToEdit(product);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setProductToEdit(null);
  };

  const handleModalSuccess = (product: Product) => {
    fetchProducts();
  };

  // Delete product
  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this product?')) return;
    try {
      await productsService.delete(id);
      fetchProducts();
    } catch (err) {
      console.error('Failed to delete product:', err);
      setError('Failed to delete product.');
    }
  };

  const calculateStockStatus = (stockLevel: number, reorderPoint: number = 10) => {
    if (stockLevel <= 0) return 'Out of Stock';
    if (stockLevel <= reorderPoint) return 'Low Stock';
    return 'Healthy';
  };

  const getStockStatusColor = (status: string) => {
    switch (status) {
      case 'Healthy': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'Low Stock': return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
      case 'Out of Stock':
      case 'Critical': return 'bg-red-500/10 text-red-400 border-red-500/20';
      default: return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    }
  };

  const getFCName = (product: Product) => {
    if (product.fulfillmentCenter && typeof product.fulfillmentCenter === 'object') {
      return product.fulfillmentCenter.name || 'Unknown';
    }
    if (product.fulfillmentCenterId) {
      const fc = fulfillmentCenters.find(f => f.id === product.fulfillmentCenterId);
      return fc ? fc.name : 'Unknown';
    }
    return 'Unassigned';
  };

  if (loading && !isModalOpen) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-white">Loading products...</div>
      </div>
    );
  }

  if (error && !isModalOpen) {
    return (
      <div className="flex items-center justify-center h-64 text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 relative">
      <ProductModal
        isOpen={isModalOpen}
        onClose={closeModal}
        onSuccess={handleModalSuccess}
        productToEdit={productToEdit}
      />

      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-text-muted text-sm font-medium">Home</span>
          <span className="text-text-muted text-sm">/</span>
          <span className="text-white text-sm font-medium">Inventory & Cost</span>
        </div>
        <div className="flex flex-wrap justify-between items-end gap-4 mt-2">
          <div className="flex flex-col gap-1">
            <h1 className="text-white text-3xl font-black tracking-tight">Product Inventory & Cost</h1>
            <p className="text-text-muted text-sm">Review stock levels, unit costs, and SKU performance metrics.</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={openCreateModal}
              className="flex items-center justify-center rounded-lg h-10 px-4 bg-primary text-white text-sm font-bold hover:bg-primary/90"
            >
              <span className="material-symbols-outlined mr-2" style={{ fontSize: '18px' }}>add</span>
              Add Product
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#111a22] rounded-xl border border-border-dark overflow-hidden flex flex-col">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[1200px]">
            <thead>
              <tr className="bg-[#17232f] border-b border-[#233648]">
                <th className="px-6 py-4 text-text-muted font-bold text-xs uppercase tracking-wider w-20">Image</th>
                <th className="px-6 py-4 text-text-muted font-bold text-xs uppercase tracking-wider">Product & SKU</th>
                <th className="px-6 py-4 text-text-muted font-bold text-xs uppercase tracking-wider">Fulfillment</th>
                <th className="px-6 py-4 text-text-muted font-bold text-xs uppercase tracking-wider text-center">Unit Cost</th>
                <th className="px-6 py-4 text-text-muted font-bold text-xs uppercase tracking-wider text-center">Stock Level</th>
                <th className="px-6 py-4 text-text-muted font-bold text-xs uppercase tracking-wider text-center">Stock Status</th>
                <th className="px-6 py-4 text-text-muted font-bold text-xs uppercase tracking-wider text-center">Return Rate</th>
                <th className="px-6 py-4 text-text-muted font-bold text-xs uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#233648]">
              {products.map((product) => {
                const stockStatus = calculateStockStatus(product.stockLevel, product.reorderPoint);
                const imgUrl = (product as any).primaryImageUrl || ((product as any).imagesUrls ? (() => { try { return JSON.parse((product as any).imagesUrls)[0]; } catch { return null; } })() : null);
                return (
                  <tr key={product.id} className="hover:bg-[#1c2d3d] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="size-12 rounded border border-border-dark bg-center bg-cover overflow-hidden bg-gray-800 flex items-center justify-center">
                        {imgUrl ? (
                          <img src={imgUrl} alt={product.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="material-symbols-outlined text-text-muted">image</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold text-white leading-tight">{product.name}</p>
                      <p className="text-[11px] font-mono text-text-muted mt-1 uppercase">{product.sku}</p>
                    </td>
                    <td className="px-6 py-4"><span className="text-sm text-white">{getFCName(product)}</span></td>
                    <td className="px-6 py-4 text-center"><span className="text-sm font-bold text-white">${Number(product.unitCost || 0).toFixed(2)}</span></td>
                    <td className="px-6 py-4 text-center"><span className="text-sm font-bold text-white">{(product.stockLevel || 0).toLocaleString()}</span></td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest border ${getStockStatusColor(stockStatus)}`}>
                        {stockStatus}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-col items-center">
                        <span className={`px-3 py-1 rounded text-sm font-bold ${Number(product.returnRate || 0) > 10 ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                          {Number(product.returnRate || 0)}%
                        </span>
                        <span className="text-[10px] text-text-muted mt-1">Global: {Number(product.globalRate || 0)}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEditModal(product)}
                          className="p-2 hover:bg-[#233648] rounded text-text-muted hover:text-blue-400 transition-colors"
                          title="Edit product"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>edit</span>
                        </button>
                        <button
                          onClick={() => handleDelete(product.id)}
                          className="p-2 hover:bg-[#233648] rounded text-text-muted hover:text-red-400 transition-colors"
                          title="Delete product"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {products.length === 0 && (
            <div className="p-8 text-center text-text-muted">No products found. Add your first product to get started.</div>
          )}
        </div>
        <div className="bg-[#17232f] px-6 py-4 border-t border-border-dark flex items-center justify-between">
          <p className="text-xs text-[#92adc9]">Showing <span className="text-white font-bold">{products.length}</span> products</p>
        </div>
      </div>
    </div>
  );
};

export default ProductsPage;
