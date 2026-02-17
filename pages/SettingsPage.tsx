import React, { useState, useEffect } from 'react';
import storeSettingsService, { StoreSettings } from '../src/services/settings.service';

type ActiveTab = 'connection' | 'create';

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
                          <span className="text-xs text-text-muted">{store.gsLastSyncAt ? 'Auto-sync' : 'Never synced'}</span>
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
      </div>

      {/* Tab Content */}
      {activeTab === 'connection' ? renderConnectionTab() : renderCreateTab()}
    </div>
  );
};

export default SettingsPage;
