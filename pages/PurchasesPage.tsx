import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { purchasesService } from '../src/services/purchases.service';
import { suppliersService, Supplier } from '../src/services/suppliers.service';
import { fulfillmentService, FulfillmentCenter } from '../src/services/fulfillment.service';
import { productsService, Product } from '../src/services/products.service';
import { Purchase, PurchaseItem } from '../types';
import { ProductSearch } from '../src/components/ProductSearch';
import { ProductModal } from '../src/components/ProductModal';

const PurchasesPage: React.FC = () => {
  const navigate = useNavigate();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [fulfillmentCenters, setFulfillmentCenters] = useState<FulfillmentCenter[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [showDrawer, setShowDrawer] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    supplierId: '',
    fulfillmentCenterId: '',
    warehouseId: '',
    date: new Date().toISOString().split('T')[0],
    reference: '',
    items: [] as PurchaseItem[],
    globalTax: 0,
    globalDiscount: 0,
    shippingCost: 0,
    purchaseStatus: 'Ordered',
    notes: ''
  });
  /* ... existing state ... */
  const [editingId, setEditingId] = useState<string | null>(null);

  // Product Creation Modal State
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);

  // Derived state for warehouses based on selected FC
  const availableWarehouses = useMemo(() => {
    if (!formData.fulfillmentCenterId) return [];
    const fc = fulfillmentCenters.find(c => c.id === formData.fulfillmentCenterId);
    return fc?.warehouses || [];
  }, [formData.fulfillmentCenterId, fulfillmentCenters]);


  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [purchasesData, suppliersData, centersData] = await Promise.all([
        purchasesService.getAll(),
        suppliersService.getAll(),
        fulfillmentService.getAll()
      ]);
      setPurchases(Array.isArray(purchasesData) ? purchasesData : purchasesData.data || []);
      setSuppliers(Array.isArray(suppliersData) ? suppliersData : suppliersData.data || []);
      setFulfillmentCenters(Array.isArray(centersData) ? centersData : centersData.data || []);
    } catch (error) {
      console.error("Failed to load data", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddPurchase = () => {
    setFormData({
      supplierId: '',
      fulfillmentCenterId: '',
      warehouseId: '',
      date: new Date().toISOString().split('T')[0],
      reference: '',
      items: [],
      globalTax: 0,
      globalDiscount: 0,
      shippingCost: 0,
      purchaseStatus: 'Ordered',
      notes: ''
    });

    setEditingId(null);
    setShowDrawer(true);
  };

  const handleEditPurchase = (purchase: Purchase) => {
    setEditingId(purchase.id);
    setFormData({
      supplierId: purchase.supplierId,
      fulfillmentCenterId: purchase.fulfillmentCenterId,
      warehouseId: purchase.warehouseId || '',
      date: new Date(purchase.orderDate).toISOString().split('T')[0],
      reference: purchase.purchaseOrderNumber,
      items: (purchase.items as any[]).map(item => ({
        ...item,
        id: item.id,
        qty: item.quantity,
        totalCost: item.subtotal
      })),
      globalTax: Number(purchase.purchaseTaxAmount) || 0,
      globalDiscount: Number(purchase.purchaseDiscountAmount || 0), // Assuming not mapped in type but backend has it
      shippingCost: Number(purchase.purchaseShippingCost) || 0,
      purchaseStatus: purchase.purchaseStatus,
      notes: purchase.notes || ''
    });
    setShowDrawer(true);
  };

  const handleCreateProduct = () => {
    setIsProductModalOpen(true);
  };

  const handleProductCreated = (product: Product) => {
    // Add the newly created product to the items list
    console.log("Newly created product:", product);
    const newItem: PurchaseItem = {
      id: Math.random().toString(36).substr(2, 9),
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      qty: 1,
      purchasePrice: product.unitCost || 0,
      discount: 0,
      taxPercent: 0,
      taxAmount: 0,
      unitCost: product.unitCost || 0, // Synced Cost
      totalCost: product.unitCost || 0
    };
    setFormData(prev => ({ ...prev, items: [...prev.items, newItem] }));
  };

  const handleProductSelect = (product: Product) => {
    console.log("Selected product:", product);
    // Add new item row
    const newItem: PurchaseItem = {
      id: Math.random().toString(36).substr(2, 9), // Temp ID for UI
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      qty: 1,
      purchasePrice: product.unitCost || 0,
      discount: 0,
      taxPercent: 0,
      taxAmount: 0,
      unitCost: product.unitCost || 0,
      totalCost: product.unitCost || 0
    };
    setFormData(prev => ({ ...prev, items: [...prev.items, newItem] }));
  };

  const updateItem = (index: number, field: keyof PurchaseItem, value: number) => {
    setFormData(prev => {
      const newItems = [...prev.items];
      const item = { ...newItems[index], [field]: value };

      // Recalculate
      // Net Price = Purchase Price - Discount
      const netPrice = item.purchasePrice - item.discount;
      // Tax Amount = Net Price * (Tax% / 100)
      item.taxAmount = netPrice * (item.taxPercent / 100);
      // Unit Cost = Net Price + Tax Amount
      item.unitCost = netPrice + item.taxAmount;
      // Total Cost = Unit Cost * Qty
      item.totalCost = item.unitCost * item.qty;

      newItems[index] = item;
      return { ...prev, items: newItems };
    });
  };

  const removeItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const totals = useMemo(() => {
    const itemsSubtotal = formData.items.reduce((sum, item) => sum + item.totalCost, 0);
    // Apply global modifiers
    // Assuming global tax/discount are amounts for simplicity as per UI input (Order Tax seems like amount)
    // Or if they are percents? UI Input just says "Order Tax".
    // I'll assume constants/amounts.
    const total = itemsSubtotal + Number(formData.shippingCost) - Number(formData.globalDiscount) + Number(formData.globalTax);
    return {
      subtotal: itemsSubtotal,
      total
    };
  }, [formData.items, formData.shippingCost, formData.globalDiscount, formData.globalTax]);

  const handleSave = async () => {
    setIsLoading(true); // Reusing loading state or create new one
    setIsSaving(true);
    try {
      // Validate
      if (!formData.supplierId) { alert("Select Supplier"); return; }
      if (!formData.fulfillmentCenterId) { alert("Select Fulfillment Center"); return; }
      if (formData.items.length === 0) { alert("Add at least one product"); return; }

      const payload = {
        ...formData,
        subtotal: totals.subtotal,
        totalAmount: totals.total,
        purchaseTaxAmount: formData.globalTax,
        purchaseDiscountAmount: formData.globalDiscount,
        purchaseShippingCost: formData.shippingCost, // Add this if missing
        purchaseStatus: formData.purchaseStatus, // Use purchaseStatus
        // Backend expects 'items' with mapped fields
        items: formData.items.map(item => ({
          productId: (item as any).productId,
          quantity: item.qty,
          unitCost: item.unitCost, // Final unit cost
          purchasePrice: item.purchasePrice,
          taxPercent: item.taxPercent,
          purchaseTaxAmount: item.taxAmount,
          discountPercent: 0, // We used discount Amount in UI row.
          purchaseDiscountAmount: item.discount, // Mapping UI 'discount' to backend 'discountAmount'
          subtotal: item.totalCost
        }))
      };

      if (editingId) {
        await purchasesService.update(editingId, payload);
      } else {
        await purchasesService.create(payload);
      }
      setShowDrawer(false);
      fetchData(); // Refresh list
    } catch (error) {
      console.error("Failed to save purchase", error);
      alert("Failed to save");
    } finally {
      setIsSaving(false);
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-text-muted text-sm font-medium">Home</span>
          <span className="text-text-muted text-sm">/</span>
          <span className="text-white text-sm font-medium">Procurement Management</span>
        </div>
        <div className="flex flex-wrap justify-between items-end gap-4 mt-2">
          <div className="flex flex-col gap-1">
            <h1 className="text-white text-4xl font-black tracking-tight">Purchase</h1>
            <p className="text-text-muted text-sm">Manage your purchases and supplier relations.</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleAddPurchase}
              className="flex items-center justify-center rounded-xl h-12 px-6 bg-[#f59e0b] text-white text-sm font-bold hover:bg-[#f59e0b]/90 transition-all shadow-lg shadow-orange-500/20"
            >
              <span className="material-symbols-outlined mr-2" style={{ fontSize: '20px' }}>add_circle</span>
              Add Purchase
            </button>
          </div>
        </div>
      </div>

      {/* Main Table (Simplified for brevity, assuming existing table structure) */}
      <div className="bg-[#111a22] rounded-2xl border border-border-dark overflow-hidden flex flex-col shadow-2xl mb-12">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[1200px]">
            <thead>
              <tr className="bg-[#17232f]/50 border-b border-border-dark">
                <th className="px-6 py-5 text-text-muted font-bold text-xs uppercase tracking-wider">Purchase #</th>
                <th className="px-6 py-5 text-text-muted font-bold text-xs uppercase tracking-wider">Supplier</th>
                <th className="px-6 py-5 text-text-muted font-bold text-xs uppercase tracking-wider">Date</th>
                <th className="px-6 py-5 text-text-muted font-bold text-xs uppercase tracking-wider">Status</th>
                <th className="px-6 py-5 text-text-muted font-bold text-xs uppercase tracking-wider">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-dark/40">
              {purchases.map((purchase) => (
                <tr key={purchase.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 text-sm font-mono text-white">{purchase.purchaseOrderNumber}</td>
                  <td className="px-6 py-4 text-sm font-semibold text-white">{purchase.supplier?.name || "Unknown"}</td>
                  <td className="px-6 py-4 text-sm text-text-muted">{new Date(purchase.orderDate).toLocaleDateString()}</td>
                  <td className="px-6 py-4">
                    <span className="px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest bg-[#f59e0b]/10 text-[#f59e0b]">
                      {purchase.purchaseStatus}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-white">${Number(purchase.totalAmount).toFixed(2)}</td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleEditPurchase(purchase)}
                      className="text-text-muted hover:text-white transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">edit</span>
                    </button>
                  </td>
                </tr>
              ))}
              {purchases.length === 0 && !isLoading && (
                <tr><td colSpan={5} className="text-center py-8 text-text-muted">No purchases found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Purchase Drawer */}
      {showDrawer && (
        <div className="fixed inset-0 z-[100] flex justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDrawer(false)}></div>
          <div className="side-drawer relative w-[1000px] h-full bg-card-dark border-l border-border-dark flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
            <div className="px-8 py-6 border-b border-border-dark flex items-center justify-between bg-[#14202c]">
              <div>
                <h2 className="text-2xl font-black text-white flex items-center gap-2 tracking-tight">
                  {editingId ? 'Edit Purchase' : 'Add Purchase'}
                </h2>
                <p className="text-xs text-text-muted mt-1 uppercase font-bold tracking-widest">
                  {editingId ? 'Update procurement order' : 'Create procurement order'}
                </p>
              </div>
              <button onClick={() => setShowDrawer(false)} className="size-10 flex items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600 transition-all">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-8 pb-20">
              {/* Header Inputs */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">Supplier <span className="text-red-500">*</span></label>
                  <select
                    className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4"
                    value={formData.supplierId}
                    onChange={e => setFormData({ ...formData, supplierId: e.target.value })}
                  >
                    <option value="">Select Supplier</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">Fulfillment Center <span className="text-red-500">*</span></label>
                  <select
                    className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4"
                    value={formData.fulfillmentCenterId}
                    onChange={e => setFormData({ ...formData, fulfillmentCenterId: e.target.value })}
                  >
                    <option value="">Select Fulfillment Center</option>
                    {fulfillmentCenters.map(fc => <option key={fc.id} value={fc.id}>{fc.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">Warehouse</label>
                  <select
                    className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 disabled:opacity-50"
                    value={formData.warehouseId}
                    onChange={e => setFormData({ ...formData, warehouseId: e.target.value })}
                    disabled={!formData.fulfillmentCenterId}
                  >
                    <option value="">Select Warehouse</option>
                    {availableWarehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">Date</label>
                  <input
                    type="date"
                    className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4"
                    value={formData.date}
                    onChange={e => setFormData({ ...formData, date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">Ref #</label>
                  <input
                    className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4"
                    value={formData.reference}
                    onChange={e => setFormData({ ...formData, reference: e.target.value })}
                    placeholder="PO Reference"
                  />
                </div>
              </div>

              {/* Products */}
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">Items</label>
                  <button
                    onClick={handleCreateProduct}
                    className="text-primary text-xs font-bold hover:underline flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-sm">add</span>
                    Create New Product
                  </button>
                </div>
                <ProductSearch onSelect={handleProductSelect} />

                <div className="bg-[#111a22] rounded-2xl border border-border-dark overflow-hidden mt-6">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[1000px]">
                      <thead>
                        <tr className="bg-[#17232f]/80 border-b border-border-dark">
                          <th className="px-4 py-3 text-text-muted font-bold text-[10px] uppercase">Product</th>
                          <th className="px-4 py-3 text-text-muted font-bold text-[10px] uppercase w-20">Qty</th>
                          <th className="px-4 py-3 text-text-muted font-bold text-[10px] uppercase w-24">Price($)</th>
                          <th className="px-4 py-3 text-text-muted font-bold text-[10px] uppercase w-24">Disc($)</th>
                          <th className="px-4 py-3 text-text-muted font-bold text-[10px] uppercase w-20">Tax(%)</th>
                          <th className="px-4 py-3 text-text-muted font-bold text-[10px] uppercase">Tax Amt</th>
                          <th className="px-4 py-3 text-text-muted font-bold text-[10px] uppercase">Unit Cost</th>
                          <th className="px-4 py-3 text-text-muted font-bold text-[10px] uppercase">Total</th>
                          <th className="px-4 py-3 w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-dark/40">
                        {formData.items.map((item, index) => (
                          <tr key={item.id || index} className="group hover:bg-[#1c2d3d]/50">
                            <td className="px-4 py-3">
                              <p className="text-sm font-bold text-white">{item.productName}</p>
                              <p className="text-xs text-text-muted">{item.sku}</p>
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                className="w-full bg-[#1c2d3d] border border-[#2d445a] rounded px-2 py-1 text-white text-xs"
                                value={item.qty}
                                onChange={e => updateItem(index, 'qty', parseFloat(e.target.value) || 0)}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                className="w-full bg-[#1c2d3d] border border-[#2d445a] rounded px-2 py-1 text-white text-xs"
                                value={item.purchasePrice}
                                onChange={e => updateItem(index, 'purchasePrice', parseFloat(e.target.value) || 0)}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                className="w-full bg-[#1c2d3d] border border-[#2d445a] rounded px-2 py-1 text-white text-xs"
                                value={item.discount}
                                onChange={e => updateItem(index, 'discount', parseFloat(e.target.value) || 0)}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                className="w-full bg-[#1c2d3d] border border-[#2d445a] rounded px-2 py-1 text-white text-xs"
                                value={item.taxPercent}
                                onChange={e => updateItem(index, 'taxPercent', parseFloat(e.target.value) || 0)}
                              />
                            </td>
                            <td className="px-4 py-3 text-sm text-text-muted">${item.taxAmount.toFixed(2)}</td>
                            <td className="px-4 py-3 text-sm text-text-muted">${item.unitCost.toFixed(2)}</td>
                            <td className="px-4 py-3 text-sm font-bold text-white">${item.totalCost.toFixed(2)}</td>
                            <td className="px-4 py-3 text-center">
                              <button onClick={() => removeItem(index)} className="text-red-500 hover:text-red-400">
                                <span className="material-symbols-outlined text-lg">delete</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                        {formData.items.length === 0 && (
                          <tr><td colSpan={9} className="text-center py-8 text-text-muted italic">No items added</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Footer Inputs */}
              <div className="grid grid-cols-4 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">Global Tax($)</label>
                  <input type="number"
                    className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4"
                    value={formData.globalTax}
                    onChange={e => setFormData({ ...formData, globalTax: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">Global Discount($)</label>
                  <input type="number"
                    className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4"
                    value={formData.globalDiscount}
                    onChange={e => setFormData({ ...formData, globalDiscount: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">Shipping Cost($)</label>
                  <input type="number"
                    className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4"
                    value={formData.shippingCost}
                    onChange={e => setFormData({ ...formData, shippingCost: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">Status</label>
                  <select
                    className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4"
                    value={formData.purchaseStatus}
                    onChange={e => setFormData({ ...formData, purchaseStatus: e.target.value })}
                  >
                    <option>Ordered</option>
                    <option>Pending</option>
                    <option>Received</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-12 text-right pt-4 border-t border-border-dark/50">
                <div>
                  <p className="text-xs text-text-muted uppercase font-bold">Items Subtotal</p>
                  <p className="text-xl font-bold text-white">${totals.subtotal.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted uppercase font-bold">Grand Total</p>
                  <p className="text-3xl font-black text-emerald-400">${totals.total.toFixed(2)}</p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="p-8 bg-[#17232f] border-t border-border-dark flex gap-4 sticky bottom-0 z-[110] shadow-2xl">
              <button
                onClick={() => setShowDrawer(false)}
                className="flex-1 h-14 bg-[#111a22] hover:bg-[#1c2d3d] text-white text-sm font-black uppercase tracking-widest rounded-xl transition-all border border-border-dark"
              >
                Discard
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-[2] h-14 bg-primary hover:bg-primary/90 text-white text-sm font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 shadow-xl shadow-primary/20 disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : (editingId ? 'Update Purchase' : 'Save Purchase')}
              </button>
            </div>

          </div>
        </div>
      )}
      {/* Product Creation Modal */}
      <ProductModal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        onSuccess={handleProductCreated}
        initialValues={{
          supplierId: formData.supplierId,
          fulfillmentCenterId: formData.fulfillmentCenterId
        }}
      />
    </div>
  );
};

export default PurchasesPage;
