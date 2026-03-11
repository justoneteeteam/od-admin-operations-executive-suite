import React, { useState, useEffect } from 'react';
import { logisticCompaniesService, LogisticCompany } from '../src/services/logistic-companies.service';

const LogisticsPage: React.FC = () => {
  const [lcList, setLcList] = useState<LogisticCompany[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<LogisticCompany>>({ name: '', address: '', phone: '', contactPerson: '', email: '' });
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setIsLoading(true);
    try {
      const data = await logisticCompaniesService.getAll();
      setLcList(data);
    } catch (err) {
      console.error('Failed to load logistic companies', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.name?.trim()) return;
    try {
      if (editId) {
        await logisticCompaniesService.update(editId, form);
      } else {
        await logisticCompaniesService.create(form);
      }
      setShowModal(false);
      setEditId(null);
      setForm({ name: '', address: '', phone: '', contactPerson: '', email: '' });
      fetchAll();
    } catch (err) {
      console.error('Failed to save logistic company', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this logistic company?')) return;
    try {
      await logisticCompaniesService.remove(id);
      fetchAll();
    } catch (err) {
      console.error('Failed to delete', err);
    }
  };

  const openEdit = (lc: LogisticCompany) => {
    setEditId(lc.id);
    setForm({ name: lc.name, address: lc.address || '', phone: lc.phone || '', contactPerson: lc.contactPerson || '', email: lc.email || '' });
    setShowModal(true);
  };

  const openCreate = () => {
    setEditId(null);
    setForm({ name: '', address: '', phone: '', contactPerson: '', email: '' });
    setShowModal(true);
  };

  const filtered = lcList.filter(lc =>
    lc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (lc.contactPerson || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Logistic Companies</h1>
          <p className="text-sm text-text-muted mt-1">Manage shipping companies that handle delivery from suppliers to fulfillment centers.</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add_circle</span>
          Add Company
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm w-full">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>search</span>
        </span>
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-9 w-full bg-card-dark border border-border-dark rounded-xl text-sm text-white focus:border-primary focus:ring-1 focus:ring-primary/30 placeholder-text-muted/50 py-2.5 outline-none transition-all"
          placeholder="Search companies..."
          type="text"
        />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card-dark rounded-2xl border border-border-dark p-5">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-amber-400" style={{ fontSize: 22 }}>local_shipping</span>
            </div>
            <div>
              <p className="text-2xl font-black text-white">{lcList.length}</p>
              <p className="text-[10px] text-text-muted font-bold uppercase tracking-wider">Total Companies</p>
            </div>
          </div>
        </div>
        <div className="bg-card-dark rounded-2xl border border-border-dark p-5">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-blue-400" style={{ fontSize: 22 }}>person</span>
            </div>
            <div>
              <p className="text-2xl font-black text-white">{lcList.filter(l => l.contactPerson).length}</p>
              <p className="text-[10px] text-text-muted font-bold uppercase tracking-wider">With Contacts</p>
            </div>
          </div>
        </div>
        <div className="bg-card-dark rounded-2xl border border-border-dark p-5">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-green-500/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-green-400" style={{ fontSize: 22 }}>verified</span>
            </div>
            <div>
              <p className="text-2xl font-black text-white">{lcList.filter(l => l.phone && l.email).length}</p>
              <p className="text-[10px] text-text-muted font-bold uppercase tracking-wider">Fully Profiled</p>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card-dark rounded-2xl border border-border-dark overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border-dark bg-[#1a2332]">
                <th className="py-4 px-6 text-xs font-semibold uppercase tracking-wider text-text-muted">Company</th>
                <th className="py-4 px-6 text-xs font-semibold uppercase tracking-wider text-text-muted">Contact Person</th>
                <th className="py-4 px-6 text-xs font-semibold uppercase tracking-wider text-text-muted">Phone</th>
                <th className="py-4 px-6 text-xs font-semibold uppercase tracking-wider text-text-muted">Email</th>
                <th className="py-4 px-6 text-xs font-semibold uppercase tracking-wider text-text-muted">Address</th>
                <th className="py-4 px-6 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-dark">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <span className="material-symbols-outlined text-text-muted/30" style={{ fontSize: 48 }}>local_shipping</span>
                      <p className="text-text-muted text-sm">{searchQuery ? 'No companies match your search' : 'No logistic companies yet'}</p>
                      {!searchQuery && (
                        <button onClick={openCreate} className="mt-2 px-4 py-2 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary/90 transition-all">
                          Add Your First Company
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map(lc => (
                  <tr key={lc.id} className="hover:bg-[#1a2332] transition-colors group">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="size-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                          <span className="material-symbols-outlined text-amber-400" style={{ fontSize: 20 }}>local_shipping</span>
                        </div>
                        <span className="text-sm font-bold text-white">{lc.name}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-text-muted">{lc.contactPerson || '—'}</td>
                    <td className="py-4 px-6 text-sm text-text-muted">{lc.phone || '—'}</td>
                    <td className="py-4 px-6 text-sm text-text-muted">{lc.email || '—'}</td>
                    <td className="py-4 px-6 text-sm text-text-muted truncate max-w-[200px]">{lc.address || '—'}</td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEdit(lc)}
                          className="p-1.5 rounded-lg text-text-muted hover:text-white hover:bg-[#2d445a] transition-all"
                          title="Edit"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                        </button>
                        <button
                          onClick={() => handleDelete(lc.id)}
                          className="p-1.5 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-all"
                          title="Delete"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="border-t border-border-dark bg-[#1a2332] p-4 flex items-center justify-between">
            <p className="text-xs text-text-muted">
              Showing <span className="font-bold text-white">{filtered.length}</span> of <span className="font-bold text-white">{lcList.length}</span> companies
            </p>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)}></div>
          <div className="relative bg-card-dark border border-border-dark rounded-2xl w-full max-w-lg p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-400" style={{ fontSize: 22 }}>local_shipping</span>
                {editId ? 'Edit Company' : 'Add New Company'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-text-muted hover:text-white transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-text-muted font-bold uppercase tracking-wider block mb-1.5">Company Name <span className="text-red-500">*</span></label>
                <input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-[#1a2332] border border-border-dark rounded-xl px-4 py-2.5 text-sm text-white placeholder-text-muted/50 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all"
                  placeholder="e.g., BAOHAI Express" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-text-muted font-bold uppercase tracking-wider block mb-1.5">Contact Person</label>
                  <input value={form.contactPerson || ''} onChange={e => setForm({ ...form, contactPerson: e.target.value })}
                    className="w-full bg-[#1a2332] border border-border-dark rounded-xl px-4 py-2.5 text-sm text-white placeholder-text-muted/50 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all"
                    placeholder="John Doe" />
                </div>
                <div>
                  <label className="text-[10px] text-text-muted font-bold uppercase tracking-wider block mb-1.5">Phone</label>
                  <input value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })}
                    className="w-full bg-[#1a2332] border border-border-dark rounded-xl px-4 py-2.5 text-sm text-white placeholder-text-muted/50 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all"
                    placeholder="+86 138 0000 0000" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-text-muted font-bold uppercase tracking-wider block mb-1.5">Email</label>
                <input value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })}
                  className="w-full bg-[#1a2332] border border-border-dark rounded-xl px-4 py-2.5 text-sm text-white placeholder-text-muted/50 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all"
                  placeholder="contact@company.com" />
              </div>
              <div>
                <label className="text-[10px] text-text-muted font-bold uppercase tracking-wider block mb-1.5">Address</label>
                <textarea value={form.address || ''} onChange={e => setForm({ ...form, address: e.target.value })}
                  rows={2}
                  className="w-full bg-[#1a2332] border border-border-dark rounded-xl px-4 py-2.5 text-sm text-white placeholder-text-muted/50 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all resize-none"
                  placeholder="Full shipping address" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 bg-border-dark text-white text-xs font-bold rounded-xl hover:bg-[#2d445a] transition-all">Cancel</button>
              <button onClick={handleSave}
                className="flex-1 py-2.5 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20">
                {editId ? 'Update Company' : 'Create Company'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LogisticsPage;
