
import React, { useState, useEffect } from 'react';
import { fulfillmentService, FulfillmentCenter } from '../src/services/fulfillment.service';

const FulfillmentPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'create' | 'detail'>('overview');
  const [centers, setCenters] = useState<FulfillmentCenter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Detail View State
  const [selectedCenter, setSelectedCenter] = useState<FulfillmentCenter | null>(null);
  const [warehouseForm, setWarehouseForm] = useState({ name: '', location: '' });
  const [isCreatingWarehouse, setIsCreatingWarehouse] = useState(false);

  // Create form state
  const [formData, setFormData] = useState({
    name: '',
    country: '',
    city: '',
    addressLine1: '',
    personInCharge: '',
    contactEmail: '',
    contactPhone: '',
    status: 'Active',

    notes: '',
  });

  const [initialWarehouses, setInitialWarehouses] = useState<{ name: string; location: string }[]>([]);
  const [newWarehouseName, setNewWarehouseName] = useState('');
  const [newWarehouseLocation, setNewWarehouseLocation] = useState('');

  const addInitialWarehouse = () => {
    if (!newWarehouseName) return;
    setInitialWarehouses([...initialWarehouses, { name: newWarehouseName, location: newWarehouseLocation }]);
    setNewWarehouseName('');
    setNewWarehouseLocation('');
  };

  const removeInitialWarehouse = (index: number) => {
    setInitialWarehouses(initialWarehouses.filter((_, i) => i !== index));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const data = await fulfillmentService.getAll();
      setCenters(Array.isArray(data) ? data : data.data || []);
    } catch (error) {
      console.error("Failed to load fulfillment centers", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.country || !formData.city || !formData.addressLine1 || !formData.personInCharge) {
      alert("Please fill in all required fields");
      return;
    }
    setIsSaving(true);
    try {
      let savedCenter;
      if (editingId) {
        savedCenter = await fulfillmentService.update(editingId, formData);
      } else {
        const code = `FC-${Date.now()}`;
        savedCenter = await fulfillmentService.create({ ...formData, code, warehouses: initialWarehouses });
      }
      setFormData({ name: '', country: '', city: '', addressLine1: '', personInCharge: '', contactEmail: '', contactPhone: '', status: 'Active', notes: '' });
      setInitialWarehouses([]);
      setNewWarehouseName('');
      setNewWarehouseLocation('');
      setEditingId(null);

      // Refresh list but also go to detail view
      fetchData();
      if (savedCenter) {
        handleViewDetail(savedCenter);
      } else {
        setActiveTab('overview');
      }
    } catch (error) {
      console.error("Failed to save fulfillment center", error);
      alert("Failed to save fulfillment center");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (center: FulfillmentCenter) => {
    setFormData({
      name: center.name,
      country: center.country,
      city: center.city,
      addressLine1: center.addressLine1,
      personInCharge: center.personInCharge,
      contactEmail: center.contactEmail || '',
      contactPhone: center.contactPhone || '',
      status: center.status,
      notes: center.notes || '',
    });
    setEditingId(center.id);
    setActiveTab('create');
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this fulfillment center?")) return;
    try {
      await fulfillmentService.delete(id);
      fetchData();
    } catch (error) {
      console.error("Failed to delete fulfillment center", error);
      alert("Failed to delete. It may have linked orders or products.");
    }
  };

  const handleViewDetail = async (center: FulfillmentCenter) => {
    setIsLoading(true);
    try {
      // Re-fetch to get warehouses
      const fullData = await fulfillmentService.getById(center.id);
      setSelectedCenter(fullData);
      setActiveTab('detail');
    } catch (err) {
      console.error("Failed to load details", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateWarehouse = async () => {
    if (!warehouseForm.name || !selectedCenter) return;
    setIsCreatingWarehouse(true);
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch('http://localhost:3000/inventory/warehouses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: warehouseForm.name,
          location: warehouseForm.location,
          fulfillmentCenterId: selectedCenter.id
        })
      });

      if (res.ok) {
        const newWarehouse = await res.json();
        // Refresh detail view
        const updatedCenter = await fulfillmentService.getById(selectedCenter.id);
        setSelectedCenter(updatedCenter);
        setWarehouseForm({ name: '', location: '' });
      } else {
        alert("Failed to create warehouse");
      }
    } catch (err) {
      console.error(err);
      alert("Error creating warehouse");
    } finally {
      setIsCreatingWarehouse(false);
    }
  };

  const filteredCenters = centers.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.country.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.city?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          {activeTab === 'detail' && (
            <button onClick={() => setActiveTab('overview')} className="p-2 rounded-full hover:bg-white/10 text-white transition-all">
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
          )}
          <h1 className="text-3xl font-black text-white tracking-tight">
            {activeTab === 'detail' && selectedCenter ? selectedCenter.name : 'Fulfillment Center'}
          </h1>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border-dark gap-8">
          <button
            onClick={() => { setActiveTab('overview'); setEditingId(null); setSelectedCenter(null); }}
            className={`pb-3 text-sm font-bold transition-all relative ${activeTab === 'overview' ? 'text-primary' : 'text-text-muted hover:text-white'}`}
          >
            Fulfillment Overview
            {activeTab === 'overview' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary shadow-lg shadow-primary/50"></div>}
          </button>
          <button
            onClick={() => { setActiveTab('create'); setEditingId(null); setFormData({ name: '', country: '', city: '', addressLine1: '', personInCharge: '', contactEmail: '', contactPhone: '', status: 'Active', notes: '' }); }}
            className={`pb-3 text-sm font-bold transition-all relative ${activeTab === 'create' ? 'text-primary' : 'text-text-muted hover:text-white'}`}
          >
            {editingId ? 'Edit Fulfillment Center' : 'Create Fulfillment Center'}
            {activeTab === 'create' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary shadow-lg shadow-primary/50"></div>}
          </button>
          {activeTab === 'detail' && (
            <button
              className={`pb-3 text-sm font-bold transition-all relative text-primary`}
            >
              Detail View
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary shadow-lg shadow-primary/50"></div>
            </button>
          )}
        </div>
      </div>

      {activeTab === 'overview' ? (
        <div className="space-y-6">
          {/* Table Area */}
          <div className="bg-card-dark rounded-2xl border border-border-dark overflow-hidden shadow-2xl">
            {/* ... Search & Add logic ... */}
            <div className="p-4 border-b border-border-dark flex flex-wrap justify-between items-center gap-4 bg-[#14202c]">
              <div className="flex h-10 items-center rounded-lg bg-background-dark border border-border-dark w-[320px] focus-within:ring-2 focus-within:ring-primary/40 transition-all">
                <div className="text-text-muted flex items-center justify-center pl-4">
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>search</span>
                </div>
                <input
                  className="w-full border-none bg-transparent text-white focus:ring-0 placeholder:text-text-muted pl-2 text-sm"
                  placeholder="Search Fulfillment Centers..."
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
                  <span className="text-xs font-bold uppercase tracking-widest">Add Fulfillment Center</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead>
                  <tr className="bg-[#17232f]/50 border-b border-border-dark">
                    <th className="px-6 py-4 text-text-muted font-bold text-[10px] uppercase tracking-wider">Name</th>
                    <th className="px-6 py-4 text-text-muted font-bold text-[10px] uppercase tracking-wider">Country</th>
                    <th className="px-6 py-4 text-text-muted font-bold text-[10px] uppercase tracking-wider">City</th>
                    <th className="px-6 py-4 text-text-muted font-bold text-[10px] uppercase tracking-wider">PIC (Person In Charge)</th>
                    <th className="px-6 py-4 text-text-muted font-bold text-[10px] uppercase tracking-wider">Orders</th>
                    <th className="px-6 py-4 text-text-muted font-bold text-[10px] uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-center text-text-muted font-bold text-[10px] uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-dark/40">
                  {isLoading ? (
                    <tr><td colSpan={8} className="text-center py-12 text-text-muted">
                      <div className="flex items-center justify-center gap-3">
                        Loading...
                      </div>
                    </td></tr>
                  ) : filteredCenters.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-12 text-text-muted italic">No fulfillment centers found</td></tr>
                  ) : filteredCenters.map((center) => (
                    <tr key={center.id}
                      className="hover:bg-white/[0.02] transition-colors group cursor-pointer"
                      onClick={() => handleViewDetail(center)}
                    >
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className="size-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary border border-primary/20">
                            <span className="material-symbols-outlined text-xl">warehouse</span>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white group-hover:text-primary transition-colors">{center.name}</p>
                            <p className="text-[10px] text-text-muted font-mono">{center.code}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-sm text-text-muted">flag</span>
                          <span className="text-sm text-white">{center.country}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-sm text-white">{center.city}</td>
                      <td className="px-6 py-5 text-sm text-text-muted">{center.personInCharge}</td>
                      <td className="px-6 py-5 text-sm text-white font-bold">{center._count?.orders ?? 0}</td>
                      <td className="px-6 py-5">
                        <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest ${center.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                          }`}>
                          {center.status}
                        </span>
                      </td>
                      <td className="px-6 py-5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => handleEdit(center)} className="p-1.5 hover:bg-primary/10 rounded-lg text-text-muted hover:text-primary transition-all shadow-sm" title="Edit"><span className="material-symbols-outlined text-[18px]">edit</span></button>
                          <button onClick={() => handleDelete(center.id)} className="p-1.5 hover:bg-red-500/10 rounded-lg text-text-muted hover:text-red-400 transition-all shadow-sm" title="Delete"><span className="material-symbols-outlined text-[18px]">delete</span></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-[#17232f] px-6 py-4 border-t border-border-dark flex items-center justify-between">
              <p className="text-xs text-[#92adc9]">Showing <span className="text-white font-bold">{filteredCenters.length}</span> of <span className="text-white font-bold">{centers.length}</span> centers</p>
            </div>
          </div>
        </div>
      ) : activeTab === 'detail' && selectedCenter ? (
        <div className="flex flex-col gap-6">
          {/* Context Header */}
          <div className="bg-card-dark rounded-2xl border border-border-dark p-6 grid grid-cols-1 md:grid-cols-4 gap-6">
            <div>
              <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest mb-1">Status</p>
              <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest ${selectedCenter.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>{selectedCenter.status}</span>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest mb-1">Person In Charge</p>
              <p className="text-sm font-bold text-white">{selectedCenter.personInCharge}</p>
              <p className="text-xs text-text-muted">{selectedCenter.contactEmail}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest mb-1">Location</p>
              <p className="text-sm font-bold text-white">{selectedCenter.city}, {selectedCenter.country}</p>
              <p className="text-xs text-text-muted">{selectedCenter.addressLine1}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest mb-1">Capacity</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div className="bg-primary h-full" style={{ width: `${selectedCenter.utilizationPercent || 0}%` }}></div>
                </div>
                <span className="text-xs font-bold text-white">{selectedCenter.utilizationPercent || 0}%</span>
              </div>
            </div>
          </div>

          {/* Warehouses Section */}
          <div className="bg-card-dark rounded-2xl border border-border-dark overflow-hidden">
            <div className="p-6 border-b border-border-dark flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">Warehouses</h3>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                {selectedCenter.warehouses?.map(warehouse => (
                  <div key={warehouse.id} className="bg-[#1c2d3d] border border-[#2d445a] p-4 rounded-xl flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-white">{warehouse.name}</h4>
                      <p className="text-xs text-text-muted">{warehouse.location || 'No location specified'}</p>
                    </div>
                    <div className="size-8 bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-400">
                      <span className="material-symbols-outlined text-sm">check_circle</span>
                    </div>
                  </div>
                ))}
                {(!selectedCenter.warehouses || selectedCenter.warehouses.length === 0) && (
                  <p className="text-text-muted italic text-sm col-span-full">No warehouses created yet.</p>
                )}
              </div>

              {/* Create Warehouse Form */}
              <div className="bg-[#17232f] rounded-xl p-5 border border-border-dark">
                <h4 className="text-sm font-bold text-white mb-4">Create New Warehouse</h4>
                <div className="flex gap-4 items-end">
                  <div className="space-y-1 flex-1">
                    <label className="text-[10px] font-black text-text-muted uppercase tracking-wider">Warehouse Name</label>
                    <input
                      className="bg-[#1c2d3d] border border-[#2d445a] text-white text-sm rounded-lg px-3 py-2 w-full focus:ring-primary focus:border-primary"
                      placeholder="e.g. Main Floor"
                      value={warehouseForm.name}
                      onChange={e => setWarehouseForm({ ...warehouseForm, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1 flex-1">
                    <label className="text-[10px] font-black text-text-muted uppercase tracking-wider">Location / Zone</label>
                    <input
                      className="bg-[#1c2d3d] border border-[#2d445a] text-white text-sm rounded-lg px-3 py-2 w-full focus:ring-primary focus:border-primary"
                      placeholder="e.g. Zone A"
                      value={warehouseForm.location}
                      onChange={e => setWarehouseForm({ ...warehouseForm, location: e.target.value })}
                    />
                  </div>
                  <button
                    onClick={handleCreateWarehouse}
                    disabled={isCreatingWarehouse}
                    className="h-[38px] px-4 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90 transition-all shadow-lg disabled:opacity-50"
                  >
                    {isCreatingWarehouse ? 'Creating...' : 'Create Warehouse'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="max-w-4xl mx-auto bg-card-dark rounded-2xl border border-border-dark p-8 shadow-2xl space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">Fulfillment Center Name <span className="text-red-500">*</span></label>
              <input type="text" className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary" placeholder="e.g. Dubai Logistics Hub"
                value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">Country <span className="text-red-500">*</span></label>
              <input type="text" className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary" placeholder="e.g. UAE"
                value={formData.country} onChange={(e) => setFormData({ ...formData, country: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">City <span className="text-red-500">*</span></label>
              <input type="text" className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary" placeholder="e.g. Dubai"
                value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">Address <span className="text-red-500">*</span></label>
              <input type="text" className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary" placeholder="Full street address"
                value={formData.addressLine1} onChange={(e) => setFormData({ ...formData, addressLine1: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">Person In Charge (PIC) <span className="text-red-500">*</span></label>
              <input type="text" className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4" placeholder="Manager Full Name"
                value={formData.personInCharge} onChange={(e) => setFormData({ ...formData, personInCharge: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">Contact Email</label>
              <input type="email" className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4" placeholder="email@center.com"
                value={formData.contactEmail} onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">Contact Phone</label>
              <input type="tel" className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4" placeholder="+971 4 000 0000"
                value={formData.contactPhone} onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Warehouses Input Section - Only show when creating new Center */}
            {!editingId && (
              <div className="col-span-full">
                <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1 mb-2 block">Initial Warehouses (Optional)</label>
                <div className="bg-[#14202c] p-4 rounded-xl border border-dashed border-border-dark space-y-4">
                  <div className="flex gap-4 items-end">
                    <div className="flex-1 space-y-1">
                      <label className="text-[10px] font-bold text-text-muted">Warehouse Name</label>
                      <input
                        className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-lg w-full h-10 px-3"
                        placeholder="e.g. Main Stock Room"
                        value={newWarehouseName}
                        onChange={e => setNewWarehouseName(e.target.value)}
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <label className="text-[10px] font-bold text-text-muted">Location / Zone</label>
                      <input
                        className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-lg w-full h-10 px-3"
                        placeholder="e.g. Zone A"
                        value={newWarehouseLocation}
                        onChange={e => setNewWarehouseLocation(e.target.value)}
                      />
                    </div>
                    <button
                      onClick={addInitialWarehouse}
                      className="h-10 px-4 bg-primary/20 text-primary hover:bg-primary hover:text-white rounded-lg text-xs font-bold transition-all"
                    >
                      Add
                    </button>
                  </div>

                  {initialWarehouses.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {initialWarehouses.map((w, idx) => (
                        <div key={idx} className="bg-[#1c2d3d] px-3 py-2 rounded-lg border border-border-dark flex items-center justify-between">
                          <div>
                            <p className="text-sm font-bold text-white">{w.name}</p>
                            <p className="text-xs text-text-muted">{w.location}</p>
                          </div>
                          <button onClick={() => removeInitialWarehouse(idx)} className="text-red-400 hover:text-red-300">
                            <span className="material-symbols-outlined text-sm">close</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {editingId && (
              <div className="col-span-full">
                <div className="bg-primary/10 border border-primary/20 p-4 rounded-xl flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary">info</span>
                  <p className="text-xs text-text-muted">
                    To manage warehouses, please save these changes and use the <strong>Detail View</strong> via the table.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">Status</label>
              <select className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4"
                value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
                <option>Active</option>
                <option>Inactive</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">Center Notes / Instructions</label>
            <textarea className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-32 px-4 py-3 focus:ring-primary/40 focus:border-primary" placeholder="Enter operational details, warehouse capacity, or contact notes..."
              value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })}></textarea>
          </div>

          <div className="flex gap-4 pt-4 border-t border-border-dark">
            <button onClick={() => { setActiveTab('overview'); setEditingId(null); }} className="flex-1 h-12 bg-background-dark border border-border-dark text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-border-dark transition-all">Cancel</button>
            <button onClick={handleSave} disabled={isSaving} className="flex-[2] h-12 bg-primary text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50">
              {isSaving ? 'Saving...' : (editingId ? 'Update Fulfillment Center' : 'Confirm Creation')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FulfillmentPage;
