
import React from 'react';
import { Product } from '../types';
import { productsService } from '../src/services/products.service';
import { fulfillmentService } from '../src/services/fulfillment.service';
import { inventoryService } from '../src/services/inventory.service';
import { ProductModal } from '../src/components/ProductModal';
import ProductDetailDashboard from '../components/inventory/ProductDetailDashboard';

interface FulfillmentCenter {
  id: string;
  name: string;
  location?: string;
  status?: string;
}

interface ProductStock {
  id: string;
  currentStock: number;
  reservedStock: number;
  outboundQty: number;
  returningQty: number;
  warehouseBreakdown: any[];
}

const ProductsPage: React.FC = () => {
  const [products, setProducts] = React.useState<Product[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [fulfillmentCenters, setFulfillmentCenters] = React.useState<FulfillmentCenter[]>([]);
  const [stockMap, setStockMap] = React.useState<Map<string, ProductStock>>(new Map());

  // Modal state
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [productToEdit, setProductToEdit] = React.useState<Product | null>(null);

  // Detail Drawer state
  const [isDetailOpen, setIsDetailOpen] = React.useState(false);
  const [productForDetail, setProductForDetail] = React.useState<Product | null>(null);

  // Multi-select state
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  // Search
  const [searchTerm, setSearchTerm] = React.useState('');

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredProducts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProducts.map(p => p.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} product(s)? This cannot be undone.`)) return;
    try {
      await productsService.deleteMany(Array.from(selectedIds));
      setSelectedIds(new Set());
      fetchProducts();
    } catch (err) {
      console.error('Bulk delete failed:', err);
      setError('Failed to delete selected products.');
    }
  };

  React.useEffect(() => {
    fetchProducts();
    fetchFulfillmentCenters();
    fetchStockLevels();
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

  const fetchStockLevels = async () => {
    try {
      const data = await inventoryService.getStock();
      const map = new Map<string, ProductStock>();
      for (const item of data) {
        map.set(item.id, {
          id: item.id,
          currentStock: item.currentStock || 0,
          reservedStock: item.reservedStock || 0,
          outboundQty: item.outboundQty || 0,
          returningQty: item.returningQty || 0,
          warehouseBreakdown: item.warehouseBreakdown || [],
        });
      }
      setStockMap(map);
    } catch (err) {
      console.error('Failed to fetch stock levels:', err);
    }
  };

  // Open create modal
  const openCreateModal = () => {
    setProductToEdit(null);
    setIsModalOpen(true);
  };

  const openDetailDrawer = (product: Product) => {
    setProductForDetail(product);
    setIsDetailOpen(true);
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
    fetchStockLevels();
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

  const getStockStatus = (onHand: number, reorderPoint: number = 10) => {
    if (onHand <= 0) return { label: 'Out of Stock', color: 'bg-red-500/10 text-red-400 border-red-500/20' };
    if (onHand <= reorderPoint) return { label: 'Low Stock', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' };
    return { label: 'Healthy', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
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

  // Filter products by search
  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getProductImgUrl = (product: Product) => {
    return (product as any).primaryImageUrl || ((product as any).imagesUrls ? (() => { try { return JSON.parse((product as any).imagesUrls)[0]; } catch { return null; } })() : null);
  };

  if (loading && !isModalOpen) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-on-surface">Loading products...</div>
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
    <div className="flex flex-col gap-4 sm:gap-6 relative">
      <ProductModal
        isOpen={isModalOpen}
        onClose={closeModal}
        onSuccess={handleModalSuccess}
        productToEdit={productToEdit}
      />

      <ProductDetailDashboard
        isOpen={isDetailOpen}
        product={productForDetail}
        onClose={() => { setIsDetailOpen(false); fetchStockLevels(); }}
        onEdit={(p) => { setIsDetailOpen(false); openEditModal(p); }}
      />

      {/* CRM Compact Header – responsive */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 mb-1 sm:mb-2 border-b border-border-dark/60 gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-1 text-[11px] text-text-muted">
            <span>Home</span><span className="opacity-40">/</span>
            <span className="text-on-surface font-semibold">Products</span>
          </div>
          <span className="w-px h-3 bg-border-dark opacity-60 hidden sm:block" />
          <h1 className="text-sm font-bold text-on-surface hidden sm:block">Product Inventory & Cost</h1>
          <span className="text-[11px] text-text-muted">{filteredProducts.length} products</span>
        </div>
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          <div className="flex h-[34px] border border-border-dark rounded overflow-hidden flex-1 sm:flex-none">
            <span className="material-symbols-outlined flex items-center px-2 text-text-muted" style={{ fontSize: '14px' }}>search</span>
            <input type="text" placeholder="Search name or SKU..." className="h-full pr-3 w-full sm:w-44 bg-surface-lowest text-on-surface text-[11px] placeholder:text-text-muted/50 focus:outline-none" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <button onClick={openCreateModal} className="flex items-center gap-1 h-[30px] px-3 rounded bg-primary text-white text-[11px] font-bold hover:bg-primary/90 transition-all whitespace-nowrap shrink-0">
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>add</span>
            <span className="hidden xs:inline">Add Product</span>
            <span className="xs:hidden">Add</span>
          </button>
        </div>
      </div>

      {/* ── Desktop Table (hidden on mobile) ── */}
      <div className="bg-surface-lowest rounded border border-border-dark overflow-hidden flex-col hidden md:flex">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[1400px]">
            <thead>
              <tr className="bg-surface-container border-b border-outline-variant">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={filteredProducts.length > 0 && selectedIds.size === filteredProducts.length}
                    onChange={toggleSelectAll}
                    className="accent-primary w-4 h-4 cursor-pointer"
                  />
                </th>
                <th className="px-3 py-3 text-text-muted font-bold text-[10px] uppercase tracking-wider w-12">Img</th>
                <th className="px-3 py-3 text-text-muted font-bold text-[10px] uppercase tracking-wider">Product & SKU</th>
                <th className="px-3 py-3 text-text-muted font-bold text-[10px] uppercase tracking-wider text-center">Unit Cost</th>
                <th className="px-3 py-3 text-text-muted font-bold text-[10px] uppercase tracking-wider text-center">On Hand</th>
                <th className="px-3 py-3 text-text-muted font-bold text-[10px] uppercase tracking-wider text-center">Committed</th>
                <th className="px-3 py-3 text-text-muted font-bold text-[10px] uppercase tracking-wider text-center">Available</th>
                <th className="px-3 py-3 text-text-muted font-bold text-[10px] uppercase tracking-wider text-center">In Transit</th>
                <th className="px-3 py-3 text-text-muted font-bold text-[10px] uppercase tracking-wider text-center">Returning</th>
                <th className="px-3 py-3 text-text-muted font-bold text-[10px] uppercase tracking-wider text-center">Status</th>
                <th className="px-3 py-3 text-text-muted font-bold text-[10px] uppercase tracking-wider text-center">Return %</th>
                <th className="px-3 py-3 text-text-muted font-bold text-[10px] uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {filteredProducts.map((product) => {
                const stock = stockMap.get(product.id);
                const onHand = stock ? stock.currentStock : (product.stockLevel || 0);
                const committed = stock ? stock.reservedStock : 0;
                const available = onHand - committed;
                const inTransit = stock ? stock.outboundQty : 0;
                const returning = stock ? stock.returningQty : 0;
                const stockStatus = getStockStatus(onHand, product.reorderPoint);
                const imgUrl = getProductImgUrl(product);

                return (
                  <tr 
                    key={product.id} 
                    className={`hover:bg-surface-high transition-colors group cursor-pointer ${selectedIds.has(product.id) ? 'bg-primary/[0.06]' : ''}`}
                    onClick={() => openDetailDrawer(product)}
                  >
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(product.id)}
                        onChange={() => toggleSelect(product.id)}
                        className="accent-primary w-4 h-4 cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="size-10 rounded border border-border-dark bg-center bg-cover overflow-hidden bg-surface-high flex items-center justify-center">
                        {imgUrl ? (
                          <img src={imgUrl} alt={product.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="material-symbols-outlined text-text-muted text-[16px]">image</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-sm font-bold text-on-surface leading-tight">{product.name}</p>
                      <p className="text-[10px] font-mono text-text-muted mt-0.5 uppercase">{product.sku}</p>
                      {stock?.warehouseBreakdown?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {stock.warehouseBreakdown
                            .filter((wh: any) => wh.partnerSku || wh.partnerSkuName)
                            .map((wh: any, i: number) => (
                              <span
                                key={i}
                                className="px-1 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded text-[8px] font-mono"
                                title={`${wh.warehouseName}: ${wh.partnerSkuName || ''} (${wh.partnerSku || 'no code'})`}
                              >
                                {wh.partnerSkuName || wh.partnerSku}
                              </span>
                            ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="text-sm font-bold text-on-surface">€{Number(product.unitCost || 0).toFixed(2)}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="text-sm font-bold text-on-surface">{onHand.toLocaleString()}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`text-sm font-bold ${committed > 0 ? 'text-orange-400' : 'text-text-muted'}`}>
                        {committed}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`text-sm font-bold ${available > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {available}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`text-sm font-bold ${inTransit > 0 ? 'text-blue-400' : 'text-text-muted'}`}>
                        {inTransit}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`text-sm font-bold ${returning > 0 ? 'text-purple-400' : 'text-text-muted'}`}>
                        {returning}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${stockStatus.color}`}>
                        {stockStatus.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex flex-col items-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${Number(product.returnRate || 0) > 10 ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                          {Number(product.returnRate || 0)}%
                        </span>
                        <span className="text-[9px] text-text-muted mt-0.5">Global: {Number(product.globalRate || 0)}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          onClick={() => openEditModal(product)}
                          className="p-1.5 hover:bg-surface-container rounded text-text-muted hover:text-blue-400 transition-colors"
                          title="Edit product"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>edit</span>
                        </button>
                        <button
                          onClick={() => handleDelete(product.id)}
                          className="p-1.5 hover:bg-surface-container rounded text-text-muted hover:text-red-400 transition-colors"
                          title="Delete product"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredProducts.length === 0 && (
            <div className="p-8 text-center text-text-muted">
              {searchTerm ? 'No products match your search.' : 'No products found. Add your first product to get started.'}
            </div>
          )}
        </div>
        <div className="bg-surface-container px-6 py-3 border-t border-border-dark flex items-center justify-between">
          <p className="text-xs text-[#92adc9]">
            Showing <span className="text-on-surface font-bold">{filteredProducts.length}</span>
            {searchTerm && ` of ${products.length}`} products
          </p>
        </div>
      </div>

      {/* ── Mobile Card List (visible only on small screens) ── */}
      <div className="flex flex-col gap-2 md:hidden">
        {/* Select all bar */}
        <div className="flex items-center justify-between px-3 py-2 bg-surface-container rounded border border-border-dark">
          <label className="flex items-center gap-2 text-[11px] text-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={filteredProducts.length > 0 && selectedIds.size === filteredProducts.length}
              onChange={toggleSelectAll}
              className="accent-primary w-3.5 h-3.5"
            />
            Select all
          </label>
          <span className="text-[11px] text-text-muted">{filteredProducts.length} products</span>
        </div>

        {filteredProducts.length === 0 && (
          <div className="p-8 text-center text-text-muted bg-surface-lowest rounded border border-border-dark">
            {searchTerm ? 'No products match your search.' : 'No products found. Add your first product to get started.'}
          </div>
        )}

        {filteredProducts.map((product) => {
          const stock = stockMap.get(product.id);
          const onHand = stock ? stock.currentStock : (product.stockLevel || 0);
          const committed = stock ? stock.reservedStock : 0;
          const available = onHand - committed;
          const inTransit = stock ? stock.outboundQty : 0;
          const returning = stock ? stock.returningQty : 0;
          const stockStatus = getStockStatus(onHand, product.reorderPoint);
          const imgUrl = getProductImgUrl(product);

          return (
            <div
              key={product.id}
              className={`bg-surface-lowest rounded-lg border border-border-dark overflow-hidden transition-colors ${selectedIds.has(product.id) ? 'border-primary/40 bg-primary/[0.03]' : ''}`}
            >
              {/* Card header – image, name, checkbox */}
              <div className="flex items-start gap-3 p-3 cursor-pointer" onClick={() => openDetailDrawer(product)}>
                <div onClick={(e) => e.stopPropagation()} className="pt-0.5">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(product.id)}
                    onChange={() => toggleSelect(product.id)}
                    className="accent-primary w-4 h-4 cursor-pointer"
                  />
                </div>
                <div className="size-12 rounded border border-border-dark bg-surface-high flex items-center justify-center shrink-0 overflow-hidden">
                  {imgUrl ? (
                    <img src={imgUrl} alt={product.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="material-symbols-outlined text-text-muted text-[20px]">image</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-on-surface leading-tight truncate">{product.name}</p>
                      <p className="text-[10px] font-mono text-text-muted mt-0.5 uppercase">{product.sku}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border shrink-0 ${stockStatus.color}`}>
                      {stockStatus.label}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card metrics grid */}
              <div className="grid grid-cols-3 gap-px bg-border-dark/40 border-t border-border-dark/40">
                <div className="bg-surface-lowest px-3 py-2 text-center">
                  <p className="text-[9px] text-text-muted uppercase">Cost</p>
                  <p className="text-sm font-bold text-on-surface">€{Number(product.unitCost || 0).toFixed(2)}</p>
                </div>
                <div className="bg-surface-lowest px-3 py-2 text-center">
                  <p className="text-[9px] text-text-muted uppercase">On Hand</p>
                  <p className="text-sm font-bold text-on-surface">{onHand.toLocaleString()}</p>
                </div>
                <div className="bg-surface-lowest px-3 py-2 text-center">
                  <p className="text-[9px] text-text-muted uppercase">Available</p>
                  <p className={`text-sm font-bold ${available > 0 ? 'text-emerald-500' : 'text-red-500'}`}>{available}</p>
                </div>
                <div className="bg-surface-lowest px-3 py-2 text-center">
                  <p className="text-[9px] text-text-muted uppercase">Committed</p>
                  <p className={`text-sm font-bold ${committed > 0 ? 'text-orange-500' : 'text-text-muted'}`}>{committed}</p>
                </div>
                <div className="bg-surface-lowest px-3 py-2 text-center">
                  <p className="text-[9px] text-text-muted uppercase">In Transit</p>
                  <p className={`text-sm font-bold ${inTransit > 0 ? 'text-blue-500' : 'text-text-muted'}`}>{inTransit}</p>
                </div>
                <div className="bg-surface-lowest px-3 py-2 text-center">
                  <p className="text-[9px] text-text-muted uppercase">Return %</p>
                  <p className={`text-sm font-bold ${Number(product.returnRate || 0) > 10 ? 'text-red-500' : 'text-emerald-500'}`}>{Number(product.returnRate || 0)}%</p>
                </div>
              </div>

              {/* Card actions */}
              <div className="flex items-center justify-end gap-1 px-3 py-2 border-t border-border-dark/40 bg-surface-container/50">
                <button
                  onClick={() => openEditModal(product)}
                  className="p-1.5 hover:bg-surface-container rounded text-text-muted hover:text-blue-500 transition-colors"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>edit</span>
                </button>
                <button
                  onClick={() => handleDelete(product.id)}
                  className="p-1.5 hover:bg-surface-container rounded text-text-muted hover:text-red-500 transition-colors"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating bulk-delete bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-surface-low border border-border-dark rounded-2xl shadow-2xl px-4 sm:px-6 py-3 flex items-center gap-3 sm:gap-4 animate-in slide-in-from-bottom-4 duration-200">
          <span className="text-sm text-on-surface font-bold">{selectedIds.size} selected</span>
          <button
            onClick={handleBulkDelete}
            className="flex items-center gap-2 px-4 sm:px-5 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-xl transition-colors"
          >
            <span className="material-symbols-outlined text-sm">delete</span>
            <span className="hidden sm:inline">Delete Selected</span>
            <span className="sm:hidden">Delete</span>
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-text-muted hover:text-on-surface text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};

export default ProductsPage;
