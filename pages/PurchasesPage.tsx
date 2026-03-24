import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { purchasesService } from '../src/services/purchases.service';
import { suppliersService, Supplier } from '../src/services/suppliers.service';
import { fulfillmentService, FulfillmentCenter } from '../src/services/fulfillment.service';
import { productsService, Product } from '../src/services/products.service';
import { logisticCompaniesService, LogisticCompany } from '../src/services/logistic-companies.service';
import { exchangeRatesService } from '../src/services/ads-campaigns.service';
import { Purchase, PurchaseItem } from '../types';
import { ProductSearch } from '../src/components/ProductSearch';
import { ProductModal } from '../src/components/ProductModal';

const PurchasesPage: React.FC = () => {
  const navigate = useNavigate();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [fulfillmentCenters, setFulfillmentCenters] = useState<FulfillmentCenter[]>([]);
  const [logisticCompanies, setLogisticCompanies] = useState<LogisticCompany[]>([]);
  const [latestVndToEur, setLatestVndToEur] = useState<number>(0);

  const [isLoading, setIsLoading] = useState(true);
  const [showDrawer, setShowDrawer] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // VND Converter local state
  const [vndInput, setVndInput] = useState<string>('');

  // Form State
  const [formData, setFormData] = useState({
    supplierId: '',
    fulfillmentCenterId: '',
    warehouseId: '',
    orderDate: new Date().toISOString().split('T')[0],
    fulfillmentRef: '',
    trackingNumber: '',
    logisticCompanyIds: [] as string[],
    items: [] as PurchaseItem[],
    purchaseStatus: 'Ordered',
    notes: ''
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  // Product Creation Modal State
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);

  // Export dropdown
  const [exportOpenId, setExportOpenId] = useState<string | null>(null);

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === purchases.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(purchases.map(p => p.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} purchase(s)? This cannot be undone.`)) return;
    try {
      await purchasesService.deleteMany(Array.from(selectedIds));
      setSelectedIds(new Set());
      fetchData();
    } catch (error) {
      console.error('Bulk delete failed:', error);
      alert('Failed to delete selected purchases');
    }
  };

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
      const [purchasesData, suppliersData, centersData, logisticsData, ratesData] = await Promise.all([
        purchasesService.getAll(),
        suppliersService.getAll(),
        fulfillmentService.getAll(),
        logisticCompaniesService.getAll(),
        exchangeRatesService.getAll()
      ]);
      setPurchases(Array.isArray(purchasesData) ? purchasesData : purchasesData.data || []);
      setSuppliers(Array.isArray(suppliersData) ? suppliersData : suppliersData.data || []);
      setFulfillmentCenters(Array.isArray(centersData) ? centersData : centersData.data || []);
      setLogisticCompanies(Array.isArray(logisticsData) ? logisticsData : []);
      // Get latest exchange rate (VND → EUR)
      if (ratesData && ratesData.length > 0) {
        const sorted = [...ratesData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setLatestVndToEur(Number(sorted[0].vndToEur) || 0);
      }
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
      orderDate: new Date().toISOString().split('T')[0],
      fulfillmentRef: '',
      trackingNumber: '',
      logisticCompanyIds: [],
      items: [],
      purchaseStatus: 'Ordered',
      notes: ''
    });
    setVndInput('');
    setEditingId(null);
    setShowDrawer(true);
  };

  const handleEditPurchase = (purchase: Purchase) => {
    setEditingId(purchase.id);
    setFormData({
      supplierId: purchase.supplierId || '',
      fulfillmentCenterId: purchase.fulfillmentCenterId || '',
      warehouseId: purchase.warehouseId || '',
      orderDate: new Date(purchase.orderDate).toISOString().split('T')[0],
      fulfillmentRef: purchase.fulfillmentRef || '',
      trackingNumber: purchase.trackingNumber || '',
      logisticCompanyIds: (purchase.logisticCompanies || []).map((plc: any) => plc.logisticCompanyId || plc.logisticCompany?.id),
      items: (purchase.items as any[]).map(item => ({
        ...item,
        id: item.id,
        productId: item.productId,
        productName: item.product?.name || item.productName || 'Unknown',
        sku: item.product?.sku || item.sku || 'N/A',
        qty: Number(item.quantity) || 0,
        purchasePrice: Number(item.purchasePrice) || 0,
        discount: Number(item.purchaseDiscountAmount || item.discount) || 0,
        taxPercent: 0,
        taxAmount: 0,
        unitCost: Number(item.unitCost) || 0,
        totalCost: Number(item.subtotal || item.totalCost) || 0,
        domesticShippingFeeCny: Number(item.domesticShippingFeeCny) || 0,
        vndCurrencyRate: Number(item.vndCurrencyRate) || 0,
        parcelKg: Number(item.parcelKg) || 0,
        internationalShippingFeeCny: Number(item.internationalShippingFeeCny) || 0,
        internationalShippingFeeVnd: Number(item.internationalShippingFeeVnd) || 0,
      })),
      purchaseStatus: purchase.purchaseStatus,
      notes: purchase.notes || ''
    });
    setVndInput('');
    setShowDrawer(true);
  };

  const handleCreateProduct = () => {
    setIsProductModalOpen(true);
  };

  const handleProductCreated = (product: Product) => {
    const newItem: PurchaseItem = {
      id: Math.random().toString(36).substr(2, 9),
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      qty: 1,
      purchasePrice: Number(product.unitCost) || 0,
      discount: 0,
      taxPercent: 0,
      taxAmount: 0,
      unitCost: 0,
      totalCost: 0,
      domesticShippingFeeCny: 0,
      internationalShippingFeeVnd: 0,
      parcelKg: 0,
    };
    setFormData(prev => ({ ...prev, items: [...prev.items, newItem] }));
  };

  const handleProductSelect = (product: Product) => {
    const newItem: PurchaseItem = {
      id: Math.random().toString(36).substr(2, 9),
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      qty: 1,
      purchasePrice: Number(product.unitCost) || 0,
      discount: 0,
      taxPercent: 0,
      taxAmount: 0,
      unitCost: 0,
      totalCost: 0,
      domesticShippingFeeCny: 0,
      internationalShippingFeeVnd: 0,
      parcelKg: 0,
    };
    setFormData(prev => ({ ...prev, items: [...prev.items, newItem] }));
  };

  const updateItem = (index: number, field: keyof PurchaseItem, value: number) => {
    setFormData(prev => {
      const newItems = [...prev.items];
      const item = { ...newItems[index], [field]: value };

      // Formula: Total(VND) = (qty × productCost) + domesticShipping + internationalShipping - discount
      const qty = Number(item.qty) || 0;
      const productCost = Number(item.purchasePrice) || 0;
      const domShip = Number(item.domesticShippingFeeCny) || 0;
      const intlShip = Number(item.internationalShippingFeeVnd) || 0;
      const discount = Number(item.discount) || 0;

      const totalVnd = (qty * productCost) + domShip + intlShip - discount;
      // Convert VND → EUR using global rate
      const totalEur = latestVndToEur ? totalVnd * latestVndToEur : 0;
      const costPerSkuEur = qty > 0 ? totalEur / qty : 0;

      item.totalCost = totalEur;
      item.unitCost = costPerSkuEur;
      item.taxAmount = 0;
      item.taxPercent = 0;

      newItems[index] = item;
      return { ...prev, items: newItems };
    });
  };

  const updateItemField = (index: number, field: string, value: number) => {
    setFormData(prev => {
      const newItems = [...prev.items];
      newItems[index] = { ...newItems[index], [field]: value };
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
    // Items subtotal in VND (before EUR conversion)
    const itemsSubtotalVnd = formData.items.reduce((sum, item) => {
      const qty = Number(item.qty) || 0;
      const productCost = Number(item.purchasePrice) || 0;
      const domShip = Number(item.domesticShippingFeeCny) || 0;
      const intlShip = Number(item.internationalShippingFeeVnd) || 0;
      const discount = Number(item.discount) || 0;
      return sum + (qty * productCost) + domShip + intlShip - discount;
    }, 0);
    // Grand total in EUR
    const totalEur = formData.items.reduce((sum, item) => sum + item.totalCost, 0);
    return {
      subtotalVnd: itemsSubtotalVnd,
      total: totalEur
    };
  }, [formData.items]);

  const handleSave = async () => {
    if (!formData.supplierId) { alert("Select Supplier"); return; }
    if (!formData.fulfillmentCenterId) { alert("Select Fulfillment Center"); return; }
    if (formData.items.length === 0) { alert("Add at least one product"); return; }

    setIsLoading(true);
    setIsSaving(true);
    try {
      const { fulfillmentRef, trackingNumber, logisticCompanyIds, ...rest } = formData;

      const payload = {
        ...rest,
        fulfillmentRef,
        trackingNumber: trackingNumber || null,
        logisticCompanyIds,
        subtotal: totals.total,
        totalAmount: totals.total,
        purchaseTaxAmount: 0,
        purchaseDiscountAmount: 0,
        purchaseShippingCost: 0,
        purchaseStatus: formData.purchaseStatus,
        items: formData.items.map(item => ({
          productId: (item as any).productId,
          quantity: item.qty,
          unitCost: item.unitCost,
          purchasePrice: item.purchasePrice,
          taxPercent: 0,
          purchaseTaxAmount: 0,
          discountPercent: 0,
          purchaseDiscountAmount: item.discount,
          subtotal: item.totalCost,
          domesticShippingFeeCny: item.domesticShippingFeeCny || 0,
          vndCurrencyRate: latestVndToEur || 0,
          parcelKg: item.parcelKg || 0,
          internationalShippingFeeCny: 0,
          internationalShippingFeeVnd: item.internationalShippingFeeVnd || 0,
        }))
      };

      if (editingId) {
        await purchasesService.update(editingId, payload);
      } else {
        await purchasesService.create(payload);
      }
      setShowDrawer(false);
      fetchData();
    } catch (error) {
      console.error("Failed to save purchase", error);
      alert("Failed to save");
    } finally {
      setIsSaving(false);
      setIsLoading(false);
    }
  };

  // ─── Export Helpers ──────────────────────────────────────────────────────
  const exportInternalInvoice = async (purchase: Purchase) => {
    setExportOpenId(null);
    try {
      const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs' as any);
      const items = (purchase.items || []) as any[];

      const header = [
        ['INTERNAL COMMERCIAL INVOICE'],
        ['Date:', new Date(purchase.orderDate).toLocaleDateString('en-GB')],
        ['Internal Ref:', purchase.purchaseOrderNumber],
        ['Fulfillment Ref:', purchase.fulfillmentRef || '—'],
        ['Tracking #:', purchase.trackingNumber || 'ND'],
        [],
      ];

      const tableHeader = [
        '#', 'SKU', 'Product Name', 'Image', 'FC', 'Qty', 'Specification',
        'Cost (CNY)', 'Domestic Ship (CNY)', 'VND Rate', 'Total VND',
        'Parcel KG', 'Intl Ship (CNY)', 'Intl Ship (VND)', 'Total Cost/SKU'
      ];

      const rows = items.map((item: any, idx: number) => {
        const product = item.product || {};
        const qty = Number(item.quantity || item.qty) || 0;
        const unitCost = Number(item.unitCost) || 0;
        const domShip = Number(item.domesticShippingFeeCny) || 0;
        const vndRate = Number(item.vndCurrencyRate) || 0;
        const totalVnd = (unitCost + domShip) * vndRate * qty;
        const parcelKg = Number(item.parcelKg) || 0;
        const intlShipCny = Number(item.internationalShippingFeeCny) || 0;
        const intlShipVnd = Number(item.internationalShippingFeeVnd) || 0;
        const totalCostSku = Number(item.subtotal || item.totalCost) || 0;

        return [
          idx + 1,
          product.sku || item.sku || '',
          product.name || item.productName || '',
          product.primaryImageUrl || '',
          '', // FC
          qty,
          product.specification || '',
          unitCost,
          domShip,
          vndRate,
          totalVnd,
          parcelKg,
          intlShipCny,
          intlShipVnd,
          totalCostSku,
        ];
      });

      const ws = XLSX.utils.aoa_to_sheet([
        ...header,
        tableHeader,
        ...rows,
        [],
        ['', '', '', '', '', '', '', '', '', '', '', '', '', 'TOTAL', Number(purchase.totalAmount || purchase.total || 0)],
      ]);

      // Column widths
      ws['!cols'] = tableHeader.map(() => ({ wch: 16 }));
      ws['!cols'][0] = { wch: 4 };
      ws['!cols'][2] = { wch: 30 };

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Internal Invoice');
      XLSX.writeFile(wb, `Internal_Invoice_${purchase.purchaseOrderNumber}.xlsx`);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export internal invoice');
    }
  };

  const exportSupplierInvoice = (purchase: Purchase) => {
    setExportOpenId(null);
    const items = (purchase.items || []) as any[];
    const lcList = (purchase.logisticCompanies || []) as any[];
    const shipper = lcList.length > 0 ? lcList[0].logisticCompany : null;

    const html = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8"><title>Commercial Invoice ${purchase.purchaseOrderNumber}</title>
<style>
body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#333;font-size:13px}
h1{text-align:center;font-size:22px;margin-bottom:4px}
.meta{display:flex;justify-content:space-between;margin:16px 0;font-size:12px}
.section{margin:20px 0}
.section h3{font-size:13px;text-transform:uppercase;border-bottom:2px solid #333;padding-bottom:4px;margin-bottom:8px}
.info-grid{display:grid;grid-template-columns:120px 1fr;gap:4px 12px;font-size:12px}
.info-grid .label{font-weight:bold}
table{width:100%;border-collapse:collapse;margin:12px 0}
th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;font-size:11px}
th{background:#f5f5f5;font-weight:bold;text-transform:uppercase}
.text-right{text-align:right}
.total-row{font-weight:bold;background:#f9f9f9}
@media print{body{margin:20px}}
</style>
</head><body>
<h1>COMMERCIAL INVOICE</h1>
<div class="meta">
  <span>Tracking #: <strong>${purchase.trackingNumber || 'ND'}</strong></span>
  <span>PI Number: <strong>${purchase.purchaseOrderNumber}</strong></span>
  <span>Date: <strong>${new Date(purchase.orderDate).toLocaleDateString('en-GB')}</strong></span>
</div>

<div class="section">
  <h3>Shipper</h3>
  <div class="info-grid">
    <span class="label">Company:</span><span>${shipper?.name || '—'}</span>
    <span class="label">Address:</span><span>${shipper?.address || '—'}</span>
    <span class="label">Phone:</span><span>${shipper?.phone || '—'}</span>
    <span class="label">Email:</span><span>${shipper?.email || '—'}</span>
    <span class="label">Contact:</span><span>${shipper?.contactPerson || '—'}</span>
  </div>
</div>

<div class="section">
  <h3>Ship To (Fulfillment Center)</h3>
  <div class="info-grid">
    <span class="label">Name:</span><span>${(purchase as any).fulfillmentCenter?.name || '—'}</span>
    <span class="label">Address:</span><span>${(purchase as any).fulfillmentCenter?.addressLine1 || '—'}</span>
    <span class="label">Country:</span><span>${(purchase as any).fulfillmentCenter?.country || '—'}</span>
  </div>
</div>

<table>
<thead><tr>
  <th>CTN</th><th>QTY</th><th>Product Name</th><th>HS Code</th>
  <th>Material</th><th>Use</th><th>Unit Value</th><th>Total Value</th>
</tr></thead>
<tbody>
${items.map((item: any) => {
  const product = item.product || {};
  return `<tr>
    <td></td>
    <td>${item.quantity || item.qty || 0}</td>
    <td>${product.name || item.productName || ''}</td>
    <td>${product.hsCode || ''}</td>
    <td>${product.material || ''}</td>
    <td>${product.productUse || ''}</td>
    <td class="text-right">$${Number(item.unitCost || 0).toFixed(2)}</td>
    <td class="text-right">$${Number(item.subtotal || item.totalCost || 0).toFixed(2)}</td>
  </tr>`;
}).join('')}
<tr class="total-row">
  <td colspan="6"></td>
  <td class="text-right">Freight:</td>
  <td class="text-right">$${Number(purchase.purchaseShippingCost || 0).toFixed(2)}</td>
</tr>
<tr class="total-row">
  <td colspan="6"></td>
  <td class="text-right">TOTAL:</td>
  <td class="text-right">$${Number(purchase.totalAmount || purchase.total || 0).toFixed(2)}</td>
</tr>
</tbody></table>
</body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (win) {
      win.onload = () => {
        setTimeout(() => win.print(), 500);
      };
    }
  };

  const convertedEur = useMemo(() => {
    const vnd = parseFloat(vndInput);
    if (!vnd || !latestVndToEur || latestVndToEur === 0) return null;
    return (vnd * latestVndToEur).toFixed(2);
  }, [vndInput, latestVndToEur]);

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

      {/* Main Table */}
      <div className="bg-[#111a22] rounded-2xl border border-border-dark overflow-hidden flex flex-col shadow-2xl mb-12">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[1400px]">
            <thead>
              <tr className="bg-[#17232f]/50 border-b border-border-dark">
                <th className="px-4 py-5 w-10">
                  <input
                    type="checkbox"
                    checked={purchases.length > 0 && selectedIds.size === purchases.length}
                    onChange={toggleSelectAll}
                    className="accent-primary w-4 h-4 cursor-pointer"
                  />
                </th>
                <th className="px-4 py-5 text-text-muted font-bold text-xs uppercase tracking-wider">Internal Ref</th>
                <th className="px-4 py-5 text-text-muted font-bold text-xs uppercase tracking-wider">Fulfillment Ref</th>
                <th className="px-4 py-5 text-text-muted font-bold text-xs uppercase tracking-wider">Supplier</th>
                <th className="px-4 py-5 text-text-muted font-bold text-xs uppercase tracking-wider">Date</th>
                <th className="px-4 py-5 text-text-muted font-bold text-xs uppercase tracking-wider">Status</th>
                <th className="px-4 py-5 text-text-muted font-bold text-xs uppercase tracking-wider">Total</th>
                <th className="px-4 py-5 text-text-muted font-bold text-xs uppercase tracking-wider">Tracking #</th>
                <th className="px-4 py-5 text-text-muted font-bold text-xs uppercase tracking-wider w-32">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-dark/40">
              {purchases.map((purchase) => (
                <tr key={purchase.id} className={`hover:bg-white/[0.02] transition-colors ${selectedIds.has(purchase.id) ? 'bg-primary/5' : ''}`}>
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(purchase.id)}
                      onChange={() => toggleSelect(purchase.id)}
                      className="accent-primary w-4 h-4 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-4 text-sm font-mono text-primary">{purchase.purchaseOrderNumber}</td>
                  <td className="px-4 py-4 text-sm text-white">{purchase.fulfillmentRef || '—'}</td>
                  <td className="px-4 py-4 text-sm font-semibold text-white">{purchase.supplier?.name || "Unknown"}</td>
                  <td className="px-4 py-4 text-sm text-text-muted">{new Date(purchase.orderDate).toLocaleDateString()}</td>
                  <td className="px-4 py-4">
                    <span className="px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest bg-[#f59e0b]/10 text-[#f59e0b]">
                      {purchase.purchaseStatus}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm font-bold text-white">€{Number(purchase.totalAmount || purchase.total || 0).toFixed(2)}</td>
                  <td className="px-4 py-4 text-sm font-mono">
                    {purchase.trackingNumber
                      ? <span className="text-emerald-400">{purchase.trackingNumber}</span>
                      : <span className="text-text-muted italic">ND</span>
                    }
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2 relative">
                      <button
                        onClick={() => handleEditPurchase(purchase)}
                        className="text-text-muted hover:text-white transition-colors"
                        title="Edit"
                      >
                        <span className="material-symbols-outlined text-sm">edit</span>
                      </button>
                      <div className="relative">
                        <button
                          onClick={() => setExportOpenId(exportOpenId === purchase.id ? null : purchase.id)}
                          className="text-text-muted hover:text-amber-400 transition-colors"
                          title="Export Invoice"
                        >
                          <span className="material-symbols-outlined text-sm">download</span>
                        </button>
                        {exportOpenId === purchase.id && (
                          <div className="absolute right-0 top-8 z-50 bg-card-dark border border-border-dark rounded-xl shadow-2xl overflow-hidden min-w-[200px] animate-in fade-in slide-in-from-top-2 duration-200">
                            <button
                              onClick={() => exportInternalInvoice(purchase)}
                              className="w-full px-4 py-3 text-left text-sm text-white hover:bg-primary/10 flex items-center gap-2 transition-colors"
                            >
                              <span className="material-symbols-outlined text-sm text-blue-400">table_chart</span>
                              Internal Invoice (Excel)
                            </button>
                            <button
                              onClick={() => exportSupplierInvoice(purchase)}
                              className="w-full px-4 py-3 text-left text-sm text-white hover:bg-primary/10 flex items-center gap-2 transition-colors border-t border-border-dark"
                            >
                              <span className="material-symbols-outlined text-sm text-amber-400">description</span>
                              Supplier Invoice (PDF)
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
              {purchases.length === 0 && !isLoading && (
                <tr><td colSpan={9} className="text-center py-8 text-text-muted">No purchases found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Purchase Drawer */}
      {showDrawer && (
        <div className="fixed inset-0 z-[100] flex justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDrawer(false)}></div>
          <div className="side-drawer relative w-[1100px] h-full bg-card-dark border-l border-border-dark flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
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
                    value={formData.orderDate}
                    onChange={e => setFormData({ ...formData, orderDate: e.target.value })}
                  />
                </div>
              </div>

              {/* Reference, Tracking, Logistic */}
              <div className="grid grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">Fulfillment Ref #</label>
                  <input
                    className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4"
                    value={formData.fulfillmentRef}
                    onChange={e => setFormData({ ...formData, fulfillmentRef: e.target.value })}
                    placeholder="Fulfillment reference number"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">Tracking Number</label>
                  <input
                    className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4"
                    value={formData.trackingNumber}
                    onChange={e => setFormData({ ...formData, trackingNumber: e.target.value })}
                    placeholder="Enter tracking number"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">Logistic Companies</label>
                  <div className="bg-[#1c2d3d] border border-[#2d445a] rounded-xl p-3 max-h-[120px] overflow-y-auto custom-scrollbar">
                    {logisticCompanies.map(lc => (
                      <label key={lc.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-white/5 rounded px-1">
                        <input
                          type="checkbox"
                          checked={formData.logisticCompanyIds.includes(lc.id)}
                          onChange={e => {
                            const ids = e.target.checked
                              ? [...formData.logisticCompanyIds, lc.id]
                              : formData.logisticCompanyIds.filter(id => id !== lc.id);
                            setFormData({ ...formData, logisticCompanyIds: ids });
                          }}
                          className="accent-primary"
                        />
                        <span className="text-white text-xs">{lc.name}</span>
                      </label>
                    ))}
                    {logisticCompanies.length === 0 && (
                      <p className="text-text-muted text-xs italic">No logistic companies. Add in Settings.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* VND → EUR Converter */}
              <div className="bg-[#14202c] rounded-xl border border-border-dark p-4">
                <label className="text-[10px] font-black text-amber-400 uppercase tracking-[0.15em] flex items-center gap-1 mb-3">
                  <span className="material-symbols-outlined text-sm">currency_exchange</span>
                  VND → EUR Converter
                </label>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <input
                      type="number"
                      className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-10 px-4"
                      value={vndInput}
                      onChange={e => setVndInput(e.target.value)}
                      placeholder="Enter VND amount"
                    />
                  </div>
                  <span className="material-symbols-outlined text-text-muted">arrow_forward</span>
                  <div className="flex-1 bg-[#1c2d3d] border border-[#2d445a] rounded-xl h-10 flex items-center px-4">
                    <span className="text-sm font-bold text-emerald-400">
                      {convertedEur ? `€${convertedEur}` : '—'}
                    </span>
                  </div>
                  <span className="text-[10px] text-text-muted">
                    Rate: {latestVndToEur ? `1 VND = ${latestVndToEur} EUR` : 'No rate set'}
                  </span>
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
                          <th className="px-3 py-3 text-text-muted font-bold text-[10px] uppercase">Product</th>
                          <th className="px-3 py-3 text-text-muted font-bold text-[10px] uppercase w-16">Qty</th>
                          <th className="px-3 py-3 text-text-muted font-bold text-[10px] uppercase w-24">Cost(₫)</th>
                          <th className="px-3 py-3 text-text-muted font-bold text-[10px] uppercase w-24">Discount(₫)</th>
                          <th className="px-3 py-3 text-text-muted font-bold text-[10px] uppercase w-24">Dom Ship(₫)</th>
                          <th className="px-3 py-3 text-text-muted font-bold text-[10px] uppercase w-24">Intl Ship(₫)</th>
                          <th className="px-3 py-3 text-text-muted font-bold text-[10px] uppercase w-16">KG</th>
                          <th className="px-3 py-3 text-text-muted font-bold text-[10px] uppercase">Total(€)</th>
                          <th className="px-3 py-3 text-text-muted font-bold text-[10px] uppercase">Cost/SKU(€)</th>
                          <th className="px-3 py-3 w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-dark/40">
                        {formData.items.map((item, index) => (
                          <tr key={item.id || index} className="group hover:bg-[#1c2d3d]/50">
                            <td className="px-3 py-3">
                              <p className="text-sm font-bold text-white">{item.productName}</p>
                              <p className="text-xs text-text-muted">{item.sku}</p>
                            </td>
                            <td className="px-3 py-2">
                              <input type="number" className="w-full bg-[#1c2d3d] border border-[#2d445a] rounded px-2 py-1 text-white text-xs"
                                value={item.qty} onChange={e => updateItem(index, 'qty', parseFloat(e.target.value) || 0)} />
                            </td>
                            <td className="px-3 py-2">
                              <input type="number" className="w-full bg-[#1c2d3d] border border-[#2d445a] rounded px-2 py-1 text-white text-xs"
                                value={item.purchasePrice} onChange={e => updateItem(index, 'purchasePrice', parseFloat(e.target.value) || 0)} />
                            </td>
                            <td className="px-3 py-2">
                              <input type="number" className="w-full bg-[#1c2d3d] border border-[#2d445a] rounded px-2 py-1 text-white text-xs"
                                value={item.discount} onChange={e => updateItem(index, 'discount', parseFloat(e.target.value) || 0)} />
                            </td>
                            <td className="px-3 py-2">
                              <input type="number" className="w-full bg-[#1c2d3d] border border-[#2d445a] rounded px-2 py-1 text-white text-xs"
                                value={item.domesticShippingFeeCny || 0}
                                onChange={e => updateItem(index, 'domesticShippingFeeCny' as any, parseFloat(e.target.value) || 0)} />
                            </td>
                            <td className="px-3 py-2">
                              <input type="number" className="w-full bg-[#1c2d3d] border border-[#2d445a] rounded px-2 py-1 text-white text-xs"
                                value={item.internationalShippingFeeVnd || 0}
                                onChange={e => updateItem(index, 'internationalShippingFeeVnd' as any, parseFloat(e.target.value) || 0)} />
                            </td>
                            <td className="px-3 py-2">
                              <input type="number" className="w-full bg-[#1c2d3d] border border-[#2d445a] rounded px-2 py-1 text-white text-xs"
                                value={item.parcelKg || 0}
                                onChange={e => updateItemField(index, 'parcelKg', parseFloat(e.target.value) || 0)} />
                            </td>
                            <td className="px-3 py-3 text-sm font-bold text-emerald-400">€{Number(item.totalCost).toFixed(2)}</td>
                            <td className="px-3 py-3 text-sm text-text-muted">€{Number(item.unitCost).toFixed(2)}</td>
                            <td className="px-3 py-3 text-center">
                              <button onClick={() => removeItem(index)} className="text-red-500 hover:text-red-400">
                                <span className="material-symbols-outlined text-lg">delete</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                        {formData.items.length === 0 && (
                          <tr><td colSpan={10} className="text-center py-8 text-text-muted italic">No items added</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Footer Inputs */}
              <div className="grid grid-cols-2 gap-6">
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
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-amber-400 uppercase tracking-[0.15em] ml-1 flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">currency_exchange</span>
                    VND → EUR Rate
                  </label>
                  <div className="bg-[#1c2d3d] border border-[#2d445a] rounded-xl h-12 flex items-center px-4">
                    <span className="text-sm font-bold text-emerald-400">
                      {latestVndToEur ? `1 VND = ${latestVndToEur} EUR` : 'No rate set'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-12 text-right pt-4 border-t border-border-dark/50">
                <div>
                  <p className="text-xs text-text-muted uppercase font-bold">Items Subtotal (₫)</p>
                  <p className="text-xl font-bold text-white">₫{totals.subtotalVnd.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted uppercase font-bold">Grand Total (€)</p>
                  <p className="text-3xl font-black text-emerald-400">€{totals.total.toFixed(2)}</p>
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
      {/* Floating bulk-delete bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#14202c] border border-border-dark rounded-2xl shadow-2xl px-6 py-3 flex items-center gap-4">
          <span className="text-sm text-white font-bold">{selectedIds.size} selected</span>
          <button
            onClick={handleBulkDelete}
            className="flex items-center gap-2 px-5 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-xl transition-colors"
          >
            <span className="material-symbols-outlined text-sm">delete</span>
            Delete Selected
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-text-muted hover:text-white text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};

export default PurchasesPage;
