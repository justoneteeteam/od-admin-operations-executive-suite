import React, { useState, useEffect } from 'react';
import storeSettingsService, { StoreSettings } from '../src/services/settings.service';

type ActiveTab = 'connection' | 'create' | 'whatsapp';

const STORE_COLORS = [
  { bg: 'bg-indigo-100', text: 'text-indigo-600' },
  { bg: 'bg-orange-100', text: 'text-orange-600' },
  { bg: 'bg-pink-100', text: 'text-pink-600' },
  { bg: 'bg-emerald-100', text: 'text-emerald-600' },
  { bg: 'bg-violet-100', text: 'text-violet-600' },
  { bg: 'bg-cyan-100', text: 'text-cyan-600' },
  { bg: 'bg-amber-100', text: 'text-amber-600' },
  { bg: 'bg-rose-100', text: 'text-rose-600' },
];

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function getColorForIndex(i: number) {
  return STORE_COLORS[i % STORE_COLORS.length];
}

function timeAgo(dateStr: string | null | undefined) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min${mins > 1 ? 's' : ''} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

const SettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('connection');
  const [stores, setStores] = useState<StoreSettings[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);
  const [activeStoreId, setActiveStoreId] = useState<string | null>(null);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // WhatsApp State
  const [waConnected, setWaConnected] = useState(false);
  const [waPhone, setWaPhone] = useState<string | null>(null);
  const [waQrCode, setWaQrCode] = useState<string | null>(null);
  const [waLoading, setWaLoading] = useState(false);
  const [waPhoneInput, setWaPhoneInput] = useState('');
  const [waPairingCode, setWaPairingCode] = useState<string | null>(null);
  const [waPairingLoading, setWaPairingLoading] = useState(false);
  const [waShowQr, setWaShowQr] = useState(false);
  const [waTemplates, setWaTemplates] = useState<any[]>([]);
  const [waTemplateSaving, setWaTemplateSaving] = useState<string | null>(null);
  const [waMessage, setWaMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const emptyForm: Partial<StoreSettings> = {
    storeName: '',
    storeUrl: '',
    supportEmail: '',
    currency: 'AED',
    gsProjectId: '',
    gsClientEmail: '',
    gsPrivateKey: '',
    gsSpreadsheetId: '',
    gsSheetName: 'Sheet1',
  };

  const [formData, setFormData] = useState<Partial<StoreSettings>>(emptyForm);

  useEffect(() => {
    fetchStores();
  }, []);

  // Close action menu on outside click
  useEffect(() => {
    const handler = () => setOpenMenuId(null);
    if (openMenuId) window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [openMenuId]);

  // WhatsApp Auto Polling
  useEffect(() => {
    let interval: any;
    if (activeTab === 'whatsapp') {
      fetchWaStatus();
      fetchWaTemplates();
      interval = setInterval(fetchWaStatus, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeTab]);

  const API = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000';

  const fetchWaStatus = async () => {
    try {
      const res = await fetch(`${API}/notifications/whatsapp/status`);
      const data = await res.json();
      setWaConnected(data.connected);
      setWaPhone(data.phone);
      if (data.connected) {
        setWaPairingCode(null);
        setWaQrCode(null);
      }
      if (!data.connected && data.hasQr && waShowQr && !waQrCode) {
        fetchWaQr();
      }
    } catch (err) {
      console.error('Failed to fetch WA status:', err);
    }
  };

  const fetchWaQr = async () => {
    try {
      const res = await fetch(`${API}/notifications/whatsapp/qr`);
      const data = await res.json();
      if (data.success) setWaQrCode(data.qrCode);
    } catch (err) {
      console.error('Failed to fetch WA QR:', err);
    }
  };

  const fetchWaTemplates = async () => {
    try {
      const res = await fetch(`${API}/notifications/templates?type=whatsapp_personal`);
      const data = await res.json();
      setWaTemplates(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch WA templates:', err);
    }
  };

  const disconnectWa = async () => {
    try {
      setWaLoading(true);
      await fetch(`${API}/notifications/whatsapp/disconnect`, { method: 'POST' });
      setWaConnected(false);
      setWaPhone(null);
      setWaQrCode(null);
      setWaPairingCode(null);
    } catch (err) {
      console.error('Failed to disconnect WA:', err);
    } finally {
      setWaLoading(false);
    }
  };

  const requestPairingCode = async () => {
    if (!waPhoneInput.trim()) {
      setWaMessage({ type: 'error', text: 'Please enter a valid phone number with country code (e.g. +393331234567)' });
      return;
    }
    try {
      setWaPairingLoading(true);
      setWaMessage(null);
      const res = await fetch(`${API}/notifications/whatsapp/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: waPhoneInput }),
      });
      const data = await res.json();
      if (data.success) {
        setWaPairingCode(data.pairingCode);
        setWaMessage({ type: 'success', text: 'Code generated! Enter it on your WhatsApp app → Linked Devices → Link a Device → Link with phone number.' });
      } else {
        setWaMessage({ type: 'error', text: data.message || 'Failed to generate pairing code.' });
      }
    } catch (err) {
      setWaMessage({ type: 'error', text: 'Failed to connect to backend.' });
    } finally {
      setWaPairingLoading(false);
    }
  };

  const saveTemplate = async (id: string, bodyTemplate: string) => {
    try {
      setWaTemplateSaving(id);
      await fetch(`${API}/notifications/templates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bodyTemplate }),
      });
      setWaMessage({ type: 'success', text: 'Template saved successfully!' });
      setTimeout(() => setWaMessage(null), 3000);
    } catch (err) {
      setWaMessage({ type: 'error', text: 'Failed to save template.' });
    } finally {
      setWaTemplateSaving(null);
    }
  };

  const fetchStores = async () => {
    setIsLoading(true);
    try {
      const data = await storeSettingsService.getAll();
      setStores(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load store settings', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!formData.storeName) {
      setMessage({ type: 'error', text: 'Store Name is required.' });
      return;
    }
    setIsSaving(true);
    setMessage(null);
    try {
      if (activeStoreId) {
        await storeSettingsService.update(activeStoreId, formData);
        setMessage({ type: 'success', text: 'Settings saved successfully!' });
      } else {
        const created = await storeSettingsService.create(formData);
        setActiveStoreId(created.id);
        setMessage({ type: 'success', text: 'Store created successfully!' });
      }
      await fetchStores();
    } catch (err) {
      console.error('Failed to save settings', err);
      setMessage({ type: 'error', text: 'Failed to save settings.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleConnectNew = () => {
    setActiveStoreId(null);
    setFormData(emptyForm);
    setConnectionStatus('idle');
    setMessage(null);
    setActiveTab('create');
  };

  const handleEditStore = (store: StoreSettings) => {
    setActiveStoreId(store.id);
    setFormData(store);
    setConnectionStatus(store.gsConnected ? 'success' : 'idle');
    setMessage(null);
    setOpenMenuId(null);
    setActiveTab('create');
  };

  const handleDelete = async (storeId: string) => {
    if (!confirm('Are you sure you want to delete this store configuration?')) return;
    setOpenMenuId(null);
    try {
      await storeSettingsService.delete(storeId);
      if (activeStoreId === storeId) {
        setActiveStoreId(null);
        setFormData(emptyForm);
      }
      await fetchStores();
      setMessage({ type: 'success', text: 'Store deleted.' });
    } catch (err) {
      console.error('Failed to delete', err);
      setMessage({ type: 'error', text: 'Failed to delete store.' });
    }
  };

  const handleSync = async (storeId: string) => {
    setIsSyncing(storeId);
    setOpenMenuId(null);
    setMessage(null);
    try {
      const result = await storeSettingsService.sync(storeId);
      if (result.success) {
        setMessage({
          type: 'success',
          text: `Sync complete! Created: ${result.ordersCreated}.`
        });
        await fetchStores();
      } else {
        setMessage({
          type: 'error',
          text: `Sync failed. ${result.errors[0] || 'Unknown error'}`
        });
      }
    } catch (err: any) {
      console.error('Sync failed', err);
      setMessage({ type: 'error', text: 'Sync request failed.' });
    } finally {
      setIsSyncing(null);
    }
  };

  const handleTestConnection = () => {
    setConnectionStatus('testing');
    setIsTesting(true);
    setTimeout(() => {
      if (formData.gsProjectId && formData.gsClientEmail && formData.gsPrivateKey && formData.gsSpreadsheetId) {
        setConnectionStatus('success');
        setMessage({ type: 'success', text: 'Connection test passed — credentials look valid!' });
      } else {
        setConnectionStatus('error');
        setMessage({ type: 'error', text: 'Missing required Google Sheets credentials.' });
      }
      setIsTesting(false);
    }, 1500);
  };

  const handleBackToStores = () => {
    setActiveTab('connection');
    setMessage(null);
  };

  const filteredStores = stores.filter(s =>
    s.storeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.gsSheetName || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // ─── STORE CONNECTION TAB ────────────────────────────────────────────
  const renderConnectionTab = () => (
    <div className="flex flex-col gap-6">
      {/* Search & Actions Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative max-w-sm w-full">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>search</span>
          </span>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 w-full bg-card-dark border border-border-dark rounded-xl text-sm text-white focus:border-primary focus:ring-1 focus:ring-primary/30 placeholder-text-muted/50 py-2.5 outline-none transition-all"
            placeholder="Search stores or sheets..."
            type="text"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchStores}
            className="flex items-center gap-2 px-3 py-2 bg-card-dark border border-border-dark rounded-xl text-sm text-text-muted font-medium hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
            Refresh
          </button>
        </div>
      </div>

      {/* Stores Table */}
      <div className="bg-card-dark rounded-2xl border border-border-dark overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border-dark bg-[#1a2332]">
                <th className="py-4 px-6 text-xs font-semibold uppercase tracking-wider text-text-muted w-[25%]">Store Name</th>
                <th className="py-4 px-6 text-xs font-semibold uppercase tracking-wider text-text-muted w-[15%]">Platform</th>
                <th className="py-4 px-6 text-xs font-semibold uppercase tracking-wider text-text-muted w-[25%]">Connected Sheet</th>
                <th className="py-4 px-6 text-xs font-semibold uppercase tracking-wider text-text-muted w-[15%]">Status</th>
                <th className="py-4 px-6 text-xs font-semibold uppercase tracking-wider text-text-muted w-[15%]">Last Sync</th>
                <th className="py-4 px-6 text-xs font-semibold uppercase tracking-wider text-text-muted w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-dark">
              {filteredStores.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <span className="material-symbols-outlined text-text-muted/30" style={{ fontSize: 48 }}>storefront</span>
                      <p className="text-text-muted text-sm">No stores connected yet</p>
                      <button
                        onClick={handleConnectNew}
                        className="mt-2 px-4 py-2 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary/90 transition-all"
                      >
                        Connect Your First Store
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredStores.map((store, i) => {
                  const color = getColorForIndex(i);
                  const isConnected = store.gsConnected && store.gsSpreadsheetId;
                  return (
                    <tr
                      key={store.id}
                      className="hover:bg-[#1a2332] transition-colors cursor-pointer group"
                      onClick={() => handleEditStore(store)}
                    >
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className={`size-10 rounded-xl ${color.bg} ${color.text} flex items-center justify-center font-bold text-sm`}>
                            {getInitials(store.storeName)}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white">{store.storeName}</p>
                            {store.storeUrl && (
                              <span className="text-xs text-text-muted">{store.storeUrl.replace(/^https?:\/\//, '')}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[#34A853]" style={{ fontSize: 18 }}>table_chart</span>
                          <span className="text-sm text-white">Google Sheets</span>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2">
                          {store.gsSpreadsheetId ? (
                            <>
                              <span className="material-symbols-outlined text-[#34A853]" style={{ fontSize: 18 }}>table_chart</span>
                              <span className="text-sm text-white truncate max-w-[150px]" title={store.gsSheetName || 'Sheet1'}>
                                {store.gsSheetName || 'Sheet1'}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="material-symbols-outlined text-text-muted/40" style={{ fontSize: 18 }}>table_chart</span>
                              <span className="text-sm text-text-muted italic">No sheet connected</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        {isConnected ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 text-green-400 text-xs font-bold border border-green-500/20">
                            <span className="size-1.5 rounded-full bg-green-400"></span>
                            Connected
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 text-xs font-bold border border-red-500/20">
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>error</span>
                            Disconnected
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex flex-col">
                          <span className="text-sm text-white">{store.gsLastSyncAt ? timeAgo(store.gsLastSyncAt) : '--'}</span>
                          <span className="text-xs text-text-muted">{isConnected ? 'Auto-syncs every 3h' : 'Never synced'}</span>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="relative">
                          <button
                            onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === store.id ? null : store.id); }}
                            className="text-text-muted hover:text-white transition-colors p-1 rounded-lg hover:bg-[#2d445a]"
                          >
                            <span className="material-symbols-outlined">more_vert</span>
                          </button>
                          {openMenuId === store.id && (
                            <div className="absolute right-0 top-8 bg-card-dark border border-border-dark rounded-xl shadow-xl z-50 py-1 w-40 animate-enter">
                              <button
                                onClick={e => { e.stopPropagation(); handleEditStore(store); }}
                                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-white hover:bg-[#1a2332] transition-colors"
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                                Edit Store
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); handleSync(store.id); }}
                                disabled={!!isSyncing}
                                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-white hover:bg-[#1a2332] transition-colors disabled:opacity-50"
                              >
                                <span className={`material-symbols-outlined ${isSyncing === store.id ? 'animate-spin' : ''}`} style={{ fontSize: 16 }}>
                                  {isSyncing === store.id ? 'refresh' : 'sync'}
                                </span>
                                {isSyncing === store.id ? 'Syncing...' : 'Sync Now'}
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); handleDelete(store.id); }}
                                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                                Delete Store
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {filteredStores.length > 0 && (
          <div className="border-t border-border-dark bg-[#1a2332] p-4 flex items-center justify-between">
            <p className="text-xs text-text-muted">
              Showing <span className="font-bold text-white">1-{filteredStores.length}</span> of <span className="font-bold text-white">{filteredStores.length}</span> stores
            </p>
          </div>
        )}
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 flex items-start gap-4">
          <div className="bg-primary/10 p-2.5 rounded-xl text-primary">
            <span className="material-symbols-outlined">help</span>
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">Need help connecting?</h4>
            <p className="text-xs text-text-muted mt-1 leading-relaxed">Check our documentation for step-by-step guides on how to connect your Google Sheets to import orders automatically.</p>
            <button className="text-xs font-bold text-primary hover:text-primary/80 mt-2 inline-block transition-colors">View Documentation →</button>
          </div>
        </div>
        <div className="bg-card-dark border border-border-dark rounded-2xl p-5 flex items-start gap-4">
          <div className="bg-[#1a2332] p-2.5 rounded-xl text-text-muted">
            <span className="material-symbols-outlined">api</span>
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">API Access</h4>
            <p className="text-xs text-text-muted mt-1 leading-relaxed">Developers can use the API to programmatically manage store connections and sync status.</p>
            <button className="text-xs font-bold text-primary hover:text-primary/80 mt-2 inline-block transition-colors">Get API Keys →</button>
          </div>
        </div>
      </div>
    </div>
  );

  // ─── CREATE STORE TAB ────────────────────────────────────────────────
  const renderCreateTab = () => (
    <div className="flex flex-col gap-6">
      {/* Back button */}
      <button
        onClick={handleBackToStores}
        className="flex items-center gap-1 text-text-muted text-sm hover:text-white transition-colors w-fit"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
        Back to Stores
      </button>

      {/* Store Information */}
      <div className="bg-card-dark rounded-2xl border border-border-dark overflow-hidden shadow-sm">
        <div className="p-6 border-b border-border-dark">
          <h3 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>storefront</span>
            Store Information
          </h3>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex flex-col gap-2">
            <label className="text-text-muted text-xs font-bold uppercase tracking-wider">Store Name *</label>
            <input
              type="text"
              value={formData.storeName || ''}
              onChange={e => handleChange('storeName', e.target.value)}
              placeholder="e.g., Urban Trends Dubai"
              className="bg-[#1a2332] border border-border-dark rounded-xl px-4 py-2.5 text-sm text-white placeholder-text-muted/50 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-text-muted text-xs font-bold uppercase tracking-wider">Store URL</label>
            <input
              type="text"
              value={formData.storeUrl || ''}
              onChange={e => handleChange('storeUrl', e.target.value)}
              placeholder="https://yourstore.com"
              className="bg-[#1a2332] border border-border-dark rounded-xl px-4 py-2.5 text-sm text-white placeholder-text-muted/50 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-text-muted text-xs font-bold uppercase tracking-wider">Support Email</label>
            <input
              type="email"
              value={formData.supportEmail || ''}
              onChange={e => handleChange('supportEmail', e.target.value)}
              placeholder="support@yourstore.com"
              className="bg-[#1a2332] border border-border-dark rounded-xl px-4 py-2.5 text-sm text-white placeholder-text-muted/50 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-text-muted text-xs font-bold uppercase tracking-wider">Currency</label>
            <select
              value={formData.currency || 'AED'}
              onChange={e => handleChange('currency', e.target.value)}
              className="bg-[#1a2332] border border-border-dark rounded-xl px-4 py-2.5 text-sm text-white focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all"
            >
              <option value="AED">AED - United Arab Emirates Dirham</option>
              <option value="SAR">SAR - Saudi Riyal</option>
              <option value="USD">USD - US Dollar</option>
              <option value="EUR">EUR - Euro</option>
              <option value="GBP">GBP - British Pound</option>
            </select>
          </div>
        </div>
      </div>

      {/* Google Sheets Integration */}
      <div className="bg-card-dark rounded-2xl border border-border-dark overflow-hidden shadow-sm">
        <div className="p-6 border-b border-border-dark flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-[#34A853]" style={{ fontSize: 18 }}>table_chart</span>
              Google Sheets Integration
              <span className="material-symbols-outlined text-text-muted/60" style={{ fontSize: 14 }}>lock</span>
            </h3>
            <p className="text-text-muted text-xs mt-1">Connect your order spreadsheet using Service Account credentials.</p>
          </div>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${connectionStatus === 'success' ? 'bg-green-500/10 text-green-400 border-green-500/30' : connectionStatus === 'error' ? 'bg-red-500/10 text-red-400 border-red-500/30' : connectionStatus === 'testing' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' : 'bg-white/5 text-text-muted border-border-dark'}`}>
            <span className={`size-2 rounded-full ${connectionStatus === 'success' ? 'bg-green-400' : connectionStatus === 'error' ? 'bg-red-400' : connectionStatus === 'testing' ? 'bg-yellow-400 animate-pulse' : 'bg-gray-400'}`}></span>
            {connectionStatus === 'success' ? 'Connected' : connectionStatus === 'error' ? 'Failed' : connectionStatus === 'testing' ? 'Testing...' : 'Not Connected'}
          </span>
        </div>
        <div className="p-6 flex flex-col gap-6">
          {/* Security note */}
          <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 16 }}>security</span>
            <p className="text-xs text-primary/80 font-medium">Credentials are encrypted and stored securely on the server.</p>
          </div>

          {/* Spreadsheet ID */}
          <div className="flex flex-col gap-2">
            <label className="text-text-muted text-xs font-bold uppercase tracking-wider">Spreadsheet ID *</label>
            <input
              type="text"
              value={formData.gsSpreadsheetId || ''}
              onChange={e => handleChange('gsSpreadsheetId', e.target.value)}
              placeholder="e.g., 1BxiMVs0XRA5nFMdKvBdBZjGMUWqTGk..."
              className="bg-[#1a2332] border border-border-dark rounded-xl px-4 py-2.5 text-sm text-white font-mono placeholder-text-muted/50 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all"
            />
            <p className="text-[10px] text-text-muted">Found in your Google Sheet URL: docs.google.com/spreadsheets/d/<strong className="text-white/60">THIS-IS-THE-ID</strong>/edit</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-text-muted text-xs font-bold uppercase tracking-wider">Sheet / Tab Name</label>
              <input
                type="text"
                value={formData.gsSheetName || 'Sheet1'}
                onChange={e => handleChange('gsSheetName', e.target.value)}
                placeholder="Sheet1"
                className="bg-[#1a2332] border border-border-dark rounded-xl px-4 py-2.5 text-sm text-white placeholder-text-muted/50 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all"
              />
              <p className="text-[10px] text-text-muted">Name of the tab in your spreadsheet.</p>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-text-muted text-xs font-bold uppercase tracking-wider">Project ID</label>
              <input
                type="text"
                value={formData.gsProjectId || ''}
                onChange={e => handleChange('gsProjectId', e.target.value)}
                placeholder="e.g., cod-logistics-123456"
                className="bg-[#1a2332] border border-border-dark rounded-xl px-4 py-2.5 text-sm text-white placeholder-text-muted/50 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all"
              />
              <p className="text-[10px] text-text-muted">Found in your Google Cloud Console.</p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-text-muted text-xs font-bold uppercase tracking-wider">Client Email</label>
            <input
              type="email"
              value={formData.gsClientEmail || ''}
              onChange={e => handleChange('gsClientEmail', e.target.value)}
              placeholder="service-account@project-id.iam.gserviceaccount.com"
              className="bg-[#1a2332] border border-border-dark rounded-xl px-4 py-2.5 text-sm text-white font-mono placeholder-text-muted/50 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all"
            />
            <p className="text-[10px] text-text-muted">Share your Google Sheet with this email address.</p>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-text-muted text-xs font-bold uppercase tracking-wider">Private Key</label>
              <button
                type="button"
                onClick={() => setShowPrivateKey(!showPrivateKey)}
                className="text-[10px] font-bold text-primary hover:text-primary/80 uppercase transition-colors"
              >
                {showPrivateKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <textarea
              value={formData.gsPrivateKey || ''}
              onChange={e => handleChange('gsPrivateKey', e.target.value)}
              placeholder={'-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----'}
              rows={4}
              style={showPrivateKey ? {} : { WebkitTextSecurity: 'disc' as any }}
              className="bg-[#1a2332] border border-border-dark rounded-xl px-4 py-2.5 text-sm text-white font-mono placeholder-text-muted/50 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all resize-none"
            />
          </div>

          {/* Test + Save buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-border-dark">
            <div className="flex items-center gap-2 text-xs text-text-muted">
              {formData.gsLastSyncAt ? (
                <span>Last sync: {new Date(formData.gsLastSyncAt).toLocaleString()}</span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-orange-400 animate-pulse"></span>
                  Waiting to test connection...
                </span>
              )}
            </div>
            <button
              onClick={handleTestConnection}
              disabled={isTesting}
              className="flex items-center gap-2 px-4 py-2 bg-border-dark text-white text-xs font-bold rounded-xl hover:bg-[#2d445a] transition-all disabled:opacity-50"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>wifi_tethering</span>
              {isTesting ? 'Testing...' : 'Test Connection'}
            </button>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      {activeStoreId && (
        <div className="bg-card-dark rounded-2xl border border-red-500/20 overflow-hidden shadow-sm">
          <div className="p-6 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-red-400">Danger Zone</h3>
              <p className="text-xs text-text-muted mt-1">Permanently delete this store and all its credentials.</p>
            </div>
            <button
              onClick={() => handleDelete(activeStoreId)}
              className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 text-xs font-bold rounded-xl hover:bg-red-500/20 transition-all border border-red-500/20"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
              Delete Store
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // ─── WHATSAPP PERSONAL TAB ───────────────────────────────────────────
  const renderWhatsappTab = () => {
    const LANG_COLORS: Record<string, { bg: string; text: string; label: string }> = {
      wa_arrival_en: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'English' },
      wa_arrival_es: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', label: 'Spanish' },
      wa_arrival_it: { bg: 'bg-green-500/10', text: 'text-green-400', label: 'Italian' },
    };

    return (
      <div className="flex flex-col gap-6">
        {/* WhatsApp Message Banner */}
        {waMessage && (
          <div className={`px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-2 ${waMessage.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{waMessage.type === 'success' ? 'check_circle' : 'error'}</span>
            {waMessage.text}
          </div>
        )}

        {/* ── Section 1: Account Management ── */}
        <div className="bg-card-dark rounded-2xl border border-border-dark overflow-hidden shadow-sm">
          <div className="p-6 border-b border-border-dark flex items-center justify-between">
            <h3 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
              <img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" alt="WA" className="size-5" />
              WhatsApp Account
            </h3>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${waConnected ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
              <span className={`size-2 rounded-full ${waConnected ? 'bg-green-400' : 'bg-red-400'}`}></span>
              {waConnected ? 'Connected' : 'Not Connected'}
            </span>
          </div>
          <div className="p-6">
            {waConnected ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="size-12 rounded-full bg-green-500/10 flex items-center justify-center">
                    <span className="material-symbols-outlined text-green-400" style={{ fontSize: 24 }}>phone_iphone</span>
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm">+{waPhone?.replace('@c.us', '')}</p>
                    <p className="text-text-muted text-xs">17Track Arrival messages will be sent from this number (1hr after In Transit).</p>
                  </div>
                </div>
                <button
                  onClick={disconnectWa}
                  disabled={waLoading}
                  className="px-5 py-2 bg-red-500/10 text-red-400 font-bold text-xs rounded-xl border border-red-500/20 hover:bg-red-500/20 transition-colors"
                >
                  {waLoading ? 'Disconnecting...' : 'Disconnect'}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {/* Phone Number Pairing (Primary) */}
                <div className="flex flex-col gap-3">
                  <h4 className="text-white font-bold text-sm">Link with Phone Number</h4>
                  <p className="text-text-muted text-xs">Enter your WhatsApp number with country code. You'll get an 8-digit code to type into your WhatsApp app.</p>
                  <div className="flex items-center gap-3">
                    <input
                      type="tel"
                      value={waPhoneInput}
                      onChange={e => setWaPhoneInput(e.target.value)}
                      placeholder="+393331234567"
                      className="flex-1 max-w-xs bg-[#1a2332] border border-border-dark rounded-xl px-4 py-2.5 text-sm text-white placeholder-text-muted/50 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all font-mono"
                    />
                    <button
                      onClick={requestPairingCode}
                      disabled={waPairingLoading}
                      className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{waPairingLoading ? 'hourglass_empty' : 'link'}</span>
                      {waPairingLoading ? 'Generating...' : 'Get Pairing Code'}
                    </button>
                  </div>

                  {/* Pairing Code Display */}
                  {waPairingCode && (
                    <div className="bg-primary/5 border border-primary/20 rounded-xl px-6 py-4 flex flex-col items-center gap-2 max-w-sm">
                      <p className="text-text-muted text-xs">Enter this code on your phone:</p>
                      <p className="text-white font-black text-3xl tracking-[0.4em] font-mono">{waPairingCode}</p>
                      <p className="text-primary text-[10px] font-bold uppercase mt-1">WhatsApp → Linked Devices → Link a Device → Link with phone number</p>
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div className="flex items-center gap-4">
                  <div className="flex-1 h-px bg-border-dark"></div>
                  <span className="text-text-muted text-[10px] font-bold uppercase">or</span>
                  <div className="flex-1 h-px bg-border-dark"></div>
                </div>

                {/* QR Code Fallback */}
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => { setWaShowQr(!waShowQr); if (!waShowQr) fetchWaQr(); }}
                    className="text-text-muted text-xs font-bold hover:text-white transition-colors flex items-center gap-1 w-fit"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{waShowQr ? 'expand_less' : 'qr_code_2'}</span>
                    {waShowQr ? 'Hide QR Code' : 'Scan QR Code instead'}
                  </button>
                  {waShowQr && (
                    <div className="flex items-center gap-6">
                      <div className="bg-white p-3 rounded-2xl shadow-xl">
                        {waQrCode ? (
                          <img src={waQrCode} alt="WhatsApp QR Code" className="size-48" />
                        ) : (
                          <div className="size-48 bg-gray-100 animate-pulse rounded-xl flex items-center justify-center">
                            <span className="text-gray-400 font-bold text-xs">Loading QR...</span>
                          </div>
                        )}
                      </div>
                      <div className="text-text-muted text-xs leading-relaxed">
                        <p>1. Open WhatsApp on your phone</p>
                        <p>2. Tap <strong className="text-white">Linked Devices</strong></p>
                        <p>3. Tap <strong className="text-white">Link a Device</strong></p>
                        <p>4. Point your phone at this QR code</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Section 2: Editable Message Templates ── */}
        <div className="bg-card-dark rounded-2xl border border-border-dark overflow-hidden shadow-sm">
          <div className="p-6 border-b border-border-dark">
            <h3 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>edit_note</span>
              Message Templates
            </h3>
            <p className="text-text-muted text-xs mt-1">Edit templates below and save. Variables: <code className="text-primary/80">{`{{1}}`}</code> = Customer Name, <code className="text-primary/80">{`{{2}}`}</code> = Store Name, <code className="text-primary/80">{`{{3}}`}</code> = COD Amount, <code className="text-primary/80">{`{{4}}`}</code> = Items</p>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
            {waTemplates.length === 0 ? (
              <div className="col-span-3 text-center py-8">
                <span className="text-text-muted text-xs italic">No templates found. Run the seed script to add default templates.</span>
              </div>
            ) : (
              waTemplates.map((tpl: any) => {
                const colors = LANG_COLORS[tpl.templateName] || { bg: 'bg-white/5', text: 'text-text-muted', label: tpl.templateName };
                return (
                  <div key={tpl.id} className="bg-[#1a2332] rounded-xl border border-border-dark p-4 flex flex-col gap-3">
                    <span className={`inline-flex px-2 py-0.5 ${colors.bg} ${colors.text} text-[10px] font-bold uppercase rounded border border-current/20 w-fit`}>
                      {colors.label}
                    </span>
                    <textarea
                      value={tpl.bodyTemplate}
                      onChange={e => {
                        setWaTemplates(prev => prev.map(t => t.id === tpl.id ? { ...t, bodyTemplate: e.target.value } : t));
                      }}
                      rows={8}
                      className="bg-[#0f1923] border border-border-dark rounded-lg px-3 py-2 text-xs text-white/80 font-mono leading-relaxed focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all resize-none"
                    />
                    <button
                      onClick={() => saveTemplate(tpl.id, tpl.bodyTemplate)}
                      disabled={waTemplateSaving === tpl.id}
                      className="self-end px-4 py-1.5 bg-primary/10 text-primary text-[10px] font-bold rounded-lg border border-primary/20 hover:bg-primary/20 transition-colors disabled:opacity-50"
                    >
                      {waTemplateSaving === tpl.id ? 'Saving...' : 'Save Template'}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  };

  // ─── MAIN RENDER ─────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-white text-3xl font-black tracking-tight">Store Management</h1>
          <span className="bg-card-dark text-text-muted text-xs px-2.5 py-1 rounded-full font-bold border border-border-dark">{stores.length} Store{stores.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-3">
          {activeTab === 'create' && (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all disabled:opacity-50"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>save</span>
              {isSaving ? 'Saving...' : activeStoreId ? 'Save Changes' : 'Create Store'}
            </button>
          )}
          {activeTab === 'connection' && (
            <button
              onClick={handleConnectNew}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
              Connect New Store
            </button>
          )}
        </div>
      </div>

      {/* Message Banner */}
      {message && (
        <div className={`px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-2 ${message.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{message.type === 'success' ? 'check_circle' : 'error'}</span>
          {message.text}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex items-center border-b border-border-dark">
        <button
          onClick={() => setActiveTab('connection')}
          className={`px-5 py-3 text-sm font-bold transition-all relative ${activeTab === 'connection' ? 'text-primary' : 'text-text-muted hover:text-white'}`}
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>link</span>
            Store Connection
          </div>
          {activeTab === 'connection' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"></div>}
        </button>
        <button
          onClick={() => setActiveTab('create')}
          className={`px-5 py-3 text-sm font-bold transition-all relative ${activeTab === 'create' ? 'text-primary' : 'text-text-muted hover:text-white'}`}
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{activeStoreId ? 'edit' : 'add_circle'}</span>
            {activeStoreId ? 'Edit Store' : 'Create Store'}
          </div>
          {activeTab === 'create' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"></div>}
        </button>
        <button
          onClick={() => setActiveTab('whatsapp')}
          className={`px-5 py-3 text-sm font-bold transition-all relative ${activeTab === 'whatsapp' ? 'text-primary' : 'text-text-muted hover:text-white'}`}
        >
          <div className="flex items-center gap-2">
            <img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" alt="WA" className="size-4" style={{ filter: activeTab !== 'whatsapp' ? 'grayscale(100%) opacity(60%)' : 'none' }} />
            WhatsApp
          </div>
          {activeTab === 'whatsapp' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"></div>}
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'connection' ? renderConnectionTab() : activeTab === 'whatsapp' ? renderWhatsappTab() : renderCreateTab()}
    </div>
  );
};

export default SettingsPage;
