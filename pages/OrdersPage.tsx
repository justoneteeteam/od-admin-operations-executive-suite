import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ordersService, Order, OrderItem } from '../src/services/orders.service';
import { productsService, Product } from '../src/services/products.service';
import { fulfillmentService, FulfillmentCenter } from '../src/services/fulfillment.service';
import storeSettingsService, { StoreName } from '../src/services/settings.service';
import { CustomerSearch } from '../src/components/CustomerSearch';
import * as XLSX from 'xlsx';

const MOCK_LOGS = [
  { date: 'Dec 12, 2024 - 14:20', status: 'Order Created', note: 'Order manually created by Admin' },
  { date: 'Dec 12, 2024 - 16:45', status: 'Confirmed', note: 'Customer confirmed via phone call' },
  { date: 'Dec 13, 2024 - 09:12', status: 'In Transit', note: 'Handed over to Aramex' },
];

const COUNTRIES = [
  "Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czech Republic",
  "Denmark", "Estonia", "Finland", "France", "Germany", "Greece",
  "Hungary", "Ireland", "Italy", "Latvia", "Lithuania", "Luxembourg",
  "Malta", "Netherlands", "Poland", "Portugal", "Romania", "Slovakia",
  "Slovenia", "Spain", "Sweden", "United Kingdom", "United States",
  "Canada", "Australia", "Other"
];

