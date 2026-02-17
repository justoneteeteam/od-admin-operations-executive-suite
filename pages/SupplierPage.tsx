
import React, { useState, useEffect } from 'react';
import { suppliersService, Supplier } from '../src/services/suppliers.service';

const SupplierPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'create'>('overview');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Create form state
  const [formData, setFormData] = useState({
    name: '',
    companyName: '',
    contactPerson: '',
    email: '',
    phone: '',
    country: '',
    paymentTerms: 'Net 30',
    currency: 'USD',
    taxId: '',
    bankName: '',
    bankAccount: '',
    notes: '',
    status: 'Active',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const data = await suppliersService.getAll();
      setSuppliers(Array.isArray(data) ? data : data.data || []);
    } catch (error) {
      console.error("Failed to load suppliers", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.country) {
      alert("Please fill in Name and Country");
      return;
    }
    setIsSaving(true);
    try {
      if (editingId) {
        await suppliersService.update(editingId, formData);
      } else {
        await suppliersService.create(formData);
      }
      setFormData({ name: '', companyName: '', contactPerson: '', email: '', phone: '', country: '', paymentTerms: 'Net 30', currency: 'USD', taxId: '', bankName: '', bankAccount: '', notes: '', status: 'Active' });
      setEditingId(null);
      setActiveTab('overview');
      fetchData();
    } catch (error) {
      console.error("Failed to save supplier", error);
      alert("Failed to save supplier");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (supplier: Supplier) => {
    setFormData({
      name: supplier.name,
      companyName: supplier.companyName,
      contactPerson: supplier.contactPerson || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      country: supplier.country,
      paymentTerms: supplier.paymentTerms || 'Net 30',
      currency: supplier.currency || 'USD',
      taxId: supplier.taxId || '',
      bankName: supplier.bankName || '',
      bankAccount: supplier.bankAccount || '',
      notes: supplier.notes || '',
      status: supplier.status,
    });
    setEditingId(supplier.id);
    setActiveTab('create');
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this supplier?")) return;
    try {
      await suppliersService.delete(id);
      fetchData();
    } catch (error) {
      console.error("Failed to delete supplier", error);
      alert("Failed to delete. Supplier may have linked products or purchases.");
    }
  };

  const filteredSuppliers = suppliers.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.companyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.country?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Compute KPIs from real data
  const totalSuppliers = suppliers.length;
  const activeSuppliers = suppliers.filter(s => s.status === 'Active').length;
  const totalPurchases = suppliers.reduce((sum, s) => sum + (s._count?.purchases || 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-black text-white tracking-tight">Supplier Management</h1>

        {/* Tabs */}
        <div className="flex border-b border-border-dark gap-8">
          <button
            onClick={() => { setActiveTab('overview'); setEditingId(null); setFormData({ name: '', companyName: '', contactPerson: '', email: '', phone: '', country: '', paymentTerms: 'Net 30', currency: 'USD', taxId: '', bankName: '', bankAccount: '', notes: '', status: 'Active' }); }}
            className={`pb-3 text-sm font-bold transition-all relative ${activeTab === 'overview' ? 'text-primary' : 'text-text-muted hover:text-white'}`}
          >
            Supplier Overview
            {activeTab === 'overview' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary shadow-lg shadow-primary/50"></div>}
          </button>
          <button
            onClick={() => { setActiveTab('create'); setEditingId(null); setFormData({ name: '', companyName: '', contactPerson: '', email: '', phone: '', country: '', paymentTerms: 'Net 30', currency: 'USD', taxId: '', bankName: '', bankAccount: '', notes: '', status: 'Active' }); }}
            className={`pb-3 text-sm font-bold transition-all relative ${activeTab === 'create' ? 'text-primary' : 'text-text-muted hover:text-white'}`}
          >
            {editingId ? 'Edit Supplier' : 'Create Supplier'}
            {activeTab === 'create' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary shadow-lg shadow-primary/50"></div>}
          </button>
        </div>
      </div>

      {activeTab === 'overview' ? (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Suppliers', value: String(totalSuppliers), icon: 'groups', color: 'primary' },
              { label: 'Active', value: String(activeSuppliers), icon: 'check_circle', color: 'emerald-400' },
              { label: 'Inactive', value: String(totalSuppliers - activeSuppliers), icon: 'cancel', color: 'red-400' },
              { label: 'Total Purchases', value: String(totalPurchases), icon: 'shopping_cart', color: 'orange-400' },
            ].map((card, i) => (
              <div key={i} className="bg-card-dark p-4 rounded-xl border border-border-dark flex flex-col gap-2 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className={`material-symbols-outlined text-sm text-${card.color}`}>{card.icon}</span>
                  <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">{card.label}</span>
                </div>
                <p className="text-xl font-black text-white mt-1">{card.value}</p>
              </div>
            ))}
          </div>

          {/* Table Area */}
          <div className="bg-card-dark rounded-2xl border border-border-dark overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-border-dark flex flex-wrap justify-between items-center gap-4 bg-[#14202c]">
              <div className="flex h-10 items-center rounded-lg bg-background-dark border border-border-dark w-[320px] focus-within:ring-2 focus-within:ring-primary/40 transition-all">
                <div className="text-text-muted flex items-center justify-center pl-4">
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>search</span>
                </div>
                <input
                  className="w-full border-none bg-transparent text-white focus:ring-0 placeholder:text-text-muted pl-2 text-sm"
                  placeholder="Search suppliers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab('create')}
                  className="flex h-10 items-center gap-2 rounded-lg bg-primary text-white px-4 hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                >
                  <span className="material-symbols-outlined text-sm">add</span>
                  <span className="text-xs font-bold uppercase tracking-widest">Add Supplier</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse min-w-[1400px]">
                <thead>
                  <tr className="bg-[#17232f]/50 border-b border-border-dark">
                    <th className="px-6 py-4 text-text-muted font-bold text-[10px] uppercase tracking-wider">Supplier Name</th>
                    <th className="px-6 py-4 text-text-muted font-bold text-[10px] uppercase tracking-wider">Contact Person</th>
                    <th className="px-6 py-4 text-text-muted font-bold text-[10px] uppercase tracking-wider">Email</th>
                    <th className="px-6 py-4 text-text-muted font-bold text-[10px] uppercase tracking-wider">Phone</th>
                    <th className="px-6 py-4 text-text-muted font-bold text-[10px] uppercase tracking-wider">Country</th>
                    <th className="px-6 py-4 text-text-muted font-bold text-[10px] uppercase tracking-wider">Payment Terms</th>
                    <th className="px-6 py-4 text-text-muted font-bold text-[10px] uppercase tracking-wider text-center">Purchases</th>
                    <th className="px-6 py-4 text-text-muted font-bold text-[10px] uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-dark/40">
                  {isLoading ? (
                    <tr><td colSpan={9} className="text-center py-12 text-text-muted">
                      <div className="flex items-center justify-center gap-3">
                        <div className="animate-spin size-5 border-2 border-primary border-t-transparent rounded-full"></div>
                        Loading suppliers...
                      </div>
                    </td></tr>
                  ) : filteredSuppliers.length === 0 ? (
                    <tr><td colSpan={9} className="text-center py-12 text-text-muted italic">No suppliers found</td></tr>
                  ) : filteredSuppliers.map((s) => (
                    <tr key={s.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-white leading-none">{s.name}</p>
                        <p className="text-[10px] text-text-muted mt-1 font-medium opacity-60">{s.companyName}</p>
                      </td>
                      <td className="px-6 py-4 text-sm text-white">{s.contactPerson || '—'}</td>
                      <td className="px-6 py-4 text-sm text-text-muted">{s.email || '—'}</td>
                      <td className="px-6 py-4 text-sm text-text-muted">{s.phone || '—'}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-sm text-text-muted">flag</span>
                          <span className="text-sm text-white">{s.country}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-text-muted">{s.paymentTerms || '—'}</td>
                      <td className="px-6 py-4 text-sm text-center font-bold text-white">{s._count?.purchases ?? 0}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest ${s.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                          }`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => handleEdit(s)} className="p-1.5 hover:bg-primary/10 rounded-lg text-text-muted hover:text-primary transition-all"><span className="material-symbols-outlined text-sm">edit</span></button>
                          <button onClick={() => handleDelete(s.id)} className="p-1.5 hover:bg-red-500/10 rounded-lg text-text-muted hover:text-red-400 transition-all"><span className="material-symbols-outlined text-sm">delete</span></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-[#17232f] px-6 py-4 border-t border-border-dark flex items-center justify-between">
              <p className="text-xs text-[#92adc9]">Showing <span className="text-white font-bold">{filteredSuppliers.length}</span> of <span className="text-white font-bold">{suppliers.length}</span> suppliers</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="max-w-4xl mx-auto bg-card-dark rounded-2xl border border-border-dark p-8 shadow-2xl space-y-10">
          {/* Section 1: Basic Info */}
          <div className="space-y-6">
            <h3 className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">info</span>
              Basic Identification
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">Supplier Name <span className="text-red-500">*</span></label>
                <input type="text" className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary" placeholder="Common Name"
                  value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">Registered Company Name <span className="text-red-500">*</span></label>
                <input type="text" className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary" placeholder="Legal Entity"
                  value={formData.companyName} onChange={(e) => setFormData({ ...formData, companyName: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">Contact Person</label>
                <input type="text" className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary"
                  value={formData.contactPerson} onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">Email Address</label>
                <input type="email" className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary" placeholder="supplier@company.com"
                  value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">Phone Number</label>
                <input type="tel" className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary" placeholder="+00 000 000 000"
                  value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
              </div>
            </div>
          </div>

          {/* Section 2: Address & Tax */}
          <div className="space-y-6">
            <h3 className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">location_on</span>
              Location & Compliance
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">Country <span className="text-red-500">*</span></label>
                <input type="text" className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary" placeholder="e.g. China, UAE, Germany"
                  value={formData.country} onChange={(e) => setFormData({ ...formData, country: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">Tax ID / VAT Registration</label>
                <input type="text" className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary"
                  value={formData.taxId} onChange={(e) => setFormData({ ...formData, taxId: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">Payment Terms</label>
                <select className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary"
                  value={formData.paymentTerms} onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}>
                  <option>Net 7</option>
                  <option>Net 15</option>
                  <option>Net 30</option>
                  <option>Pre-paid</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">Currency</label>
                <select className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary"
                  value={formData.currency} onChange={(e) => setFormData({ ...formData, currency: e.target.value })}>
                  <option>USD</option>
                  <option>EUR</option>
                  <option>AED</option>
                  <option>GBP</option>
                  <option>CNY</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 3: Financial & Notes */}
          <div className="space-y-6">
            <h3 className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">payments</span>
              Financial & Operational Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">Bank Name</label>
                <input type="text" className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary"
                  value={formData.bankName} onChange={(e) => setFormData({ ...formData, bankName: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">Bank Account / IBAN</label>
                <input type="text" className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary"
                  value={formData.bankAccount} onChange={(e) => setFormData({ ...formData, bankAccount: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">Notes & Supplier Terms</label>
              <textarea className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-24 px-4 py-3 focus:ring-primary/40 focus:border-primary" placeholder="Any additional information..."
                value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })}></textarea>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">Active Status</label>
              <select className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary"
                value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
                <option>Active</option>
                <option>Inactive</option>
              </select>
            </div>
          </div>

          <div className="flex gap-4 pt-6 border-t border-border-dark">
            <button onClick={() => { setActiveTab('overview'); setEditingId(null); }} className="flex-1 h-12 bg-background-dark border border-border-dark text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-border-dark transition-all">Cancel</button>
            <button onClick={handleSave} disabled={isSaving} className="flex-[2] h-12 bg-primary text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50">
              {isSaving ? 'Saving...' : (editingId ? 'Update Supplier' : 'Save & Create Supplier')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierPage;
