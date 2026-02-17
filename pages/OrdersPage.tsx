import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ordersService, Order, OrderItem } from '../src/services/orders.service';
import { productsService, Product } from '../src/services/products.service';
import { fulfillmentService, FulfillmentCenter } from '../src/services/fulfillment.service';
import storeSettingsService, { StoreName } from '../src/services/settings.service';
import { CustomerSearch } from '../src/components/CustomerSearch';

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
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [dateFilter, setDateFilter] = useState('Last 30 Days');

  const [showDrawer, setShowDrawer] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [editOrder, setEditOrder] = useState<Order | null>(null);

  useEffect(() => {
    fetchOrders();
    fetchProducts();
    fetchFulfillmentCenters();
    fetchStoreNames();
  }, [statusFilter]);

  useEffect(() => {
    if (showDrawer && selectedOrder) {
      setEditOrder({ ...selectedOrder });
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

  const fetchOrders = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await ordersService.getAll({
        orderStatus: statusFilter === 'All Status' ? undefined : statusFilter.toLowerCase(),
      });
      setOrders(data.data || []);
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
        const { customer, items, ...orderData } = editOrder;

        const cleanItems = items?.map(item => ({
          productId: item.productId,
          productName: item.productName || 'Unknown Product',
          sku: item.sku || 'N/A',
          quantity: Number(item.quantity) || 1,
          unitPrice: Number(item.unitPrice) || 0,
        }));

        const payload = {
          ...orderData,
          items: cleanItems
        };

        await ordersService.update(editOrder.id, payload);
        await fetchOrders();
        setShowDrawer(false);
      } catch (err) {
        console.error('Error updating order:', err);
        alert('Failed to save changes. Please check console for details.');
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

  const filteredOrders = orders.filter(order =>
  (order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

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
          <div className="flex gap-2 sm:gap-3">
            <button className="flex flex-1 md:flex-none items-center justify-center rounded-lg h-10 px-4 bg-[#233648] text-white text-sm font-bold border border-[#2d445a] hover:bg-[#2d445a] transition-all">
              <span className="material-symbols-outlined mr-2" style={{ fontSize: '18px' }}>cloud_download</span>
              Export XLS
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
          <div className="md:col-span-2 relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-[20px]">search</span>
            <input
              type="text"
              placeholder="Search by order ID or customer name..."
              className="w-full pl-10 pr-4 py-2.5 bg-card-dark border border-border-dark rounded-xl text-white placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="relative">
            <select
              className="w-full px-4 py-2.5 bg-card-dark border border-border-dark rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm appearance-none cursor-pointer"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option>All Status</option>
              <option>Pending</option>
              <option>Processing</option>
              <option>Shipped</option>
              <option>Delivered</option>
              <option>Returned</option>
              <option>Cancelled</option>
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
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-[#111a22] rounded-xl border border-border-dark overflow-hidden flex flex-col mb-12 shadow-2xl">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[1000px] lg:min-w-[1400px]">
            <thead>
              <tr className="bg-[#17232f] border-b border-[#233648]">
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
                  <td colSpan={7} className="px-6 py-12 text-center text-text-muted">
                    <div className="flex flex-col items-center gap-2">
                      <div className="animate-spin size-6 border-2 border-primary border-t-transparent rounded-full"></div>
                      <p className="text-sm">Loading orders...</p>
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-red-500">
                    <div className="flex flex-col items-center gap-2">
                      <span className="material-symbols-outlined text-3xl">error</span>
                      <p className="text-sm">{error}</p>
                    </div>
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-text-muted">
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
                      className="hover:bg-[#1c2d3d] transition-colors cursor-pointer group"
                      onClick={() => { setSelectedOrder(order); setShowDrawer(true); }}
                    >
                      <td className="px-4 sm:px-6 py-6">
                        <p className="text-sm font-bold text-primary group-hover:underline underline-offset-4">#{order.orderNumber}</p>
                        <p className="text-xs text-white mt-1 font-medium">{order.customer?.name || 'Unknown User'}</p>
                        <p className="text-[10px] text-text-muted mt-1 uppercase tracking-widest">{order.shippingCountry || 'N/A'}</p>
                      </td>
                      <td className="px-4 sm:px-6 py-6">
                        <div className={`inline-flex items-center px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest bg-opacity-10 border ${(order.confirmationStatus || 'Pending') === 'Confirmed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                          (order.confirmationStatus || 'Pending') === 'Pending' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                            'bg-red-500/10 text-red-400 border-red-500/20'
                          }`}>
                          {order.confirmationStatus || 'Pending'}
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-6">
                        <div className="flex items-center gap-2">
                          <span className={`size-1.5 rounded-full ${order.orderStatus === 'Delivered' ? 'bg-emerald-500' : order.orderStatus === 'In Transit' ? 'bg-blue-400' : 'bg-primary/60'}`}></span>
                          <span className="text-xs font-bold text-text-muted uppercase tracking-wider">
                            {order.orderStatus}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-6 text-sm font-black text-white text-right whitespace-nowrap">
                        ${order.totalAmount.toLocaleString()}
                      </td>
                      <td className="px-4 sm:px-6 py-6 text-sm font-black text-text-muted text-right whitespace-nowrap">
                        ${(order.paymentStatus === 'Paid' ? order.totalAmount : 0).toLocaleString()}
                      </td>
                      <td className={`px-4 sm:px-6 py-6 text-sm font-black text-right whitespace-nowrap ${profit > 0 ? 'text-emerald-400' : profit < 0 ? 'text-red-400' : 'text-text-muted'}`}>
                        {profit >= 0 ? '+' : ''}${profit.toLocaleString()}
                      </td>
                      <td className="px-4 sm:px-6 py-6 text-center">
                        <button className="p-2 hover:bg-primary/10 rounded-xl text-text-muted hover:text-primary transition-all">
                          <span className="material-symbols-outlined text-[20px]">edit_square</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Responsive Order Detail Drawer */}
      {showDrawer && editOrder && (
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
                      <label className="text-[10px] font-black text-text-muted uppercase ml-1">Tracking Number</label>
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
                        <option value="Cancelled">Cancelled</option>
                        <option value="No Answer">No Answer</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-text-muted uppercase ml-1">Order (Shipping) Status</label>
                      <select
                        className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary transition-all"
                        value={editOrder.orderStatus}
                        onChange={(e) => handleInputChange('orderStatus', e.target.value)}
                      >
                        <option value="Pending">Pending</option>
                        <option value="Processing">Processing</option>
                        <option value="Shipped">Shipped</option>
                        <option value="In Transit">In Transit</option>
                        <option value="Delivered">Delivered</option>
                        <option value="Returned">Returned</option>
                        <option value="Cancelled">Cancelled</option>
                      </select>
                    </div>
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

              {/* Order History Logs Section (Mocked for now) */}
              <section className="space-y-4">
                <h3 className="text-xs font-black text-text-muted uppercase tracking-widest flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">history</span>
                  Order History Logs
                </h3>
                <div className="bg-[#17232f] rounded-2xl p-6 border border-border-dark space-y-8">
                  {MOCK_LOGS.map((log, i) => (
                    <div key={i} className="relative flex gap-6 pl-2 group">
                      {i !== MOCK_LOGS.length - 1 && (
                        <div className="absolute left-[13px] top-6 bottom-[-32px] w-px bg-border-dark"></div>
                      )}
                      <div className="z-10 mt-1.5 size-2.5 rounded-full bg-primary ring-4 ring-primary/10 shrink-0"></div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-black text-text-muted tracking-widest uppercase">{log.date}</span>
                        <span className="text-sm font-black text-white">{log.status}</span>
                        <span className="text-xs text-text-muted italic opacity-80">{log.note}</span>
                      </div>
                    </div>
                  ))}
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
        </div >
      )}
    </div >
  );
};

export default OrdersPage;