const OrdersPage: React.FC = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [fulfillmentCenters, setFulfillmentCenters] = useState<FulfillmentCenter[]>([]);
  const [storeNames, setStoreNames] = useState<StoreName[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchType, setSearchType] = useState('orderNumber');
  const [confirmationFilter, setConfirmationFilter] = useState('All Confirmations');
  const [orderStatusFilter, setOrderStatusFilter] = useState('All Status');
  const [dateFilter, setDateFilter] = useState('Last 30 Days');
  const [riskFilter, setRiskFilter] = useState('All Risk Levels');
  const [skuTab, setSkuTab] = useState<'sku' | 'non-sku'>('sku');
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);

  // Pagination State
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);

  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [showErrorToast, setShowErrorToast] = useState(false);

  const [showDrawer, setShowDrawer] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [editOrder, setEditOrder] = useState<Order | null>(null);

  // Import Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState(1);
  const [importData, setImportData] = useState<any[]>([]);
  const [skipRiskAssessment, setSkipRiskAssessment] = useState(false);
  const [skipInventory, setSkipInventory] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResults, setImportResults] = useState<{ created: number; updated: number; skipped: number; errors: any[] } | null>(null);


  // Reset page to 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [searchTerm, searchType, confirmationFilter, orderStatusFilter, dateFilter, riskFilter, skuTab]);

  // Debounced fetch for orders
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchOrders();
    }, 300);
    return () => clearTimeout(timer);
  }, [page, searchTerm, searchType, confirmationFilter, orderStatusFilter, dateFilter, riskFilter, skuTab]);

  // Initial fetch for static data
  useEffect(() => {
    fetchProducts();
    fetchFulfillmentCenters();
    fetchStoreNames();
  }, []);

  useEffect(() => {
    if (showDrawer && selectedOrder) {
      // Fetch full order details to get trackingHistory, customerResponses, and callLogs
      const fetchDetails = async () => {
        try {
          const fullOrder = await ordersService.getById(selectedOrder.id);
          console.log('[OrderDrawer] Full order fetched:', {
            id: fullOrder.id,
            trackingHistory: fullOrder.trackingHistory?.length ?? 'MISSING',
            customerResponses: fullOrder.customerResponses?.length ?? 'MISSING',
            callLogs: fullOrder.callLogs?.length ?? 'MISSING',
          });
          setEditOrder(fullOrder);
        } catch (err) {
          console.error('[OrderDrawer] Failed to fetch full order details:', err);
          setEditOrder({ ...selectedOrder }); // Fallback to shallow copy
        }
      };
      // Set to shallow copy immediately for responsive UI, then overwrite with full data
      setEditOrder({ ...selectedOrder, trackingHistory: [], customerResponses: [], callLogs: [] });
      fetchDetails();
    } else {
      setEditOrder(null);
    }
  }, [showDrawer, selectedOrder]);

  // Auto-calculate Total Revenue
  useEffect(() => {
    if (editOrder) {
      const sub = editOrder.items?.reduce((sum, item) => sum + ((item.quantity || 0) * (item.unitPrice || 0)), 0) || 0;
      const ship = Number(editOrder.shippingFee) || 0;
      const tax = Number(editOrder.taxCollected) || 0;
      const disc = Number(editOrder.discountGiven) || 0;
      const total = sub + ship + tax - disc;

      // Update only if changed to avoid infinite loop
      if (Math.abs((editOrder.totalAmount || 0) - total) > 0.01) {
        setEditOrder(prev => prev ? ({ ...prev, totalAmount: total }) : null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    JSON.stringify(editOrder?.items?.map(i => ({ q: i.quantity, p: i.unitPrice }))),
    editOrder?.shippingFee,
    editOrder?.taxCollected,
    editOrder?.discountGiven
  ]);

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 12) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (page <= 10) {
        pages.push(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, '...', totalPages - 1, totalPages);
      } else if (page >= totalPages - 4) {
        pages.push(1, 2, '...', totalPages - 5, totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, 2, '...', page - 1, page, page + 1, '...', totalPages - 1, totalPages);
      }
    }
    return pages;
  };

  const fetchOrders = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await ordersService.getAll({
        orderStatus: orderStatusFilter === 'All Status' ? undefined : orderStatusFilter,
        confirmationStatus: confirmationFilter === 'All Confirmations' ? undefined : confirmationFilter,
        search: searchTerm || undefined,
        searchType: searchTerm ? searchType : undefined,
        skuType: skuTab,
        page: page,
        limit: 20
      });
      setOrders(data.data || []);
      if (data.meta) {
        setTotalPages(data.meta.totalPages || 1);
        setTotalOrders(data.meta.total || 0);
      }
      setSelectedOrderIds([]);
    } catch (err: any) {
      setError('Failed to fetch orders. Please try again later.');
      console.error('Error fetching orders:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const data = await productsService.getAll();
      setProducts(Array.isArray(data) ? data : data.data || []);
    } catch (err) {
      console.error("Failed to load products", err);
    }
  };

  const fetchFulfillmentCenters = async () => {
    try {
      const data = await fulfillmentService.getAll();
      setFulfillmentCenters(Array.isArray(data) ? data : data.data || []);
    } catch (err) {
      console.error("Failed to load fulfillment centers", err);
    }
  };

  const fetchStoreNames = async () => {
    try {
      const data = await storeSettingsService.getStoreNames();
      setStoreNames(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load store names", err);
    }
  };

  const handleInputChange = (field: keyof Order | string, value: any) => {
    if (editOrder) {
      if (field === 'customerName') {
        const updatedCustomer = { ...editOrder.customer, name: value };
        setEditOrder({ ...editOrder, customer: updatedCustomer });
      } else if (field === 'customerPhone') {
        const updatedCustomer = { ...editOrder.customer, phone: value };
        setEditOrder({ ...editOrder, customer: updatedCustomer });
      } else {
        setEditOrder({ ...editOrder, [field]: value });
      }
    }
  };

  // Helper for items inputs
  const handleItemChange = (index: number, field: keyof OrderItem, value: any) => {
    if (editOrder) {
      const newItems = editOrder.items ? [...editOrder.items] : [];
      if (!newItems[index]) {
        newItems[index] = {
          productName: '', sku: '', quantity: 1, unitPrice: 0, subtotal: 0
        } as OrderItem;
      }
      newItems[index] = { ...newItems[index], [field]: value };

      // Auto-calc subtotal for local state (backend recalculates on save usually, but good for UI)
      if (field === 'quantity' || field === 'unitPrice') {
        const qty = field === 'quantity' ? value : newItems[index].quantity || 0;
        const price = field === 'unitPrice' ? value : newItems[index].unitPrice || 0;
        newItems[index].subtotal = qty * price;
      }

      setEditOrder({ ...editOrder, items: newItems });
    }
  };

  const handleAddItem = () => {
    if (editOrder) {
      const newItems = editOrder.items ? [...editOrder.items] : [];
      newItems.push({
        productName: '',
        sku: '',
        quantity: 1,
        unitPrice: 0,
        subtotal: 0,
        productId: ''
      } as OrderItem);
      setEditOrder({ ...editOrder, items: newItems });
    }
  };

  const handleRemoveItem = (index: number) => {
    if (editOrder && editOrder.items) {
      const newItems = [...editOrder.items];
      newItems.splice(index, 1);
      setEditOrder({ ...editOrder, items: newItems });
    }
  };

  const handleProductSelect = (index: number, productId: string) => {
    const product = products.find(p => p.id === productId);
    if (editOrder && product) {
      const newItems = editOrder.items ? [...editOrder.items] : [];
      if (!newItems[index]) newItems[index] = {} as OrderItem;

      newItems[index] = {
        ...newItems[index],
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        unitPrice: product.sellingPrice || product.unitCost || 0,
        quantity: newItems[index].quantity || 1
      };
      // Auto-calc subtotal
      newItems[index].subtotal = (newItems[index].quantity || 1) * (newItems[index].unitPrice || 0);

      setEditOrder({ ...editOrder, items: newItems });
    }
  };

  const saveChanges = async () => {
    if (editOrder) {
      try {
        // Clean up the items payload for the backend
        const cleanItems = editOrder.items?.map(item => ({
          productId: item.productId,
          productName: item.productName || 'Unknown Product',
          sku: item.sku || 'N/A',
          quantity: Number(item.quantity) || 1,
          unitPrice: Number(item.unitPrice) || 0,
        })) || [];

        // Explicitly extract ONLY the scalar fields allowed to be updated.
        // This prevents Prisma errors caused by accidentally sending relational objects 
        // (like fulfillmentCenter, profitCalculations) or read-only timestamps.
        const payload = {
          shippingAddressLine1: editOrder.shippingAddressLine1,
          shippingAddressLine2: editOrder.shippingAddressLine2,
          shippingCity: editOrder.shippingCity,
          shippingProvince: editOrder.shippingProvince,
          shippingPostalCode: editOrder.shippingPostalCode,
          shippingCountry: editOrder.shippingCountry,
          fulfillmentCenterId: editOrder.fulfillmentCenterId,
          trackingNumber: editOrder.trackingNumber,
          courier: editOrder.courier,
          notes: editOrder.notes,
          confirmationStatus: editOrder.confirmationStatus,
          orderStatus: editOrder.orderStatus,
          shippingFee: editOrder.shippingFee,
          taxCollected: editOrder.taxCollected,
          discountGiven: editOrder.discountGiven,
          paymentStatus: editOrder.paymentStatus,
          items: cleanItems
        };

        await ordersService.update(editOrder.id, payload);
        await fetchOrders();
        setShowDrawer(false);
        setShowSuccessToast(true);
        setTimeout(() => setShowSuccessToast(false), 3000);
      } catch (err) {
        console.error('Error updating order:', err);
        setShowErrorToast(true);
        setTimeout(() => setShowErrorToast(false), 3000);
      }
    }
  };

  const calculateNetProfit = (order: Order) => {
    const revenue = order.totalAmount || 0;
    const sCost = order.shippingFee || 0;
    const fCost = 0;
    const isPaid = order.paymentStatus === 'Paid';
    const cashIn = isPaid ? revenue : 0;
    return cashIn - sCost - fCost;
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedOrderIds(filteredOrders.map(o => o.id));
    } else {
      setSelectedOrderIds([]);
    }
  };

  const handleSelectOrder = (e: React.ChangeEvent<HTMLInputElement>, id: string) => {
    e.stopPropagation();
    if (e.target.checked) {
      setSelectedOrderIds(prev => [...prev, id]);
    } else {
      setSelectedOrderIds(prev => prev.filter(orderId => orderId !== id));
    }
  };

  const handleDeleteOrder = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this order?')) {
      try {
        await ordersService.delete(id);
        await fetchOrders();
      } catch (err) {
        console.error('Failed to delete order', err);
        alert('Failed to delete order. Please try again.');
      }
    }
  };

  const handleBulkDelete = async () => {
    if (window.confirm(`Are you sure you want to delete ${selectedOrderIds.length} orders?`)) {
      try {
        await Promise.all(selectedOrderIds.map(id => ordersService.delete(id)));
        await fetchOrders();
        setSelectedOrderIds([]);
      } catch (err) {
        console.error('Failed to delete orders', err);
        alert('Failed to delete some orders. Please try again.');
      }
    }
  };

  const filteredOrders = orders.filter(order => {
    if (riskFilter !== 'All Risk Levels') {
      if (riskFilter === 'Unassessed') return !order.riskLevel;
      return order.riskLevel === riskFilter;
    }
    return true;
  });

  // ========== IMPORT LOGIC ========== //
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false }); // Format dates/numbers

        setImportData(jsonData);
        setImportStep(2);
      } catch (err) {
        console.error("Failed to parse file", err);
        alert("Failed to parse file. Please ensure it's a valid CSV/XLSX.");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = ''; // reset input
  };

  const downloadTemplate = () => {
    const headers = [
      "order_number", "customer_name", "customer_phone", "customer_email",
      "sku", "quantity", "price", "shipping_fee", "tax", "discount",
      "order_date", "order_status", "confirmation_status", "payment_status",
      "shipping_address", "shipping_zipcode", "shipping_city", "shipping_state", "shipping_country",
      "store_id", "tracking_number", "courier", "notes"
    ];

    // Example rows so users know what valid values look like
    const exampleRow1 = [
      "",                           // order_number → blank = CREATE new
      "John Smith",                 // customer_name
      "+34612345678",               // customer_phone (international format)
      "john@example.com",           // customer_email
      "-LM-2659",                   // sku → must exactly match a product SKU
      "1",                          // quantity
      "29.99",                      // price (use dot, not comma)
      "4.99",                       // shipping_fee
      "0",                          // tax
      "0",                          // discount
      "2025-03-01",                 // order_date (YYYY-MM-DD)
      "Pending",                    // order_status: Pending / Shipped / Delivered
      "Pending",                    // confirmation_status: Pending / Confirmed / Declined / Out of Area / Duplicated
      "Pending",                    // payment_status: Pending / Paid / Refused
      "Calle Mayor 12",             // shipping_address
      "28001",                      // shipping_zipcode
      "Madrid",                     // shipping_city
      "Community of Madrid",        // shipping_state (province)
      "Spain",                      // shipping_country
      "",                           // store_id → blank = auto-assign default store
      "",                           // tracking_number
      "",                           // courier
      "Historic import"             // notes
    ];

    const exampleRow2 = [
      "#1441",                      // order_number → existing number = UPDATE
      "Maria Garcia",
      "+39333123456",
      "maria@email.it",
      "NO-SKU-59131818180689",      // sku (NO-SKU product)
      "2",
      "37.49",
      "4.99",
      "0",
      "0",
      "2025-02-15",
      "Pending",
      "Pending",
      "Pending",
      "Via Roma 5",
      "00100",
      "Roma",
      "Lazio",
      "Italy",
      "",
      "",
      "",
      ""
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow1, exampleRow2]);
    ws['!cols'] = headers.map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "bulk_orders_template.xlsx");
  };

  const executeImport = async () => {
    setIsImporting(true);
    setImportStep(3);
    try {
      const results = await ordersService.importOrders(importData, skipRiskAssessment, skipInventory);
      setImportResults(results);
      if (results.created > 0 || results.updated > 0) {
        fetchOrders();
      }
    } catch (err) {
      console.error("Import failed:", err);
      // Fallback rough error
      setImportResults({
        created: 0, updated: 0, skipped: importData.length,
        errors: [{ row: 0, reason: "Fatal Server Error during Batch Process" }]
      });
    } finally {
      setIsImporting(false);
    }
  };

  const downloadErrorReport = () => {
    if (!importResults?.errors || importResults.errors.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(importResults.errors);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Errors");
    XLSX.writeFile(wb, "import_error_report.xlsx");
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setTimeout(() => {
      setImportStep(1);
      setImportData([]);
      setImportResults(null);
      setSkipRiskAssessment(false);
      setSkipInventory(false);
    }, 300);
  };
  // ================================== //

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap scrollbar-hide">
          <span className="text-text-muted text-xs font-medium">Home</span>
          <span className="text-text-muted text-xs">/</span>
          <span className="text-white text-xs font-medium">Orders Console</span>
        </div>
        <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 mt-2">
          <div className="flex flex-col gap-1">
            <h1 className="text-white text-2xl sm:text-3xl font-black tracking-tight">Orders Console</h1>
            <p className="text-text-muted text-sm">Review, track and manage your COD order pipeline.</p>
          </div>
          {/* SKU Type Tabs */}
          <div className="flex gap-1 bg-[#111a22] p-1 rounded-xl border border-border-dark self-end">
            <button
              onClick={() => setSkuTab('sku')}
              className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${
                skuTab === 'sku'
                  ? 'bg-primary text-white shadow-lg shadow-primary/20'
                  : 'text-text-muted hover:text-white hover:bg-[#1c2d3d]'
              }`}
            >
              <span className="material-symbols-outlined text-sm mr-1.5 align-middle" style={{ fontSize: '16px' }}>inventory_2</span>
              Actual Order (SKU)
            </button>
            <button
              onClick={() => setSkuTab('non-sku')}
              className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${
                skuTab === 'non-sku'
                  ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
                  : 'text-text-muted hover:text-white hover:bg-[#1c2d3d]'
              }`}
            >
              <span className="material-symbols-outlined text-sm mr-1.5 align-middle" style={{ fontSize: '16px' }}>science</span>
              Test Order (Non-SKU)
            </button>
          </div>
          <div className="flex gap-2 sm:gap-3">
            {selectedOrderIds.length > 0 && (
              <button
                onClick={handleBulkDelete}
                className="flex flex-1 md:flex-none items-center justify-center rounded-lg h-10 px-4 bg-red-500/10 text-red-500 text-sm font-bold border border-red-500/20 hover:bg-red-500/20 transition-all mr-1"
              >
                <span className="material-symbols-outlined mr-2" style={{ fontSize: '18px' }}>delete</span>
                Delete ({selectedOrderIds.length})
              </button>
            )}
            <button className="flex flex-1 md:flex-none items-center justify-center rounded-lg h-10 px-4 bg-[#233648] text-white text-sm font-bold border border-[#2d445a] hover:bg-[#2d445a] transition-all">
              <span className="material-symbols-outlined mr-2" style={{ fontSize: '18px' }}>cloud_download</span>
              Export XLS
            </button>
            <button
              onClick={() => setShowImportModal(true)}
              className="flex flex-[2] md:flex-none items-center justify-center rounded-lg h-10 px-4 bg-[#1c2d3d] text-emerald-400 text-sm font-bold border border-[#2d445a] hover:bg-[#2d445a] transition-all"
            >
              <span className="material-symbols-outlined mr-2" style={{ fontSize: '18px' }}>upload_file</span>
              Import Orders
            </button>
            <button
              onClick={() => navigate('/orders/create')}
              className="flex flex-[2] md:flex-none items-center justify-center rounded-lg h-10 px-4 bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
            >
              <span className="material-symbols-outlined mr-2" style={{ fontSize: '18px' }}>add</span>
              Create Order
            </button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-4 mt-4">
          <div className="md:col-span-2 lg:col-span-2 flex gap-0">
            <div className="relative flex-shrink-0">
              <select
                className="h-full pl-3 pr-7 py-2.5 bg-[#17232f] border border-border-dark border-r-0 rounded-l-xl text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm cursor-pointer font-medium"
                style={{ WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7f95' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
                value={searchType}
                onChange={(e) => setSearchType(e.target.value)}
              >
                <option value="orderNumber">Order #</option>
                <option value="customerName">Customer</option>
                <option value="trackingNumber">Tracking #</option>
              </select>
            </div>
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-[20px]">search</span>
              <input
                type="text"
                placeholder={searchType === 'orderNumber' ? 'Search by order number...' : searchType === 'customerName' ? 'Search by customer name...' : 'Search by tracking number...'}
                className="w-full pl-10 pr-4 py-2.5 bg-card-dark border border-border-dark rounded-r-xl text-white placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="relative">
            <select
              className="w-full px-4 py-2.5 bg-card-dark border border-border-dark rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm appearance-none cursor-pointer"
              value={confirmationFilter}
              onChange={(e) => setConfirmationFilter(e.target.value)}
            >
              <option>All Confirmations</option>
              <option>Pending</option>
              <option>Confirmed</option>
              <option>Declined</option>
              <option>Call Center</option>
              <option>Cancelled</option>
              <option>No Answer</option>
              <option>Wait Until Stock</option>
              <option>Out of Area</option>
              <option>Duplicated</option>
            </select>
            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none text-[20px]">expand_more</span>
          </div>
          <div className="relative">
            <select
              className="w-full px-4 py-2.5 bg-card-dark border border-border-dark rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm appearance-none cursor-pointer"
              value={orderStatusFilter}
              onChange={(e) => setOrderStatusFilter(e.target.value)}
            >
              <option>All Status</option>
              <option value="Pending">Pending</option>
              <option value="Processing">Processing</option>
              <option value="InfoReceived">Info Received</option>
              <option value="Shipped">Shipped</option>
              <option value="NotFound">Not Found</option>
              <option value="InTransit">In transit</option>
              <option value="OutForDelivery">Pickup (Out of delivery)</option>
              <option value="Delivered">Delivered</option>
              <option value="Undelivered">Undelivered</option>
              <option value="Exception">Exception</option>
              <option value="Expired">Expired</option>
              <option value="Cancelled">Cancel</option>
            </select>
            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none text-[20px]">expand_more</span>
          </div>
          <div className="relative">
            <select
              className="w-full px-4 py-2.5 bg-card-dark border border-border-dark rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm appearance-none cursor-pointer"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            >
              <option>Last 30 Days</option>
              <option>Yesterday</option>
              <option>Last 7 Days</option>
              <option>Today</option>
              <option>Custom Range</option>
            </select>
            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none text-[20px]">calendar_today</span>
          </div>
          <div className="relative">
            <select
              className="w-full px-4 py-2.5 bg-card-dark border border-border-dark rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all text-sm appearance-none cursor-pointer"
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
            >
              <option>All Risk Levels</option>
              <option value="LOW">Low Risk</option>
              <option value="MEDIUM">Medium Risk</option>
              <option value="HIGH">High Risk</option>
              <option value="BLOCKED">Blocked</option>
              <option value="Unassessed">Unassessed</option>
            </select>
            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none text-[20px]">shield</span>
            </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-[#111a22] rounded-xl border border-border-dark overflow-hidden flex flex-col mb-12 shadow-2xl">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[1000px] lg:min-w-[1400px]">
            <thead>
              <tr className="bg-[#17232f] border-b border-[#233648]">
                <th className="px-4 py-5 w-[40px] text-center">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-[#2d445a] bg-[#1c2d3d] checked:bg-primary cursor-pointer accent-primary align-middle"
                    checked={filteredOrders.length > 0 && selectedOrderIds.length === filteredOrders.length}
                    onChange={handleSelectAll}
                  />
                </th>
                <th className="px-4 sm:px-6 py-5 text-text-muted font-bold text-[10px] uppercase tracking-widest">Risk</th>
                <th className="px-4 sm:px-6 py-5 text-text-muted font-bold text-[10px] uppercase tracking-widest">Order Details</th>
                <th className="px-4 sm:px-6 py-5 text-text-muted font-bold text-[10px] uppercase tracking-widest">Confirmation</th>
                <th className="px-4 sm:px-6 py-5 text-text-muted font-bold text-[10px] uppercase tracking-widest">Order Status</th>
                <th className="px-4 sm:px-6 py-5 text-text-muted font-bold text-[10px] uppercase tracking-widest text-right">Revenue</th>
                <th className="px-4 sm:px-6 py-5 text-text-muted font-bold text-[10px] uppercase tracking-widest text-right">COD Collected</th>
                <th className="px-4 sm:px-6 py-5 text-text-muted font-bold text-[10px] uppercase tracking-widest text-right">Net Profit</th>
                <th className="px-4 sm:px-6 py-5 text-center text-text-muted font-bold text-[10px] uppercase tracking-widest">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#233648]">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-text-muted">
                    <div className="flex flex-col items-center gap-2">
                      <div className="animate-spin size-6 border-2 border-primary border-t-transparent rounded-full"></div>
                      <p className="text-sm">Loading orders...</p>
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-red-500">
                    <div className="flex flex-col items-center gap-2">
                      <span className="material-symbols-outlined text-3xl">error</span>
                      <p className="text-sm">{error}</p>
                    </div>
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-text-muted">
                    <div className="flex flex-col items-center gap-2">
                      <span className="material-symbols-outlined text-3xl">inbox</span>
                      <p className="text-sm">No orders found.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const profit = calculateNetProfit(order);
                  return (
                    <tr
                      key={order.id}
                      className={`hover:bg-[#1c2d3d] transition-colors cursor-pointer group ${selectedOrderIds.includes(order.id) ? 'bg-[#1c2d3d]/50' : ''}`}
                      onClick={() => { setSelectedOrder(order); setShowDrawer(true); }}
                    >
                      <td className="px-4 py-6 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-[#2d445a] bg-[#1c2d3d] checked:bg-primary cursor-pointer accent-primary align-middle"
                          checked={selectedOrderIds.includes(order.id)}
                          onChange={(e) => handleSelectOrder(e, order.id)}
                        />
                      </td>
                      <td className="px-4 sm:px-6 py-6 text-center">
                        <div className="flex flex-col items-center gap-1">
                          {order.riskLevel === 'LOW' && <span className="inline-flex size-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" title="LOW Risk"><span className="material-symbols-outlined text-sm">shield</span></span>}
                          {order.riskLevel === 'MEDIUM' && <span className="inline-flex size-6 items-center justify-center rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30" title="MEDIUM Risk"><span className="material-symbols-outlined text-sm">warning</span></span>}
                          {order.riskLevel === 'HIGH' && <span className="inline-flex size-6 items-center justify-center rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30" title="HIGH Risk"><span className="material-symbols-outlined text-sm">front_hand</span></span>}
                          {order.riskLevel === 'BLOCKED' && <span className="inline-flex size-6 items-center justify-center rounded-full bg-red-500/20 text-red-400 border border-red-500/30" title="BLOCKED"><span className="material-symbols-outlined text-sm">block</span></span>}
                          {!order.riskLevel && <span className="inline-flex size-6 items-center justify-center rounded-full bg-[#1c2d3d] text-text-muted border border-border-dark" title="Unassessed"><span className="material-symbols-outlined text-sm">help</span></span>}
                          <span className={`text-[10px] font-bold ${order.riskLevel === 'LOW' ? 'text-emerald-400' : order.riskLevel === 'MEDIUM' ? 'text-yellow-400' : order.riskLevel === 'HIGH' ? 'text-orange-400' : order.riskLevel === 'BLOCKED' ? 'text-red-400' : 'text-text-muted'}`}>
                            {order.riskScore != null ? order.riskScore : '—'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-6">
                        <p className="text-sm font-bold text-primary group-hover:underline underline-offset-4">#{order.orderNumber}</p>
                        <p className="text-xs text-white mt-1 font-medium">{order.customer?.name || 'Unknown User'}</p>
                        <p className="text-[10px] text-text-muted mt-1 uppercase tracking-widest">{order.shippingCountry || 'N/A'}</p>
                      </td>
                      <td className="px-4 sm:px-6 py-6">
                        <div className={`inline-flex items-center px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest bg-opacity-10 border ${(order.confirmationStatus || 'Pending') === 'Confirmed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                          (order.confirmationStatus || 'Pending') === 'Pending' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                            (order.confirmationStatus || 'Pending') === 'Out of Area' ? 'bg-violet-500/10 text-violet-400 border-violet-500/20' :
                              (order.confirmationStatus || 'Pending') === 'Duplicated' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                                'bg-red-500/10 text-red-400 border-red-500/20'
                          }`}>
                          {order.confirmationStatus || 'Pending'}
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-6">
                        <div className="flex items-center gap-2">
                          <span className={`size-1.5 rounded-full ${order.orderStatus === 'Delivered' ? 'bg-emerald-500' :
                            (order.orderStatus === 'Exception' || order.orderStatus === 'Expired' || order.orderStatus === 'Cancelled' || order.orderStatus === 'Undelivered') ? 'bg-red-500' :
                              order.orderStatus === 'OutForDelivery' ? 'bg-orange-500' :
                                (order.orderStatus === 'InTransit' || order.orderStatus === 'Shipped' || order.orderStatus === 'Processing' || order.orderStatus === 'InfoReceived') ? 'bg-blue-400' :
                                  order.orderStatus === 'NotFound' ? 'bg-gray-500' :
                                    'bg-primary/60'
                            }`}></span>
                          <span className={`text-xs uppercase tracking-wider ${(order.orderStatus === 'Exception' || order.orderStatus === 'Expired' || order.orderStatus === 'Cancelled' || order.orderStatus === 'Undelivered' || order.orderStatus === 'OutForDelivery') ? 'font-black' : 'font-bold text-text-muted'
                            } ${(order.orderStatus === 'Exception' || order.orderStatus === 'Expired' || order.orderStatus === 'Cancelled' || order.orderStatus === 'Undelivered') ? 'text-red-500' :
                              order.orderStatus === 'OutForDelivery' ? 'text-orange-500' : ''
                            }`}>
                            {
                              order.orderStatus === 'InTransit' ? 'In transit' :
                                order.orderStatus === 'Shipped' ? 'Shipped' :
                                  order.orderStatus === 'InfoReceived' ? 'Info Received' :
                                    order.orderStatus === 'OutForDelivery' ? 'Pickup (Out of delivery)' :
                                      order.orderStatus === 'NotFound' ? 'Not Found' :
                                        order.orderStatus === 'Cancelled' ? 'Cancel' :
                                          order.orderStatus
                            }
                          </span>
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-6 text-sm font-black text-white text-right whitespace-nowrap">
                        {skuTab === 'non-sku' ? <span className="text-text-muted">$0</span> : `$${order.totalAmount.toLocaleString()}`}
                      </td>
                      <td className="px-4 sm:px-6 py-6 text-sm font-black text-text-muted text-right whitespace-nowrap">
                        {skuTab === 'non-sku' ? '$0' : `$${(order.paymentStatus === 'Paid' ? order.totalAmount : 0).toLocaleString()}`}
                      </td>
                      <td className={`px-4 sm:px-6 py-6 text-sm font-black text-right whitespace-nowrap ${skuTab === 'non-sku' ? 'text-text-muted' : profit > 0 ? 'text-emerald-400' : profit < 0 ? 'text-red-400' : 'text-text-muted'}`}>
                        {skuTab === 'non-sku' ? '$0' : `${profit >= 0 ? '+' : ''}$${profit.toLocaleString()}`}
                      </td>
                      <td className="px-4 sm:px-6 py-6" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2">
                          <button
                            className="p-2 hover:bg-primary/10 rounded-xl text-text-muted hover:text-primary transition-all"
                            onClick={(e) => { e.stopPropagation(); setSelectedOrder(order); setShowDrawer(true); }}
                          >
                            <span className="material-symbols-outlined text-[20px]">edit_square</span>
                          </button>
                          <button
                            className="p-2 hover:bg-red-500/10 rounded-xl text-text-muted hover:text-red-500 transition-all"
                            onClick={(e) => handleDeleteOrder(e, order.id)}
                          >
                            <span className="material-symbols-outlined text-[20px]">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="bg-[#17232f]/80 px-4 sm:px-6 py-6 border-t border-[#233648] flex flex-col xl:flex-row items-center justify-between gap-6">
          <span className="text-text-muted text-sm font-medium whitespace-nowrap">
            Showing <span className="text-white font-bold">{page}</span> of <span className="text-white font-bold">{totalPages}</span> pages
            <span className="mx-2 opacity-30">|</span>
            {totalOrders} total orders
          </span>
          <div className="flex items-center gap-2 overflow-x-auto pb-2 xl:pb-0 w-full xl:w-auto scrollbar-hide">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-primary text-text-muted hover:bg-primary hover:text-white transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-text-muted whitespace-nowrap text-sm font-medium"
            >
              &larr; Previous
            </button>

            <div className="flex items-center gap-2">
              {getPageNumbers().map((p, i) => (
                <React.Fragment key={i}>
                  {p === '...' ? (
                    <span className="text-text-muted px-1">...</span>
                  ) : (
                    <button
                      onClick={() => setPage(p as number)}
                      className={`min-w-[42px] h-[42px] flex items-center justify-center rounded-xl border transition-all text-sm font-bold ${page === p
                        ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20'
                        : 'border-primary text-text-muted hover:bg-primary/10 hover:text-white'
                        }`}
                    >
                      {p}
                    </button>
                  )}
                </React.Fragment>
              ))}
            </div>

            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-primary text-text-muted hover:bg-primary hover:text-white transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-text-muted whitespace-nowrap text-sm font-medium"
            >
              Next &rarr;
            </button>
          </div>
        </div>
      )}

      {/* Responsive Order Detail Drawer */}
      {
        showDrawer && editOrder && (
          <div className="fixed inset-0 z-[200] flex justify-end">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowDrawer(false)}></div>
            <div className="side-drawer relative w-full sm:w-[680px] lg:w-[720px] h-full bg-[#111a22] border-l border-border-dark flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
              {/* Header */}
              <div className="px-6 sm:px-8 py-6 border-b border-border-dark flex items-center justify-between bg-[#14202c]">
                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-3 tracking-tight">
                    Edit Order Details
                    <span className="hidden xs:inline-block text-xs font-bold px-3 py-1 rounded-lg bg-primary/20 text-primary border border-primary/30">
                      #{editOrder.orderNumber}
                    </span>
                  </h2>
                  <p className="text-[10px] text-text-muted mt-1 uppercase tracking-widest font-bold">Managed via {editOrder.storeName || 'Store A'}</p>
                </div>
                <button onClick={() => setShowDrawer(false)} className="size-10 flex items-center justify-center rounded-full hover:bg-red-500/10 hover:text-red-500 text-text-muted transition-all">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 sm:p-8 space-y-10 pb-24">

                {/* Identity & Store Section */}
                <section className="space-y-4">
                  <h3 className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">fingerprint</span>
                    Identity & Store
                  </h3>
                  <div className="bg-[#17232f] rounded-2xl p-5 sm:p-6 border border-border-dark space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-text-muted uppercase ml-1">Order ID</label>
                        <input
                          className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary transition-all font-mono"
                          value={editOrder.orderNumber}
                          readOnly
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-text-muted uppercase ml-1">Store Name</label>
                        <select
                          className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary transition-all appearance-none"
                          value={editOrder.storeId || ''}
                          onChange={(e) => {
                            const selected = storeNames.find(s => s.id === e.target.value);
                            setEditOrder(prev => prev ? ({
                              ...prev,
                              storeId: e.target.value,
                              storeName: selected?.storeName || ''
                            }) : null);
                          }}
                        >
                          <option value="">Select Store...</option>
                          {storeNames.map(s => (
                            <option key={s.id} value={s.id}>{s.storeName}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Risk Assessment Section */}
                {editOrder.riskLevel && (
                  <section className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-black text-amber-500 uppercase tracking-widest flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm">shield</span>
                        Fraud & Risk Assessment
                      </h3>
                      <div className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full border ${editOrder.riskLevel === 'LOW' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                        editOrder.riskLevel === 'MEDIUM' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                          editOrder.riskLevel === 'HIGH' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
                            'bg-red-500/20 text-red-400 border-red-500/30'
                        }`}>
                        {editOrder.riskLevel} RISK (Score: {editOrder.riskScore})
                      </div>
                    </div>
                    <div className="bg-[#17232f] rounded-2xl p-5 sm:p-6 border border-amber-500/20 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="bg-[#1c2d3d] p-4 rounded-xl border border-border-dark space-y-2">
                          <span className="text-[10px] font-black text-text-muted uppercase">Recommended Action</span>
                          <p className="text-sm font-black text-white">{
                            editOrder.riskAction === 'twilio_short' ? 'Short Voice Confirmation' :
                              editOrder.riskAction === 'twilio_long' ? 'Full Voice Confirmation' :
                                editOrder.riskAction === 'call_center' ? 'Manual Call Center Review' :
                                  editOrder.riskAction === 'auto_reject' ? 'Auto-Reject (Blocked)' :
                                    (editOrder.riskAction || 'None')
                          }</p>
                        </div>
                        <div className="bg-[#1c2d3d] p-4 rounded-xl border border-border-dark space-y-2">
                          <span className="text-[10px] font-black text-text-muted uppercase">Address Analysis</span>
                          <div className="flex gap-2 text-xs font-medium">
                            <span className="text-text-muted">Requires further implementation. Check raw log.</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                {/* Customer Information Section */}
                <section className="space-y-4">
                  <h3 className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">person</span>
                    Customer Information
                  </h3>
                  <div className="bg-[#17232f] rounded-2xl p-5 sm:p-6 border border-border-dark space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-text-muted uppercase ml-1">Customer Name</label>
                        <CustomerSearch
                          value={editOrder.customer?.name || ''}
                          onChange={(val) => handleInputChange('customerName', val)}
                          onSelect={(customer) => {
                            setEditOrder(prev => prev ? ({
                              ...prev,
                              customer: { ...prev.customer, name: customer.name, phone: customer.phone },
                              shippingAddressLine1: customer.addressLine1 || '',
                              shippingCity: customer.city || '',
                              shippingProvince: customer.province || '',
                              shippingPostalCode: customer.postalCode || '',
                              shippingCountry: customer.country || prev.shippingCountry
                            }) : null);
                          }}
                          placeholder="Search customer..."
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-text-muted uppercase ml-1">Phone Number</label>
                        <input
                          className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary transition-all"
                          value={editOrder.customer?.phone || ''}
                          onChange={(e) => handleInputChange('customerPhone', e.target.value)}
                          placeholder="+1 234 567 890"
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <label className="text-[10px] font-black text-text-muted uppercase ml-1">House # / Street Address</label>
                        <input
                          className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary transition-all"
                          value={editOrder.shippingAddressLine1 || ''}
                          onChange={(e) => handleInputChange('shippingAddressLine1', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-text-muted uppercase ml-1">City</label>
                        <input
                          className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4"
                          value={editOrder.shippingCity || ''}
                          onChange={(e) => handleInputChange('shippingCity', e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-text-muted uppercase ml-1">Province</label>
                        <input
                          className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4"
                          value={editOrder.shippingProvince || ''}
                          onChange={(e) => handleInputChange('shippingProvince', e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-text-muted uppercase ml-1">Zipcode</label>
                        <input
                          className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4"
                          value={editOrder.shippingPostalCode || ''}
                          onChange={(e) => handleInputChange('shippingPostalCode', e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-text-muted uppercase ml-1">Country</label>
                        <select
                          className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary transition-all appearance-none"
                          value={editOrder.shippingCountry || ''}
                          onChange={(e) => handleInputChange('shippingCountry', e.target.value)}
                        >
                          <option value="">Select Country...</option>
                          {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Product Selection Section */}
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm">shopping_cart</span>
                      Product Selection
                    </h3>
                    <button
                      onClick={handleAddItem}
                      className="text-[10px] font-bold uppercase tracking-widest text-primary hover:text-white transition-colors flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-sm">add</span>
                      Add Item
                    </button>
                  </div>

                  <div className="bg-[#17232f] rounded-2xl p-5 sm:p-6 border border-border-dark space-y-4">
                    {(!editOrder.items || editOrder.items.length === 0) && (
                      <div className="text-center py-4 text-text-muted text-sm italic">
                        No items in this order.
                      </div>
                    )}

                    {editOrder.items?.map((item, index) => (
                      <div key={index} className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end border-b border-border-dark/50 pb-4 last:border-0 last:pb-0">
                        <div className="sm:col-span-1 flex items-center justify-center pb-3">
                          <span className="text-xs font-bold text-text-muted/50">#{index + 1}</span>
                        </div>
                        <div className="sm:col-span-6 space-y-2">
                          <label className="text-[10px] font-black text-text-muted uppercase ml-1">SKU / Product Name</label>
                          <select
                            className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-10 px-4 focus:ring-primary/40 focus:border-primary transition-all appearance-none"
                            value={item.productId || ''}
                            onChange={(e) => handleProductSelect(index, e.target.value)}
                          >
                            <option value="">Select Product...</option>
                            {products.map(p => (
                              <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-2 space-y-2">
                          <label className="text-[10px] font-black text-text-muted uppercase ml-1">Qty</label>
                          <input
                            type="number"
                            className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-10 px-4 focus:ring-primary/40 focus:border-primary transition-all text-center"
                            value={item.quantity}
                            min="1"
                            onChange={(e) => handleItemChange(index, 'quantity', parseInt(e.target.value) || 0)}
                          />
                        </div>
                        <div className="sm:col-span-2 space-y-2">
                          <label className="text-[10px] font-black text-text-muted uppercase ml-1">Total</label>
                          <div className="h-10 flex items-center px-2 text-white font-mono text-sm max-w-full overflow-hidden text-ellipsis whitespace-nowrap" title={`$${((item.quantity || 0) * (item.unitPrice || 0)).toLocaleString()}`}>
                            ${((item.quantity || 0) * (item.unitPrice || 0)).toLocaleString()}
                          </div>
                        </div>
                        <div className="sm:col-span-1 flex items-center justify-center pb-1">
                          <button
                            onClick={() => handleRemoveItem(index)}
                            className="size-8 flex items-center justify-center rounded-lg text-red-500/50 hover:bg-red-500/10 hover:text-red-500 transition-all"
                            title="Remove Item"
                          >
                            <span className="material-symbols-outlined text-lg">delete</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Fulfillment & Logistics Section */}
                <section className="space-y-4">
                  <h3 className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">local_shipping</span>
                    Fulfillment & Logistics
                  </h3>
                  <div className="bg-[#17232f] rounded-2xl p-5 sm:p-6 border border-border-dark space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-text-muted uppercase ml-1">Fulfillment Center</label>
                        <select
                          className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary transition-all"
                          value={editOrder.fulfillmentCenterId || ''}
                          onChange={(e) => handleInputChange('fulfillmentCenterId', e.target.value)}
                        >
                          <option value="">Select Center...</option>
                          {fulfillmentCenters.map(fc => (
                            <option key={fc.id} value={fc.id}>{fc.name} — {fc.location}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center ml-1 mb-1">
                          <label className="text-[10px] font-black text-text-muted uppercase">Tracking Number</label>
                          {editOrder.trackingNumber && (
                            <div className="flex items-center gap-2">
                              <a
                                href={`https://t.17track.net/en#nums=${editOrder.trackingNumber}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-primary hover:text-white flex items-center gap-1 transition-colors font-semibold"
                                title="Track package on 17Track"
                              >
                                <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                                Track Package
                              </a>
                              <span className="text-text-muted/30">|</span>
                              <button
                                id="sync-17track-btn"
                                onClick={async (e) => {
                                  const btn = e.currentTarget;
                                  const label = btn.querySelector('.sync-label') as HTMLElement;
                                  btn.disabled = true;
                                  label.textContent = 'Syncing...';
                                  try {
                                    const res = await ordersService.syncTracking(editOrder.trackingNumber!, editOrder.courier || undefined);
                                    if (res.status === 'already_registered') {
                                      label.textContent = '✓ Already registered';
                                      label.style.color = '#22c55e';
                                      btn.disabled = false;
                                    } else if (res.status === 'registered') {
                                      label.textContent = '✓ Registered! Refreshing...';
                                      label.style.color = '#22c55e';
                                      // Wait for 17Track to process, then refresh order data
                                      setTimeout(async () => {
                                        try {
                                          const refreshed = await ordersService.getById(editOrder.id);
                                          setEditOrder(refreshed);
                                          label.textContent = 'Sync 17Track';
                                          label.style.color = '';
                                          btn.disabled = false;
                                        } catch { btn.disabled = false; }
                                      }, 8000);
                                    } else {
                                      label.textContent = `✗ ${res.detail || res.status || 'Error'}`;
                                      label.style.color = '#ef4444';
                                      btn.disabled = false;
                                    }
                                  } catch (err) {
                                    label.textContent = '✗ Failed';
                                    label.style.color = '#ef4444';
                                    btn.disabled = false;
                                  }
                                }}
                                className="text-[10px] text-amber-400 hover:text-white flex items-center gap-1 transition-colors font-semibold disabled:opacity-50 disabled:cursor-wait"
                                title="Sync tracking with 17Track"
                              >
                                <span className="material-symbols-outlined text-[14px]">sync</span>
                                <span className="sync-label">Sync 17Track</span>
                              </button>
                            </div>
                          )}
                        </div>
                        <input
                          className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 font-mono"
                          placeholder="AWB-XXXXX"
                          value={editOrder.trackingNumber || ''}
                          onChange={(e) => handleInputChange('trackingNumber', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-text-muted uppercase ml-1">Courier (Warehouse)</label>
                      <select
                        className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary transition-all"
                        value={editOrder.courier || ''}
                        onChange={(e) => handleInputChange('courier', e.target.value)}
                      >
                        <option value="">Select Warehouse...</option>
                        {fulfillmentCenters.find(fc => fc.id === editOrder.fulfillmentCenterId)?.warehouses?.map(w => (
                          <option key={w.id} value={w.name}>{w.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-text-muted uppercase ml-1">Order Notes / Instructions</label>
                      <textarea
                        className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-24 p-4 focus:ring-primary/40 resize-none"
                        placeholder="Internal notes or special handling..."
                        value={editOrder.notes || ''}
                        onChange={(e) => handleInputChange('notes', e.target.value)}
                      />
                    </div>
                  </div>
                </section>

                {/* Control Panel Section */}
                <section className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <h3 className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm">settings_input_component</span>
                      Order Control Panel
                    </h3>
                    <div className="inline-flex items-center gap-2 text-primary font-black text-[10px] uppercase tracking-widest bg-primary/10 px-4 py-1.5 rounded-full border border-primary/20 shadow-sm w-fit">
                      <span className="material-symbols-outlined text-[14px]">payments</span>
                      Projected Profit: ${calculateNetProfit(editOrder).toLocaleString()}
                    </div>
                  </div>

                  <div className="bg-[#17232f] rounded-2xl p-5 sm:p-6 border border-border-dark space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-text-muted uppercase ml-1">Confirmation Status</label>
                        <select
                          className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary transition-all"
                          value={editOrder.confirmationStatus || 'Pending'}
                          onChange={(e) => handleInputChange('confirmationStatus', e.target.value)}
                        >
                          <option value="Confirmed">Confirmed</option>
                          <option value="Pending">Pending</option>
                          <option value="Declined">Declined</option>
                          <option value="Call Center">Call Center</option>
                          <option value="Cancelled">Cancelled</option>
                          <option value="No Answer">No Answer</option>
                          <option value="Wait Until Stock">Wait Until Stock</option>
                          <option value="Out of Area">Out of Area</option>
                          <option value="Duplicated">Duplicated</option>
                        </select>
                      </div>
                      {editOrder.confirmationStatus !== 'Cancelled' && (
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-text-muted uppercase ml-1">Order (Shipping) Status</label>
                          <select
                            className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            value={editOrder.orderStatus}
                            onChange={(e) => handleInputChange('orderStatus', e.target.value)}
                            disabled={editOrder.confirmationStatus !== 'Confirmed'}
                          >
                            <option value="Pending">Pending</option>
                            <option value="Processing">Processing</option>
                            <option value="InfoReceived">Info Received</option>
                            <option value="Shipped">Shipped</option>
                            <option value="NotFound">Not Found</option>
                            <option value="InTransit">In transit</option>
                            <option value="OutForDelivery">Pickup (Out of delivery)</option>
                            <option value="Delivered">Delivered</option>
                            <option value="Undelivered">Undelivered</option>
                            <option value="Exception">Exception</option>
                            <option value="Expired">Expired</option>
                            <option value="Cancelled">Cancel</option>
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Revenue Breakdown */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-[#1c2d3d]/50 p-4 rounded-xl border border-border-dark/50">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-text-muted uppercase">Shipping ($)</label>
                        <input type="number" className="bg-[#17232f] border border-border-dark text-white text-xs rounded-lg w-full h-9 px-3"
                          value={editOrder.shippingFee || 0}
                          onChange={(e) => handleInputChange('shippingFee', parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-text-muted uppercase">Tax ($)</label>
                        <input type="number" className="bg-[#17232f] border border-border-dark text-white text-xs rounded-lg w-full h-9 px-3"
                          value={editOrder.taxCollected || 0}
                          onChange={(e) => handleInputChange('taxCollected', parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-text-muted uppercase">Discount ($)</label>
                        <input type="number" className="bg-[#17232f] border border-border-dark text-white text-xs rounded-lg w-full h-9 px-3"
                          value={editOrder.discountGiven || 0}
                          onChange={(e) => handleInputChange('discountGiven', parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-text-muted uppercase">Total Revenue</label>
                        <div className="h-9 flex items-center px-3 bg-primary/10 border border-primary/20 text-primary font-bold text-sm rounded-lg">
                          ${(editOrder.totalAmount || 0).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      {/* Placeholder for removed Gross Revenue input */}
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-text-muted uppercase ml-1">Payment Status</label>
                      <select
                        className="bg-[#1c2d3d] border-[#2d445a] text-emerald-400 font-bold text-sm rounded-xl w-full h-12 px-4 focus:ring-emerald-500/40"
                        value={editOrder.paymentStatus || 'Pending'}
                        onChange={(e) => handleInputChange('paymentStatus', e.target.value)}
                      >
                        <option value="Pending">Pending (COD Uncollected)</option>
                        <option value="Paid">Paid (COD Collected)</option>
                        <option value="Refused">Refused</option>
                        <option value="Refunded">Refunded</option>
                      </select>
                    </div>
                  </div>
                </section>

                {/* Order History Logs Section */}
                <section className="space-y-4">
                  <h3 className="text-xs font-black text-text-muted uppercase tracking-widest flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">history</span>
                    Tracking & Communication History
                  </h3>
                  <div className="bg-[#17232f] rounded-2xl p-6 border border-border-dark space-y-8">
                    {(() => {
                      // Merge Tracking Logs + Customer Responses + Call Logs
                      const historyItems = [...(editOrder.trackingHistory || [])].map(t => ({ ...t, _type: 'tracking', _date: t.statusDate }));
                      const msgItems = [...(editOrder.customerResponses || [])].map(m => ({ ...m, _type: 'message', _date: m.sentAt }));
                      const callItems = [...(editOrder.callLogs || [])].filter((c: any) => !c.callSid?.startsWith('SKIPPED-')).map((c: any) => ({ ...c, _type: 'call', _date: c.createdAt }));

                      // Deduplicate tracking entries (same status + substatus + description within 5 minutes)
                      const dedupedHistory = historyItems.filter((item, index) => {
                        return !historyItems.some((other, otherIndex) =>
                          otherIndex < index &&
                          other.status === item.status &&
                          other.substatus === item.substatus &&
                          other.description === item.description &&
                          Math.abs(new Date(other._date).getTime() - new Date(item._date).getTime()) < 5 * 60 * 1000
                        );
                      });

                      const merged = [...dedupedHistory, ...msgItems, ...callItems].sort((a, b) => new Date(b._date).getTime() - new Date(a._date).getTime());

                      if (merged.length === 0) {
                        return (
                          <div className="text-center py-4">
                            <span className="text-xs text-text-muted italic">No tracking, call, or message logs available for this order.</span>
                          </div>
                        );
                      }

                      return merged.map((log: any, i: number) => {
                        const dateObj = new Date(log._date);
                        const formattedDate = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

                        if (log._type === 'call') {
                          // Render a Twilio call log entry
                          const isSuccess = log.callStatus === 'completed';
                          const isFailed = ['no-answer', 'busy', 'failed', 'canceled'].includes(log.callStatus);
                          const dotColor = isSuccess ? 'bg-green-500 ring-green-500/10' : isFailed ? 'bg-red-500 ring-red-500/10' : 'bg-yellow-500 ring-yellow-500/10';
                          const statusLabel = (log.callStatus || 'unknown').replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
                          return (
                            <div key={`call-${log.id || i}`} className="relative flex gap-6 pl-2 group">
                              {i !== merged.length - 1 && (
                                <div className="absolute left-[13px] top-6 bottom-[-32px] w-px bg-border-dark"></div>
                              )}
                              <div className={`z-10 mt-1.5 size-[11px] rounded flex items-center justify-center shrink-0 ${dotColor} ring-4`}>
                              </div>
                              <div className="flex flex-col gap-1 w-full relative">
                                <span className="text-[10px] font-black text-text-muted tracking-widest uppercase">{formattedDate}</span>
                                <div className="flex items-center gap-2">
                                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: isSuccess ? '#22c55e' : isFailed ? '#ef4444' : '#eab308' }}>call</span>
                                  <span className="text-sm font-black text-white">Twilio Call — Attempt #{log.attemptNumber || '?'}</span>
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${isSuccess ? 'bg-green-500/10 text-green-400 border border-green-500/20' : isFailed ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20'}`}>
                                    {statusLabel}
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-3 mt-1 text-[11px] text-text-muted">
                                  {log.callDuration != null && <span>⏱ {log.callDuration}s</span>}
                                  {log.scriptLanguage && <span>🌐 {log.scriptLanguage}</span>}
                                  {log.intentDetected && <span>🎯 {log.intentDetected}</span>}
                                  {log.speechResult && <span>🗣 "{log.speechResult}"</span>}
                                </div>
                              </div>
                            </div>
                          );
                        }

                        if (log._type === 'message') {
                          // Render a sent message log
                          const isWa = log.notificationType === 'whatsapp_personal';
                          return (
                            <div key={`msg-${log.id || i}`} className="relative flex gap-6 pl-2 group">
                              {i !== merged.length - 1 && (
                                <div className="absolute left-[13px] top-6 bottom-[-32px] w-px bg-border-dark"></div>
                              )}
                              <div className={`z-10 mt-1.5 size-[11px] rounded flex items-center justify-center shrink-0 ${isWa ? 'bg-green-500 ring-4 ring-green-500/10' : 'bg-blue-500 ring-4 ring-blue-500/10'}`}>
                              </div>
                              <div className="flex flex-col gap-1 w-full relative">
                                <span className="text-[10px] font-black text-text-muted tracking-widest uppercase">{formattedDate}</span>
                                <div className="flex items-center gap-2">
                                  {isWa ? (
                                    <img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" alt="WA" className="size-3" />
                                  ) : (
                                    <span className="material-symbols-outlined text-blue-400" style={{ fontSize: 14 }}>chat</span>
                                  )}
                                  <span className="text-sm font-black text-white">Sent {isWa ? 'WhatsApp' : 'SMS'}</span>
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${log.status === 'sent' || log.status === 'delivered' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20'}`}>
                                    {log.status}
                                  </span>
                                </div>
                                <div className="bg-[#1a2332] border border-border-dark p-3 rounded-xl mt-1 text-xs text-text-muted opacity-90 relative">
                                  <span className="absolute -top-1.5 -left-1.5 size-3 bg-[#1a2332] border-l border-t border-border-dark rotate-45 transform"></span>
                                  {log.messageContent}
                                </div>
                              </div>
                            </div>
                          );
                        }

                        // Render a normal tracking status log
                        return (
                          <div key={`trk-${log.id || i}`} className="relative flex gap-6 pl-2 group">
                            {i !== merged.length - 1 && (
                              <div className="absolute left-[13px] top-6 bottom-[-32px] w-px bg-border-dark"></div>
                            )}
                            <div className="z-10 mt-1.5 size-2.5 rounded-full bg-primary ring-4 ring-primary/10 shrink-0"></div>
                            <div className="flex flex-col gap-1 w-full relative">
                              <span className="text-[10px] font-black text-text-muted tracking-widest uppercase">{formattedDate}</span>
                              <span className="text-sm font-black text-white">{log.status} <span className="text-text-muted">{log.substatus ? `- ${log.substatus}` : ''}</span></span>
                              {log.description && <span className="text-xs text-text-muted italic opacity-80 mt-1">{log.description}</span>}
                              {log.carrierName && <span className="text-[10px] text-primary mt-0.5">{log.carrierName} {log.location ? `— ${log.location}` : ''}</span>}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </section>

              </div>

              {/* Sticky Actions */}
              <div className="p-6 sm:p-8 bg-[#17232f] border-t border-border-dark flex gap-3 sm:gap-4 sticky bottom-0 z-[110] shadow-2xl">
                <button onClick={() => setShowDrawer(false)} className="flex-1 h-12 sm:h-14 bg-[#1c2d3d] hover:bg-[#233648] text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all border border-border-dark">
                  Discard
                </button>
                <button
                  onClick={saveChanges}
                  className="flex-[2] h-12 sm:h-14 bg-primary hover:bg-primary/90 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 shadow-xl shadow-primary/20"
                >
                  <span className="material-symbols-outlined text-lg hidden xs:inline-block">check_circle</span>
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Success Toast */}
      {
        showSuccessToast && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-[#101922]/60 backdrop-blur-sm" onClick={() => setShowSuccessToast(false)}>
            <div className="bg-[#101922] rounded-xl px-12 py-10 shadow-[0_0_40px_rgba(34,197,94,0.15)] flex flex-col items-center gap-3 max-w-sm w-full animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
              <span className="material-symbols-outlined text-green-500 text-6xl font-light mb-2" style={{ fontVariationSettings: "'wght' 200, 'FILL' 0" }}>check_circle</span>
              <h2 className="text-white text-xl font-semibold tracking-wide text-center">
                Changes Saved
              </h2>
              <p className="text-white/40 text-sm text-center">
                Your order has been updated in the system.
              </p>
            </div>
          </div>
        )
      }

      {/* Error Toast */}
      {
        showErrorToast && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-[#101922]/60 backdrop-blur-sm" onClick={() => setShowErrorToast(false)}>
            <div className="bg-[#101922] border border-red-500/20 rounded-xl p-12 shadow-[0_0_50px_-12px_rgba(239,68,68,0.3)] flex flex-col items-center gap-6 max-w-sm w-full animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
              <div className="size-16 rounded-full bg-red-500/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-red-500 text-4xl">cancel</span>
              </div>
              <div className="text-center">
                <h2 className="text-white text-2xl font-bold tracking-tight mb-2">
                  Save Order Failed
                </h2>
                <p className="text-white/50 text-sm leading-relaxed">
                  Please check your connection and try again.
                </p>
              </div>
              <div className="w-12 h-1 bg-red-500/20 rounded-full"></div>
            </div>
          </div>
        )
      }

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={closeImportModal} />
          <div className="bg-card w-full max-w-4xl max-h-[90vh] rounded-2xl border border-border flex flex-col relative shadow-2xl overflow-hidden animate-fade-in-up">

            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-border bg-card-dark">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined">upload_file</span>
                </div>
                <div>
                  <h2 className="text-xl font-black text-white tracking-tight">Bulk Import Orders</h2>
                  <p className="text-sm font-medium text-text-muted mt-0.5">
                    {importStep === 1 && "Upload your CSV or Excel file"}
                    {importStep === 2 && "Preview and map your data"}
                    {importStep === 3 && "Import results"}
                  </p>
                </div>
              </div>
              <button
                onClick={closeImportModal}
                disabled={isImporting}
                className="size-8 flex items-center justify-center rounded-lg hover:bg-white/5 text-text-muted transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
              {/* STEP 1: UPLOAD */}
              {importStep === 1 && (
                <div className="space-y-6 animate-fade-in">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-[#1c2d3d] rounded-xl p-4 border border-[#2d445a]">
                      <div className="size-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-3">
                        <span className="material-symbols-outlined text-[18px]">add_circle</span>
                      </div>
                      <h3 className="text-sm font-bold text-white mb-1">Create New</h3>
                      <p className="text-[11px] text-text-muted leading-relaxed">Leave <code className="text-emerald-400 bg-emerald-400/10 px-1 rounded">order_number</code> blank to securely auto-generate an ID.</p>
                    </div>
                    <div className="bg-[#1c2d3d] rounded-xl p-4 border border-[#2d445a]">
                      <div className="size-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center mb-3">
                        <span className="material-symbols-outlined text-[18px]">update</span>
                      </div>
                      <h3 className="text-sm font-bold text-white mb-1">Update Existing</h3>
                      <p className="text-[11px] text-text-muted leading-relaxed">Match an existing <code className="text-blue-400 bg-blue-400/10 px-1 rounded">order_number</code> to overwrite its components.</p>
                    </div>
                    <div className="bg-[#1c2d3d] rounded-xl p-4 border border-[#2d445a]">
                      <div className="size-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center mb-3">
                        <span className="material-symbols-outlined text-[18px]">layers</span>
                      </div>
                      <h3 className="text-sm font-bold text-white mb-1">Multi-Item</h3>
                      <p className="text-[11px] text-text-muted leading-relaxed">Duplicate the <code className="text-purple-400 bg-purple-400/10 px-1 rounded">order_number</code> across multiple rows for nested cart items.</p>
                    </div>
                  </div>

                  <div className="border-2 border-dashed border-[#2d445a] rounded-2xl p-10 flex flex-col items-center justify-center text-center bg-[#1c2d3d]/50 hover:bg-[#1c2d3d] transition-colors relative group">
                    <input
                      type="file"
                      accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                      onChange={handleFileUpload}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div className="size-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <span className="material-symbols-outlined text-3xl">upload_file</span>
                    </div>
                    <h3 className="text-lg font-black text-white mb-2">Drag & Drop your file here</h3>
                    <p className="text-sm font-medium text-text-muted max-w-sm mb-6">
                      Support for standard .CSV or .XLSX spreadsheets. Ensure your column names strictly match the system headers.
                    </p>
                    <button
                      onClick={(e) => { e.stopPropagation(); downloadTemplate(); }}
                      className="relative z-20 flex items-center justify-center rounded-lg h-10 px-6 bg-[#233648] text-white text-sm font-bold border border-[#2d445a] hover:bg-[#2d445a] transition-all"
                    >
                      <span className="material-symbols-outlined mr-2" style={{ fontSize: '18px' }}>download</span>
                      Download Template File
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: PREVIEW */}
              {importStep === 2 && (
                <div className="space-y-6 animate-fade-in">
                  <div className="flex flex-col sm:flex-row gap-4 sm:justify-between sm:items-end">
                    <div>
                      <h3 className="text-lg font-black text-white">Data Preview</h3>
                      <p className="text-sm font-medium text-text-muted">Total rows detected: {importData.length}</p>
                    </div>
                    <div className="flex flex-col gap-2 bg-[#1c2d3d] p-4 rounded-xl border border-[#2d445a]">
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <div className="relative flex items-center justify-center">
                          <input
                            type="checkbox"
                            checked={skipRiskAssessment}
                            onChange={(e) => setSkipRiskAssessment(e.target.checked)}
                            className="peer appearance-none size-5 rounded-md border-2 border-border-dark bg-card-dark checked:bg-orange-500 checked:border-orange-500 transition-all"
                          />
                          <span className="material-symbols-outlined absolute text-white text-[16px] opacity-0 peer-checked:opacity-100 pointer-events-none">check</span>
                        </div>
                        <span className="text-sm font-bold text-white group-hover:text-orange-400 transition-colors">Skip Risk Assessment (Twilio Calls)</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <div className="relative flex items-center justify-center">
                          <input
                            type="checkbox"
                            checked={skipInventory}
                            onChange={(e) => setSkipInventory(e.target.checked)}
                            className="peer appearance-none size-5 rounded-md border-2 border-border-dark bg-card-dark checked:bg-orange-500 checked:border-orange-500 transition-all"
                          />
                          <span className="material-symbols-outlined absolute text-white text-[16px] opacity-0 peer-checked:opacity-100 pointer-events-none">check</span>
                        </div>
                        <span className="text-sm font-bold text-white group-hover:text-orange-400 transition-colors">Skip Inventory Deductions</span>
                      </label>
                    </div>
                  </div>

                  <div className="border border-border-dark rounded-xl overflow-x-auto bg-[#1c2d3d] max-h-[400px]">
                    <table className="w-full text-left border-collapse whitespace-nowrap">
                      <thead className="bg-[#233648] sticky top-0 z-10">
                        <tr>
                          {importData.length > 0 && Object.keys(importData[0]).map((key) => (
                            <th key={key} className="px-4 py-3 text-xs font-bold text-text-muted uppercase tracking-wider border-b border-border-dark">
                              {key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {importData.slice(0, 5).map((row, i) => (
                          <tr key={i} className="border-b border-border-dark/50 hover:bg-white/5">
                            {Object.values(row).map((val: any, j) => (
                              <td key={j} className={`px-4 py-3 text-sm ${!val && i === 0 ? 'text-red-400 font-bold bg-red-500/10' : 'text-white'}`}>
                                {val?.toString() || '-'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-center text-xs font-medium text-text-muted">Showing first 5 rows for validation...</p>
                </div>
              )}

              {/* STEP 3: RESULTS */}
              {importStep === 3 && (
                <div className="flex flex-col items-center justify-center py-10 space-y-8 animate-fade-in">

                  {isImporting ? (
                    <div className="flex flex-col items-center max-w-md text-center">
                      <div className="size-16 border-4 border-[#2d445a] border-t-primary rounded-full animate-spin mb-6"></div>
                      <h3 className="text-xl font-black text-white mb-2">Processing Data...</h3>
                      <p className="text-sm font-medium text-text-muted">We are safely upserting {importData.length} rows. Please do not close your browser.</p>
                      <div className="w-full bg-[#1c2d3d] rounded-full h-2.5 mt-6 overflow-hidden">
                        <div className="bg-primary h-2.5 rounded-full w-full animate-pulse"></div>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full space-y-6">
                      <div className="flex flex-col items-center max-w-md mx-auto text-center mb-8">
                        <div className={`size-16 rounded-full flex items-center justify-center text-3xl mb-4 ${(importResults?.errors?.length || 0) > 0 ? 'bg-orange-500/10 text-orange-500' : 'bg-emerald-500/10 text-emerald-400'}`}>
                          <span className="material-symbols-outlined">{(importResults?.errors?.length || 0) > 0 ? 'warning' : 'check_circle'}</span>
                        </div>
                        <h3 className="text-xl font-black text-white mb-2">Import Finished</h3>
                        <p className="text-sm font-medium text-text-muted">The dataset has been completely processed.</p>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-card-dark border border-border-dark p-4 rounded-xl text-center">
                          <div className="text-2xl font-black text-emerald-400 mb-1">{importResults?.created || 0}</div>
                          <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Created</div>
                        </div>
                        <div className="bg-card-dark border border-border-dark p-4 rounded-xl text-center">
                          <div className="text-2xl font-black text-blue-400 mb-1">{importResults?.updated || 0}</div>
                          <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Updated</div>
                        </div>
                        <div className="bg-card-dark border border-border-dark p-4 rounded-xl text-center">
                          <div className="text-2xl font-black text-white mb-1">{importResults?.skipped || 0}</div>
                          <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Skipped</div>
                        </div>
                        <div className="bg-card-dark border border-border-dark p-4 rounded-xl text-center">
                          <div className="text-2xl font-black text-red-400 mb-1">{importResults?.errors?.length || 0}</div>
                          <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Errors</div>
                        </div>
                      </div>

                      {(importResults?.errors?.length || 0) > 0 && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 flex flex-col md:flex-row items-center justify-between gap-4 mt-6">
                          <div>
                            <h4 className="text-sm font-bold text-red-500 mb-1">Rows Failed to Import</h4>
                            <p className="text-xs font-medium text-red-400/80">Some rows did not pass validation (e.g. strict SKU check failure, blocked customer).</p>
                          </div>
                          <button
                            onClick={downloadErrorReport}
                            className="flex items-center justify-center rounded-lg h-10 px-6 bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition-all whitespace-nowrap"
                          >
                            Download Log
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            {!isImporting && (
              <div className="p-4 border-t border-border-dark bg-[#1c2d3d] flex justify-end gap-3">
                {importStep < 3 && (
                  <button
                    onClick={closeImportModal}
                    className="h-10 px-6 rounded-lg font-bold text-sm text-white bg-transparent hover:bg-white/5 transition-colors"
                  >
                    Cancel
                  </button>
                )}
                {importStep === 2 && (
                  <button
                    onClick={executeImport}
                    className="h-10 px-8 rounded-lg font-bold text-sm text-white bg-primary hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 flex items-center gap-2"
                  >
                    Confirm Import
                  </button>
                )}
                {importStep === 3 && (
                  <button
                    onClick={closeImportModal}
                    className="h-10 px-8 rounded-lg font-bold text-sm text-white bg-primary hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
                  >
                    Done
                  </button>
                )}
              </div>
            )}

          </div>
        </div>
      )}

    </div >
  );
};

export default OrdersPage;
