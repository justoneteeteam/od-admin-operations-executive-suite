import React, { useState, useEffect } from 'react';
import { customersService, Customer } from '../src/services/customers.service';

const COUNTRIES = [
  "Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czech Republic",
  "Denmark", "Estonia", "Finland", "France", "Germany", "Greece",
  "Hungary", "Ireland", "Italy", "Latvia", "Lithuania", "Luxembourg",
  "Malta", "Netherlands", "Poland", "Portugal", "Romania", "Slovakia",
  "Slovenia", "Spain", "Sweden", "United Kingdom", "United States",
  "Canada", "Australia", "Other"
];

const CustomersPage: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Drawer & Form State
  const [showDrawer, setShowDrawer] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState<Partial<Customer>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Customer Detail Drawer
  const [showDetailDrawer, setShowDetailDrawer] = useState(false);
  const [detailCustomer, setDetailCustomer] = useState<any>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Bulk Block Modal
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockPhones, setBlockPhones] = useState('');
  const [blockEmails, setBlockEmails] = useState('');
  const [isBlocking, setIsBlocking] = useState(false);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    setIsLoading(true);
    try {
      const data = await customersService.getAll();
      setCustomers(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch customers:', err);
      setError('Failed to load customers. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone?.includes(searchTerm)
  );

  const handleAddNew = () => {
    setEditingCustomer(null);
    setFormData({ country: '' });
    setShowDrawer(true);
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({ ...customer });
    setShowDrawer(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this customer?')) return;
    try {
      await customersService.delete(id);
      setCustomers(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      console.error('Failed to delete customer:', err);
      alert('Failed to delete customer');
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.phone || !formData.country) {
      alert('Please fill in all required fields (Name, Phone, Country)');
      return;
    }
    setIsSaving(true);
    try {
      if (editingCustomer) {
        await customersService.update(editingCustomer.id, formData);
      } else {
        await customersService.create(formData);
      }
      await fetchCustomers();
      setShowDrawer(false);
    } catch (err: any) {
      console.error('Failed to save customer:', err);
      if (err.response?.status === 409) {
        alert('A customer with this phone number already exists.');
      } else {
        alert('Failed to save customer details.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const toggleBlock = async (customer: Customer) => {
    const newStatus = customer.status === 'Blocked' ? 'Standard' : 'Blocked';
    try {
      setCustomers(prev => prev.map(c => c.id === customer.id ? { ...c, status: newStatus } : c));
      await customersService.update(customer.id, { status: newStatus });
    } catch (err) {
      setCustomers(prev => prev.map(c => c.id === customer.id ? { ...c, status: customer.status } : c));
      console.error('Failed to update status', err);
    }
  };

  const handleInputChange = (field: keyof Customer, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Customer Detail
  const openDetailDrawer = async (customer: Customer) => {
    setShowDetailDrawer(true);
    setIsLoadingDetail(true);
    try {
      const detail = await customersService.getById(customer.id);
      setDetailCustomer(detail);
    } catch (err) {
      console.error('Failed to load customer detail:', err);
      setDetailCustomer(null);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // Bulk Block
  const handleBulkBlock = async () => {
    const phones = blockPhones.split('\n').map(p => p.trim()).filter(Boolean);
    const emails = blockEmails.split('\n').map(e => e.trim()).filter(Boolean);

    if (phones.length === 0 && emails.length === 0) {
      alert('Please enter at least one phone number or email to block.');
      return;
    }

    setIsBlocking(true);
    try {
      const result = await customersService.bulkBlock(phones, emails);
      alert(`Successfully blocked ${result.blocked} customer(s).`);
      setShowBlockModal(false);
      setBlockPhones('');
      setBlockEmails('');
      await fetchCustomers();
    } catch (err) {
      console.error('Bulk block failed:', err);
      alert('Failed to bulk block customers.');
    } finally {
      setIsBlocking(false);
    }
  };

  const getStatusBadge = (status?: string) => {
    if (status === 'Blocked') return 'bg-red-500/15 text-red-400 border-red-500/20';
    return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  };

  const getOrderStatusColor = (status?: string) => {
    if (!status) return 'text-text-muted';
    const s = status.toLowerCase();
    if (s.includes('deliver')) return 'text-emerald-400';
    if (s.includes('transit') || s.includes('ship')) return 'text-blue-400';
    if (s.includes('exception') || s.includes('return')) return 'text-red-400';
    if (s.includes('pending')) return 'text-amber-400';
    return 'text-text-muted';
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header Section */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-text-muted text-sm font-medium">Home</span>
          <span className="text-text-muted text-sm">/</span>
          <span className="text-white text-sm font-medium">Customer Intelligence</span>
        </div>
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4 mt-2">
          <div className="flex flex-col gap-1 w-full lg:w-auto">
            <h1 className="text-white text-3xl sm:text-4xl font-black tracking-tight">Customers</h1>
            <p className="text-text-muted text-sm max-w-xl leading-relaxed">
              Monitor buyer history and manage blocklists for COD fulfillment.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
            <div className="relative w-full sm:w-auto">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-[20px]">search</span>
              <input
                type="text"
                placeholder="Search customers..."
                className="bg-[#111a22] border border-border-dark text-white text-sm rounded-xl h-12 pl-10 pr-4 focus:ring-primary/40 focus:border-primary transition-all w-full sm:w-64"
                value={searchTerm}
                onChange={handleSearch}
              />
            </div>
            <button
              onClick={() => setShowBlockModal(true)}
              className="flex flex-1 sm:flex-none items-center justify-center rounded-xl h-12 px-6 bg-red-500/10 text-red-400 border border-red-500/20 text-sm font-bold hover:bg-red-500/20 transition-all whitespace-nowrap"
            >
              <span className="material-symbols-outlined mr-2" style={{ fontSize: '20px' }}>block</span>
              Block List
            </button>
            <button
              onClick={handleAddNew}
              className="flex flex-1 sm:flex-none items-center justify-center rounded-xl h-12 px-6 bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 whitespace-nowrap"
            >
              <span className="material-symbols-outlined mr-2" style={{ fontSize: '20px' }}>person_add</span>
              Add Customer
            </button>
          </div>
        </div>
      </div>

      {/* Database View */}
      <div className="bg-[#111a22] rounded-2xl border border-border-dark overflow-hidden flex flex-col shadow-2xl">
        {isLoading ? (
          <div className="p-10 text-center text-text-muted animate-pulse">Loading users...</div>
        ) : error ? (
          <div className="p-10 text-center text-red-400">{error}</div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-[#17232f]/50 border-b border-border-dark">
                  <th className="px-8 py-5 text-text-muted font-black text-[10px] uppercase tracking-[0.15em] w-[35%]">Customer Profile</th>
                  <th className="px-8 py-5 text-text-muted font-black text-[10px] uppercase tracking-[0.15em] text-center">Contact</th>
                  <th className="px-8 py-5 text-text-muted font-black text-[10px] uppercase tracking-[0.15em] text-center">Stats</th>
                  <th className="px-8 py-5 text-text-muted font-black text-[10px] uppercase tracking-[0.15em] text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dark/40">
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-text-muted">No customers found.</td>
                  </tr>
                ) : (
                  filteredCustomers.map((customer) => (
                    <tr
                      key={customer.id}
                      className={`transition-all duration-200 hover:bg-white/[0.02] cursor-pointer ${customer.status === 'Blocked' ? 'bg-red-500/[0.03] border-l-2 border-l-red-500' : 'border-l-2 border-l-transparent'
                        }`}
                      onClick={() => openDetailDrawer(customer)}
                    >
                      {/* Profile Column */}
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4">
                          <div className={`size-11 rounded-xl flex items-center justify-center text-sm font-bold border transition-colors ${customer.status === 'Blocked'
                            ? 'bg-red-500/10 text-red-400 border-red-500/20'
                            : 'bg-[#1c2d3d] text-white border-[#2d445a]'
                            }`}>
                            {customer.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <p className={`text-base font-bold transition-colors ${customer.status === 'Blocked' ? 'text-red-400' : 'text-white'}`}>
                              {customer.name}
                            </p>
                            <p className="text-xs text-text-muted opacity-70 flex items-center gap-1">
                              <span className={`size-1.5 rounded-full ${customer.status === 'Blocked' ? 'bg-red-500' : 'bg-emerald-500'}`}></span>
                              {customer.status || 'Standard'}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Contact Column */}
                      <td className="px-8 py-6 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-sm font-medium text-white">{customer.email || 'No Email'}</span>
                          <span className="text-xs text-text-muted">{customer.phone}</span>
                          <span className="text-[10px] text-text-muted uppercase mt-1">{customer.country}</span>
                        </div>
                      </td>

                      {/* Stats Column */}
                      <td className="px-8 py-6 text-center">
                        <div className="flex flex-col items-center">
                          <p className="text-base font-black text-white">{customer.ordersCount || 0} Orders</p>
                          <p className="text-[10px] text-text-muted font-medium mt-1">
                            ${(customer.totalSpent || 0).toLocaleString()} Spent
                          </p>
                        </div>
                      </td>

                      {/* Actions Column */}
                      <td className="px-8 py-6" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-center items-center gap-3">
                          <button
                            onClick={() => toggleBlock(customer)}
                            className={`p-2 rounded-lg transition-all ${customer.status === 'Blocked' ? 'bg-red-500/20 text-red-400' : 'bg-[#1c2d3d] text-text-muted hover:text-white'}`}
                            title={customer.status === 'Blocked' ? "Unblock Customer" : "Block Customer"}
                          >
                            <span className="material-symbols-outlined text-[20px]">{customer.status === 'Blocked' ? 'block' : 'check_circle'}</span>
                          </button>

                          <button
                            onClick={() => handleEdit(customer)}
                            className="p-2 hover:bg-primary/10 rounded-lg text-text-muted hover:text-primary transition-all"
                            title="Edit Customer"
                          >
                            <span className="material-symbols-outlined text-[20px]">edit_square</span>
                          </button>

                          <button
                            onClick={() => handleDelete(customer.id)}
                            className="p-2 hover:bg-red-500/10 rounded-lg text-text-muted hover:text-red-500 transition-all"
                            title="Delete Customer"
                          >
                            <span className="material-symbols-outlined text-[20px]">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer Info */}
        <div className="bg-[#17232f]/80 px-8 py-4 border-t border-border-dark flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest">
              Sync Active
            </p>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest">
              {customers.filter(c => c.status === 'Blocked').length} Blocked
            </p>
            <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest">
              {customers.length} Records
            </p>
          </div>
        </div>
      </div>

      {/* ======================== CUSTOMER DETAIL DRAWER ======================== */}
      {showDetailDrawer && (
        <div className="fixed inset-0 z-[200] flex justify-end">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowDetailDrawer(false)}></div>
          <div className="relative w-full sm:w-[580px] h-full bg-[#111a22] border-l border-border-dark flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="px-6 sm:px-8 py-6 border-b border-border-dark flex items-center justify-between bg-[#14202c]">
              <div>
                <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-3 tracking-tight">
                  Customer Detail
                </h2>
                <p className="text-[10px] text-text-muted mt-1 uppercase tracking-widest font-bold">
                  Profile & Order History
                </p>
              </div>
              <button onClick={() => setShowDetailDrawer(false)} className="size-10 flex items-center justify-center rounded-full hover:bg-red-500/10 hover:text-red-500 text-text-muted transition-all">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 sm:p-8 space-y-8">
              {isLoadingDetail ? (
                <div className="flex items-center justify-center h-40">
                  <div className="size-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></div>
                </div>
              ) : detailCustomer ? (
                <>
                  {/* Customer Info Card */}
                  <div className="bg-[#14202c] rounded-2xl border border-border-dark p-6 space-y-4">
                    <div className="flex items-center gap-4">
                      <div className={`size-14 rounded-xl flex items-center justify-center text-lg font-bold border ${detailCustomer.status === 'Blocked'
                        ? 'bg-red-500/10 text-red-400 border-red-500/20'
                        : 'bg-[#1c2d3d] text-white border-[#2d445a]'}`}>
                        {detailCustomer.name?.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white">{detailCustomer.name}</h3>
                        <span className={`inline-flex items-center gap-1.5 text-xs font-bold border rounded-full px-3 py-0.5 mt-1 ${getStatusBadge(detailCustomer.status)}`}>
                          <span className={`size-1.5 rounded-full ${detailCustomer.status === 'Blocked' ? 'bg-red-400' : 'bg-emerald-400'}`}></span>
                          {detailCustomer.status || 'Standard'}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                      <div>
                        <p className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Phone</p>
                        <p className="text-sm text-white font-medium">{detailCustomer.phone || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Email</p>
                        <p className="text-sm text-white font-medium">{detailCustomer.email || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Country</p>
                        <p className="text-sm text-white font-medium">{detailCustomer.country || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">City</p>
                        <p className="text-sm text-white font-medium">{detailCustomer.city || '—'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Order History */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm">receipt_long</span>
                        Order History
                      </h3>
                      <span className="text-[10px] font-bold text-text-muted bg-[#1c2d3d] px-2 py-1 rounded-lg">
                        {detailCustomer.orders?.length || 0} orders
                      </span>
                    </div>

                    {(!detailCustomer.orders || detailCustomer.orders.length === 0) ? (
                      <div className="bg-[#14202c] rounded-xl border border-border-dark p-8 text-center">
                        <span className="material-symbols-outlined text-3xl text-text-muted/40 mb-2">shopping_cart</span>
                        <p className="text-sm text-text-muted">No orders found for this customer.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {detailCustomer.orders.map((order: any) => (
                          <div key={order.id} className="bg-[#14202c] rounded-xl border border-border-dark p-4 hover:border-primary/20 transition-all">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-bold text-white">{order.orderNumber}</span>
                              <span className={`text-xs font-bold ${getOrderStatusColor(order.orderStatus || order.status)}`}>
                                {order.orderStatus || order.status || 'Pending'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-text-muted">
                                {order.orderDate ? new Date(order.orderDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                              </span>
                              <span className="text-sm font-bold text-white">
                                ${Number(order.totalAmount || 0).toLocaleString()}
                              </span>
                            </div>
                            {order.trackingNumber && (
                              <div className="mt-2 pt-2 border-t border-border-dark/40">
                                <span className="text-[10px] text-text-muted">Tracking: </span>
                                <a
                                  href={`https://t.17track.net/en#nums=${order.trackingNumber}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] text-primary hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {order.trackingNumber}
                                </a>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center text-red-400 py-10">Failed to load customer data.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================== EDIT DRAWER ======================== */}
      {showDrawer && (
        <div className="fixed inset-0 z-[200] flex justify-end">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowDrawer(false)}></div>
          <div className="side-drawer relative w-full sm:w-[500px] h-full bg-[#111a22] border-l border-border-dark flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="px-6 sm:px-8 py-6 border-b border-border-dark flex items-center justify-between bg-[#14202c]">
              <div>
                <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-3 tracking-tight">
                  {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
                </h2>
                <p className="text-[10px] text-text-muted mt-1 uppercase tracking-widest font-bold">
                  {editingCustomer ? `ID: ${editingCustomer.id}` : 'Create a new profile'}
                </p>
              </div>
              <button onClick={() => setShowDrawer(false)} className="size-10 flex items-center justify-center rounded-full hover:bg-red-500/10 hover:text-red-500 text-text-muted transition-all">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 sm:p-8 space-y-8">
              {/* Personal Info */}
              <div className="space-y-4">
                <h3 className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">person</span>
                  Personal Details
                </h3>
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-text-muted uppercase ml-1">Full Name</label>
                    <input
                      className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary transition-all"
                      value={formData.name || ''}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      placeholder="John Doe"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-text-muted uppercase ml-1">Email Address</label>
                    <input
                      className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary transition-all"
                      value={formData.email || ''}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      placeholder="john@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-text-muted uppercase ml-1">Phone Number</label>
                    <input
                      className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary transition-all"
                      value={formData.phone || ''}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      placeholder="+1 234 567 890"
                    />
                  </div>
                </div>
              </div>

              {/* Address Info */}
              <div className="space-y-4">
                <h3 className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">home_pin</span>
                  Address Details
                </h3>
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-text-muted uppercase ml-1">Street Address</label>
                    <input
                      className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary transition-all"
                      value={formData.addressLine1 || ''}
                      onChange={(e) => handleInputChange('addressLine1', e.target.value)}
                      placeholder="123 Main St"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-text-muted uppercase ml-1">City</label>
                      <input
                        className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary transition-all"
                        value={formData.city || ''}
                        onChange={(e) => handleInputChange('city', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-text-muted uppercase ml-1">Country</label>
                      <select
                        className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary transition-all"
                        value={formData.country || ''}
                        onChange={(e) => handleInputChange('country', e.target.value)}
                      >
                        <option value="">Select...</option>
                        {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-text-muted uppercase ml-1">Province / State</label>
                      <input
                        className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary transition-all"
                        value={formData.province || ''}
                        onChange={(e) => handleInputChange('province', e.target.value)}
                        placeholder="e.g. California"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-text-muted uppercase ml-1">Zipcode / Postal Code</label>
                      <input
                        className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary transition-all"
                        value={formData.postalCode || ''}
                        onChange={(e) => handleInputChange('postalCode', e.target.value)}
                        placeholder="e.g. 90210"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-6 border-t border-border-dark bg-[#14202c] flex justify-end gap-3">
              <button
                onClick={() => setShowDrawer(false)}
                className="px-6 py-3 rounded-xl bg-[#1c2d3d] text-text-muted font-bold text-sm hover:bg-[#233648] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-6 py-3 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center gap-2"
              >
                {isSaving && <span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>}
                {editingCustomer ? 'Save Changes' : 'Create Customer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================== BULK BLOCK MODAL ======================== */}
      {showBlockModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowBlockModal(false)}></div>
          <div className="relative bg-[#111a22] border border-border-dark rounded-2xl shadow-2xl w-full max-w-2xl mx-4 animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-8 py-6 border-b border-border-dark flex items-center justify-between bg-[#14202c] rounded-t-2xl">
              <div>
                <h2 className="text-xl font-black text-white flex items-center gap-3 tracking-tight">
                  <span className="material-symbols-outlined text-red-400">block</span>
                  Bulk Block Customers
                </h2>
                <p className="text-[10px] text-text-muted mt-1 uppercase tracking-widest font-bold">
                  Paste phone numbers or emails to block (one per line)
                </p>
              </div>
              <button onClick={() => setShowBlockModal(false)} className="size-10 flex items-center justify-center rounded-full hover:bg-red-500/10 hover:text-red-500 text-text-muted transition-all">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-8 grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-text-muted uppercase tracking-widest flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">mail</span>
                  Emails to Block
                </label>
                <textarea
                  className="bg-[#1c2d3d] border border-[#2d445a] text-white text-sm rounded-xl w-full h-56 px-4 py-3 focus:ring-red-500/40 focus:border-red-500/40 transition-all resize-none font-mono"
                  placeholder={"example1@gmail.com\nexample2@gmail.com\n..."}
                  value={blockEmails}
                  onChange={(e) => setBlockEmails(e.target.value)}
                />
                <p className="text-[10px] text-text-muted">
                  {blockEmails.split('\n').filter(e => e.trim()).length} email(s)
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-text-muted uppercase tracking-widest flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">phone</span>
                  Phone Numbers to Block
                </label>
                <textarea
                  className="bg-[#1c2d3d] border border-[#2d445a] text-white text-sm rounded-xl w-full h-56 px-4 py-3 focus:ring-red-500/40 focus:border-red-500/40 transition-all resize-none font-mono"
                  placeholder={"618220163\n656371848\n641342783\n..."}
                  value={blockPhones}
                  onChange={(e) => setBlockPhones(e.target.value)}
                />
                <p className="text-[10px] text-text-muted">
                  {blockPhones.split('\n').filter(p => p.trim()).length} phone(s)
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-8 py-5 border-t border-border-dark bg-[#14202c] rounded-b-2xl flex items-center justify-between">
              <p className="text-xs text-text-muted">
                Matching customers will be set to <span className="text-red-400 font-bold">Blocked</span> status.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowBlockModal(false)}
                  className="px-6 py-3 rounded-xl bg-[#1c2d3d] text-text-muted font-bold text-sm hover:bg-[#233648] transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkBlock}
                  disabled={isBlocking}
                  className="px-6 py-3 rounded-xl bg-red-500 text-white font-bold text-sm hover:bg-red-600 transition-all shadow-lg shadow-red-500/20 disabled:opacity-50 flex items-center gap-2"
                >
                  {isBlocking && <span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>}
                  <span className="material-symbols-outlined text-sm">block</span>
                  Block All
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div >
  );
};

export default CustomersPage;
