import React, { useState, useEffect, useCallback, useMemo } from 'react';
import apiClient from '../src/services/apiClient';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Order {
  id: string;
  orderNumber: string;
  orderDate: string;
  orderStatus: string;
  confirmationStatus: string;
  paymentStatus: string;
  totalAmount: number;
  shippingFee?: number;
  shippingCountry: string;
  items?: { productId: string; productName: string; sku: string; quantity: number; unitPrice: number }[];
  customer?: { name: string };
}

interface DateRange {
  from: Date;
  to: Date;
}

type DatePreset = 'today' | 'yesterday' | '7days' | 'thisMonth' | 'lastMonth' | 'custom';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const formatK = (n: number) => {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
};

const getPresetRange = (preset: DatePreset): DateRange => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case 'today':
      return { from: today, to: new Date(today.getTime() + 86399999) };
    case 'yesterday': {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      return { from: y, to: new Date(y.getTime() + 86399999) };
    }
    case '7days': {
      const s = new Date(today); s.setDate(s.getDate() - 6);
      return { from: s, to: new Date(today.getTime() + 86399999) };
    }
    case 'thisMonth':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59) };
    case 'lastMonth':
      return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59) };
    default:
      return { from: today, to: new Date(today.getTime() + 86399999) };
  }
};

const fmtDate = (d: Date) => d.toISOString().split('T')[0];

// ─── Mini Sparkline ───────────────────────────────────────────────────────────
const Sparkline: React.FC<{ data: number[]; color: string; height?: number }> = ({ data, color, height = 40 }) => {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data) || 1;
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 120, h = height;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`).join(' ');
  return (
    <svg width={w} height={h} className="opacity-80">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard: React.FC<{
  label: string; value: string; sub?: string; icon: string;
  iconColor: string; trend?: number; spark?: number[];
}> = ({ label, value, sub, icon, iconColor, trend, spark }) => (
  <div className="bg-card-dark border border-border-dark rounded-2xl p-5 flex flex-col gap-3 hover:border-primary/30 transition-all group">
    <div className="flex items-start justify-between">
      <div className={`size-10 rounded-xl flex items-center justify-center ${iconColor}`}>
        <span className="material-symbols-outlined text-[20px]">{icon}</span>
      </div>
      {trend !== undefined && (
        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full border ${trend >= 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
        </span>
      )}
    </div>
    <div>
      <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">{label}</p>
      <p className="text-2xl font-black text-white mt-1 leading-none">{value}</p>
      {sub && <p className="text-xs text-text-muted mt-1">{sub}</p>}
    </div>
    {spark && <Sparkline data={spark} color={iconColor.includes('emerald') ? '#10b981' : iconColor.includes('blue') ? '#3b82f6' : iconColor.includes('amber') ? '#f59e0b' : '#6366f1'} />}
  </div>
);


// ─── Main Dashboard ───────────────────────────────────────────────────────────
const PerformancePage: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [datePreset, setDatePreset] = useState<DatePreset>('thisMonth');
  const [dateRange, setDateRange] = useState<DateRange>(getPresetRange('thisMonth'));
  const [showCalendar, setShowCalendar] = useState(false);
  const [customFrom, setCustomFrom] = useState(fmtDate(new Date()));
  const [customTo, setCustomTo] = useState(fmtDate(new Date()));
  const [selectedCountry, setSelectedCountry] = useState('All');
  const [skuView, setSkuView] = useState<'revenue' | 'profit'>('revenue');

  // ─── Fetch All Orders ──────────────────────────────────────────────────────
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let allOrders: Order[] = [];
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const res = await apiClient.get('/orders', { params: { page, limit: 100 } });
        const data = res.data;
        const batch: Order[] = data?.data || (Array.isArray(data) ? data : []);
        allOrders = [...allOrders, ...batch];
        const meta = data?.meta;
        if (!meta || page >= (meta.totalPages || 1)) hasMore = false;
        else page++;
      }
      setOrders(allOrders);
    } catch (e: any) {
      setError('Failed to load orders: ' + (e?.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // ─── Apply Date Preset ─────────────────────────────────────────────────────
  const applyPreset = (p: DatePreset) => {
    setDatePreset(p);
    if (p !== 'custom') {
      setDateRange(getPresetRange(p));
      setShowCalendar(false);
    } else {
      setShowCalendar(true);
    }
  };

  const applyCustomRange = () => {
    setDateRange({ from: new Date(customFrom), to: new Date(customTo + 'T23:59:59') });
    setShowCalendar(false);
  };

  // ─── Filter Orders ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return orders.filter(o => {
      const d = new Date(o.orderDate);
      if (d < dateRange.from || d > dateRange.to) return false;
      if (selectedCountry !== 'All' && o.shippingCountry !== selectedCountry) return false;
      return true;
    });
  }, [orders, dateRange, selectedCountry]);

  // ─── Countries ─────────────────────────────────────────────────────────────
  const countries = useMemo(() => {
    const set = new Set(orders.map(o => o.shippingCountry).filter(Boolean));
    return ['All', ...Array.from(set).sort()];
  }, [orders]);

  // ─── KPI Metrics ───────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const totalLeads = filtered.length;
    const confirmLeads = filtered.filter(o => o.confirmationStatus === 'Confirmed').length;
    const rejectLeads = filtered.filter(o => ['Cancelled', 'Declined'].includes(o.confirmationStatus || '')).length;
    const shipped = filtered.filter(o => ['Shipped', 'InTransit', 'OutForDelivery'].includes(o.orderStatus)).length;
    const delivered = filtered.filter(o => o.orderStatus === 'Delivered').length;
    const undelivered = filtered.filter(o => o.orderStatus === 'Undelivered').length;
    const outForDelivery = filtered.filter(o => o.orderStatus === 'OutForDelivery').length;
    const failed = filtered.filter(o => ['Exception', 'Expired', 'Cancelled'].includes(o.orderStatus)).length;
    const pending = filtered.filter(o => o.confirmationStatus === 'Pending' || o.orderStatus === 'Pending').length;

    const totalRevenue = filtered.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
    const confirmedRevenue = filtered.filter(o => o.confirmationStatus === 'Confirmed').reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
    const collectedRevenue = filtered.filter(o => o.orderStatus === 'Delivered').reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
    const totalProfit = filtered.reduce((sum, o) => sum + Number(o.profitMargin || 0), 0);
    const confirmRate = totalLeads > 0 ? (confirmLeads / totalLeads) * 100 : 0;
    const deliveryRate = confirmLeads > 0 ? (delivered / confirmLeads) * 100 : 0;
    const returnRate = (delivered + undelivered) > 0 ? (undelivered / (delivered + undelivered)) * 100 : 0;

    return {
      totalLeads, confirmLeads, rejectLeads, shipped, delivered,
      undelivered, outForDelivery, failed, pending,
      totalRevenue, confirmedRevenue, collectedRevenue, totalProfit,
      confirmRate, deliveryRate, returnRate,
    };
  }, [filtered]);


  // ─── Top SKUs ──────────────────────────────────────────────────────────────
  const topSkus = useMemo(() => {
    const map = new Map<string, { name: string; sku: string; leads: number; orders: number; revenue: number; returns: number }>();
    for (const o of filtered) {
      for (const item of o.items || []) {
        const key = item.sku || item.productName;
        const existing = map.get(key) || { name: item.productName, sku: item.sku, leads: 0, orders: 0, revenue: 0, returns: 0 };
        existing.leads += 1;
        if (o.confirmationStatus === 'Confirmed') existing.orders += 1;
        if (o.confirmationStatus === 'Confirmed') existing.revenue += Number(item.unitPrice || 0) * Number(item.quantity || 1);
        if (o.orderStatus === 'Undelivered') existing.returns += 1;
        map.set(key, existing);
      }
    }
    return Array.from(map.values())
      .sort((a, b) => skuView === 'revenue' ? b.revenue - a.revenue : b.orders - b.returns - (a.orders - a.returns))
      .slice(0, 10);
  }, [filtered, skuView]);

  // ─── Daily Revenue Sparkline ───────────────────────────────────────────────
  const dailyData = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of filtered) {
      const day = typeof o.orderDate === 'string' ? o.orderDate.split('T')[0] : (o.orderDate ? new Date(o.orderDate).toISOString().split('T')[0] : '');
      map.set(day, (map.get(day) || 0) + Number(o.totalAmount || 0));
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  }, [filtered]);

  const presetLabels: Record<DatePreset, string> = {
    today: 'Today', yesterday: 'Yesterday', '7days': 'Last 7 Days',
    thisMonth: 'This Month', lastMonth: 'Last Month', custom: 'Custom Range',
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="size-12 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-text-muted text-sm font-bold uppercase tracking-widest">Loading Dashboard...</p>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <span className="material-symbols-outlined text-red-500 text-5xl">error</span>
      <p className="text-white font-bold text-lg">{error}</p>
      <button onClick={fetchOrders} className="px-6 py-3 bg-primary rounded-xl text-white text-sm font-bold hover:bg-primary/90 transition-all">
        Retry
      </button>
    </div>
  );

  return (
    <div className="flex flex-col gap-8 pb-16">

      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-text-muted text-xs mb-2">
            <span>Home</span><span>/</span><span className="text-white">Executive Performance</span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">Executive Performance</h1>
          <p className="text-text-muted text-sm mt-1">Real-time COD pipeline intelligence and business metrics.</p>
        </div>
        <button onClick={fetchOrders} className="flex items-center gap-2 px-4 py-2.5 bg-card-dark border border-border-dark rounded-xl text-text-muted hover:text-white hover:border-primary/40 transition-all text-sm font-bold">
          <span className="material-symbols-outlined text-[18px]">refresh</span>
          Refresh
        </button>
      </div>

      {/* ── Filters Bar ──────────────────────────────────────────────────────── */}
      <div className="bg-card-dark border border-border-dark rounded-2xl p-4 flex flex-col gap-4 relative">
        <div className="flex flex-wrap items-center gap-3">
          {/* Date presets */}
          <div className="flex items-center gap-1 bg-[#1c2d3d] rounded-xl p-1 flex-wrap">
            {(['today', 'yesterday', '7days', 'thisMonth', 'lastMonth', 'custom'] as DatePreset[]).map(p => (
              <button
                key={p}
                onClick={() => applyPreset(p)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${datePreset === p ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-text-muted hover:text-white'}`}
              >
                {presetLabels[p]}
              </button>
            ))}
          </div>

          {/* Country Filter */}
          <div className="relative">
            <select
              className="appearance-none bg-[#1c2d3d] border border-border-dark text-white text-xs font-bold rounded-xl pl-4 pr-8 py-2.5 focus:outline-none focus:border-primary transition-all cursor-pointer"
              value={selectedCountry}
              onChange={e => setSelectedCountry(e.target.value)}
            >
              {countries.map(c => <option key={c} value={c}>{c === 'All' ? '🌍 All Countries' : `🏳 ${c}`}</option>)}
            </select>
            <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none text-[16px]">expand_more</span>
          </div>

          {/* Date range display */}
          <div className="ml-auto text-[10px] text-text-muted font-bold uppercase tracking-widest bg-[#1c2d3d] px-3 py-2 rounded-xl border border-border-dark">
            {fmtDate(dateRange.from)} → {fmtDate(dateRange.to)}
          </div>
        </div>

        {/* Custom date picker */}
        {showCalendar && (
          <div className="flex items-center gap-3 bg-[#1c2d3d] border border-border-dark rounded-xl p-4">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black text-text-muted uppercase">From</label>
              <input
                type="date"
                value={!isNaN(dateRange.from.getTime()) ? dateRange.from.toISOString().split('T')[0] : ''}
                onChange={(e) => {
                  setDatePreset('custom');
                  const d = new Date(e.target.value);
                  if (!isNaN(d.getTime())) {
                    setDateRange(prev => ({ ...prev, from: d }));
                  }
                }}
                className="bg-[#17232f] border border-border-dark text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-primary" />
            </div>
            <span className="text-text-muted mt-5">→</span>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black text-text-muted uppercase">To</label>
              <input
                type="date"
                value={!isNaN(dateRange.to.getTime()) ? dateRange.to.toISOString().split('T')[0] : ''}
                onChange={(e) => {
                  setDatePreset('custom');
                  const d = new Date(e.target.value);
                  if (!isNaN(d.getTime())) {
                    d.setHours(23, 59, 59, 999);
                    setDateRange(prev => ({ ...prev, to: d }));
                  }
                }}
                className="bg-[#17232f] border border-border-dark text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-primary" />
            </div>
            <button onClick={applyCustomRange}
              className="mt-5 px-4 py-2 bg-primary text-white text-xs font-black uppercase rounded-lg hover:bg-primary/90 transition-all">
              Apply
            </button>
            <button onClick={() => setShowCalendar(false)}
              className="mt-5 px-3 py-2 bg-[#17232f] text-text-muted text-xs font-bold rounded-lg hover:text-white transition-all border border-border-dark">
              ✕
            </button>
          </div>
        )}
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-2">
        <StatCard label="Total Revenue" value={formatK(metrics.totalRevenue)} sub={`${metrics.totalLeads} total leads`} icon="payments" iconColor="bg-primary/15 text-primary" spark={dailyData} />
        <StatCard label="Confirmed Revenue" value={formatK(metrics.confirmedRevenue)} sub={`${metrics.confirmLeads} confirmed orders`} icon="verified" iconColor="bg-emerald-500/15 text-emerald-400" />
        <StatCard label="Confirm Rate" value={`${metrics.confirmRate.toFixed(1)}%`} sub={`${metrics.confirmLeads} / ${metrics.totalLeads}`} icon="check_circle" iconColor="bg-emerald-500/15 text-emerald-400" />
        <StatCard label="Total Orders" value={metrics.totalLeads.toLocaleString()} sub={`${selectedCountry !== 'All' ? selectedCountry : 'All countries'}`} icon="package_2" iconColor="bg-violet-500/15 text-violet-400" />
        <StatCard label="Delivered" value={metrics.delivered.toLocaleString()} sub={`${metrics.failed} failed/exception`} icon="task_alt" iconColor="bg-teal-500/15 text-teal-400" />
        <StatCard label="Return / Fail Rate" value={`${metrics.returnRate.toFixed(1)}%`} sub={`${metrics.undelivered} undelivered`} icon="undo" iconColor="bg-red-500/15 text-red-400" />
        <StatCard label="COD Collected" value={formatK(metrics.collectedRevenue)} sub="Payment status: Paid" icon="wallet" iconColor="bg-blue-500/15 text-blue-400" />
      </div>

      {/* ── Two-Column: Funnel + Market Share ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Order Funnel */}
        <div className="lg:col-span-2 bg-card-dark border border-border-dark rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border-dark bg-[#14202c] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[18px]">filter_alt</span>
              <h3 className="text-[10px] font-black uppercase tracking-widest text-white">Order Pipeline Funnel</h3>
            </div>
            <span className="text-[10px] text-text-muted font-bold">{filtered.length} total</span>
          </div>
          <div className="p-6 flex flex-col md:flex-row items-center justify-evenly gap-12 min-h-[400px]">
            {/* Pyramid Funnel (5 Stages) */}
            <div className="flex flex-col items-center w-full max-w-xs relative drop-shadow-2xl">
              {/* STAGE 1: All Leads */}
              <div className="w-full relative z-50 group">
                <div className="h-14 sm:h-16 bg-[#a5d8f3] flex flex-col items-center justify-center transition-transform hover:scale-[1.03] cursor-default" style={{ clipPath: 'polygon(0 0, 100% 0, 90% 100%, 10% 100%)' }}>
                  <span className="text-[#0c4a6e] text-xs sm:text-[13px] font-black tracking-widest leading-none mt-1">ALL LEADS</span>
                  <span className="text-[#082f49] text-[10px] font-bold mt-1">{metrics.totalLeads.toLocaleString()} (100%)</span>
                </div>
                {/* 3D lip shadow */}
                <div className="h-4 bg-[#082f49] w-[80%] mx-auto -mt-2 opacity-70" style={{ clipPath: 'polygon(0 0, 100% 0, 95% 100%, 5% 100%)' }}></div>
              </div>

              {/* STAGE 2: Confirm Leads */}
              <div className="w-[80%] relative z-40 group -mt-1.5">
                <div className="h-14 sm:h-16 bg-[#f7d87c] flex flex-col items-center justify-center transition-transform hover:scale-[1.03] cursor-default" style={{ clipPath: 'polygon(0 0, 100% 0, 87.5% 100%, 12.5% 100%)' }}>
                  <span className="text-[#78350f] text-xs sm:text-[13px] font-black tracking-widest leading-none mt-1">CONFIRM LEADS</span>
                  <span className="text-[#451a03] text-[10px] font-bold mt-1">{metrics.confirmLeads.toLocaleString()} ({metrics.totalLeads ? Math.round(metrics.confirmLeads / metrics.totalLeads * 100) : 0}%)</span>
                </div>
                <div className="h-4 bg-[#451a03] w-[75%] mx-auto -mt-2 opacity-70" style={{ clipPath: 'polygon(0 0, 100% 0, 94% 100%, 6% 100%)' }}></div>
              </div>

              {/* STAGE 3: Shipped */}
              <div className="w-[60%] relative z-30 group -mt-1.5">
                <div className="h-14 sm:h-16 bg-[#e29baf] flex flex-col items-center justify-center transition-transform hover:scale-[1.03] cursor-default" style={{ clipPath: 'polygon(0 0, 100% 0, 83.33% 100%, 16.66% 100%)' }}>
                  <span className="text-[#881337] text-xs sm:text-[13px] font-black tracking-widest leading-none mt-1">SHIPPED</span>
                  <span className="text-[#4c0519] text-[10px] font-bold mt-1">{metrics.shipped.toLocaleString()} ({metrics.totalLeads ? Math.round(metrics.shipped / metrics.totalLeads * 100) : 0}%)</span>
                </div>
                <div className="h-4 bg-[#4c0519] w-[66.66%] mx-auto -mt-2 opacity-70" style={{ clipPath: 'polygon(0 0, 100% 0, 90% 100%, 10% 100%)' }}></div>
              </div>

              {/* STAGE 4: Out Of Delivery */}
              <div className="w-[40%] relative z-20 group -mt-1.5">
                <div className="h-14 sm:h-16 bg-[#b8a1de] flex flex-col items-center justify-center transition-transform hover:scale-[1.03] cursor-default" style={{ clipPath: 'polygon(0 0, 100% 0, 75% 100%, 25% 100%)' }}>
                  <span className="text-[#3b2161] text-[11px] sm:text-xs font-black tracking-widest leading-none mt-1">OUT OF DELIVERY</span>
                  <span className="text-[#26153f] text-[10px] font-bold mt-1">{metrics.outForDelivery.toLocaleString()} ({metrics.totalLeads ? Math.round(metrics.outForDelivery / metrics.totalLeads * 100) : 0}%)</span>
                </div>
                <div className="h-4 bg-[#26153f] w-[50%] mx-auto -mt-2 opacity-70" style={{ clipPath: 'polygon(0 0, 100% 0, 85% 100%, 15% 100%)' }}></div>
              </div>

              {/* STAGE 5: Delivered */}
              <div className="w-[20%] relative z-10 group -mt-1.5">
                <div className="h-20 sm:h-24 bg-[#9598e6] flex flex-col items-center justify-start pt-3 transition-transform hover:scale-[1.05] cursor-default" style={{ clipPath: 'polygon(0 0, 100% 0, 50% 100%)' }}>
                  <span className="text-[#1e1b4b] text-[10px] sm:text-xs font-black tracking-widest leading-none text-center">DELIVERED</span>
                  <span className="text-[#312e81] text-[9px] font-bold mt-1">{metrics.delivered.toLocaleString()} ({metrics.totalLeads ? Math.round(metrics.delivered / metrics.totalLeads * 100) : 0}%)</span>
                </div>
              </div>
            </div>

            {/* Side Panel: Drop-offs & Other Pipeline Stages */}
            <div className="w-full max-w-[280px] flex flex-col gap-4 bg-[#17232f] border border-[#233648] p-5 rounded-2xl shadow-xl">
              <h4 className="text-[10px] font-black text-text-muted uppercase tracking-widest border-b border-border-dark pb-3 mb-1">Pipeline Drop-offs / Other</h4>

              <div className="flex justify-between items-center text-sm border-b border-[#1c2d3d] pb-2">
                <div className="flex items-center gap-2"><span className="material-symbols-outlined text-[16px] text-yellow-500">hourglass_empty</span><span className="text-text-muted text-xs font-bold">Pending</span></div>
                <span className="font-black text-white">{metrics.pending}</span>
              </div>
              <div className="flex justify-between items-center text-sm border-b border-[#1c2d3d] pb-2">
                <div className="flex items-center gap-2"><span className="material-symbols-outlined text-[16px] text-red-400">cancel</span><span className="text-text-muted text-xs font-bold">Rejected Leads</span></div>
                <span className="font-black text-white">{metrics.rejectLeads}</span>
              </div>
              <div className="flex justify-between items-center text-sm border-b border-[#1c2d3d] pb-2">
                <div className="flex items-center gap-2"><span className="material-symbols-outlined text-[16px] text-amber-500">assignment_return</span><span className="text-text-muted text-xs font-bold">Undelivered</span></div>
                <span className="font-black text-white">{metrics.undelivered}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-2"><span className="material-symbols-outlined text-[16px] text-red-500">error</span><span className="text-text-muted text-xs font-bold">Delivery Fail / Expired</span></div>
                <span className="font-black text-white">{metrics.failed}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Market Share Card */}
        <div className="bg-card-dark border border-border-dark rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border-dark bg-[#14202c] flex items-center justify-between">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-white">Market Share</h3>
            <span className="material-symbols-outlined text-text-muted text-[18px]">more_horiz</span>
          </div>
          <div className="p-6 flex flex-col gap-4">
            {/* Big Revenue Number */}
            <div className="flex flex-col items-center justify-center py-4 gap-1">
              <p className="text-4xl font-black text-white">{formatK(metrics.confirmedRevenue)}</p>
              <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">Confirmed Revenue</p>
            </div>
            <div className="h-px bg-border-dark"></div>
            {/* Country breakdown */}
            <div className="flex flex-col gap-2">
              {(() => {
                const cMap = new Map<string, number>();
                for (const o of filtered) {
                  if (o.confirmationStatus === 'Confirmed') {
                    cMap.set(o.shippingCountry || 'Unknown', (cMap.get(o.shippingCountry || 'Unknown') || 0) + Number(o.totalAmount || 0));
                  }
                }
                const sorted = Array.from(cMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
                const total = sorted.reduce((s, [, v]) => s + v, 0) || 1;
                const colors = ['bg-primary', 'bg-emerald-500', 'bg-blue-500', 'bg-amber-500', 'bg-violet-500'];
                return sorted.map(([country, rev], i) => (
                  <div key={country} className="flex items-center gap-3">
                    <div className={`size-2.5 rounded-sm shrink-0 ${colors[i]}`}></div>
                    <span className="text-xs text-text-muted flex-1 truncate font-medium">{country}</span>
                    <span className="text-xs font-black text-white">{formatK(rev)}</span>
                    <span className="text-[10px] text-text-muted w-10 text-right">{((rev / total) * 100).toFixed(0)}%</span>
                  </div>
                ));
              })()}
              {filtered.filter(o => o.confirmationStatus === 'Confirmed').length === 0 && (
                <p className="text-xs text-text-muted text-center py-4 italic">No confirmed orders in range</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Top Moving SKUs ───────────────────────────────────────────────────── */}
      <div className="bg-card-dark border border-border-dark rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border-dark bg-[#14202c] flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[18px]">trending_up</span>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-white">Top Moving SKUs</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSkuView('revenue')}
              className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${skuView === 'revenue' ? 'bg-primary text-white' : 'text-text-muted hover:text-white bg-[#1c2d3d]'}`}
            >Revenue</button>
            <button
              onClick={() => setSkuView('profit')}
              className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${skuView === 'profit' ? 'bg-primary text-white' : 'text-text-muted hover:text-white bg-[#1c2d3d]'}`}
            >Profit</button>
          </div>
        </div>

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-[#17232f] border-b border-[#233648]">
                <th className="px-6 py-4 text-[10px] font-black text-text-muted uppercase tracking-widest w-8">#</th>
                <th className="px-6 py-4 text-[10px] font-black text-text-muted uppercase tracking-widest">Product Details</th>
                <th className="px-6 py-4 text-[10px] font-black text-text-muted uppercase tracking-widest text-right">Leads</th>
                <th className="px-6 py-4 text-[10px] font-black text-text-muted uppercase tracking-widest text-right">Orders</th>
                <th className="px-6 py-4 text-[10px] font-black text-text-muted uppercase tracking-widest text-right">Revenue</th>
                <th className="px-6 py-4 text-[10px] font-black text-text-muted uppercase tracking-widest text-right">Return Rate</th>
                <th className="px-6 py-4 text-[10px] font-black text-text-muted uppercase tracking-widest text-right">Conv. Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#233648]">
              {topSkus.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <span className="material-symbols-outlined text-text-muted text-4xl">inventory_2</span>
                      <p className="text-text-muted text-sm">No product data for selected period</p>
                    </div>
                  </td>
                </tr>
              ) : topSkus.map((sku, i) => {
                const convRate = sku.leads > 0 ? (sku.orders / sku.leads) * 100 : 0;
                const retRate = (sku.orders) > 0 ? (sku.returns / sku.orders) * 100 : 0;
                return (
                  <tr key={sku.sku || i} className="hover:bg-[#1c2d3d]/50 transition-colors">
                    <td className="px-6 py-5">
                      <span className="text-[10px] font-black text-text-muted/50">#{i + 1}</span>
                    </td>
                    <td className="px-6 py-5">
                      <p className="text-sm font-bold text-white">{sku.name || 'Unknown Product'}</p>
                      <p className="text-[10px] text-text-muted font-mono mt-0.5">{sku.sku || 'N/A'}</p>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <span className="text-sm font-bold text-text-muted">{sku.leads.toLocaleString()}</span>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <span className="text-sm font-black text-white">{sku.orders.toLocaleString()}</span>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <span className="text-sm font-black text-primary">{formatCurrency(sku.revenue)}</span>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <span className={`text-sm font-black ${retRate > 20 ? 'text-red-400' : retRate > 10 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {retRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-[#1c2d3d] rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(convRate, 100)}%` }}></div>
                        </div>
                        <span className="text-xs font-bold text-text-muted w-10 text-right">{convRate.toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 border-t border-border-dark flex items-center justify-between">
          <span className="text-[10px] text-text-muted font-bold uppercase tracking-widest">REAL-TIME DATA</span>
          <button className="text-[10px] font-black text-primary hover:text-white uppercase tracking-widest transition-colors flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">open_in_new</span>
            FULL INVENTORY AUDIT
          </button>
        </div>
      </div>

      {/* ── Status Summary Grid ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {[
          { label: 'Pending Confirmation', count: filtered.filter(o => o.confirmationStatus === 'Pending').length, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', icon: 'pending' },
          { label: 'Confirmed', count: metrics.confirmLeads, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: 'check_circle' },
          { label: 'Rejected / Cancelled', count: metrics.rejectLeads, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', icon: 'cancel' },
          { label: 'In Transit', count: filtered.filter(o => o.orderStatus === 'InTransit').length, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', icon: 'local_shipping' },
          { label: 'Out for Delivery', count: metrics.outForDelivery, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', icon: 'directions_bike' },
          { label: 'Delivered', count: metrics.delivered, color: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/20', icon: 'verified' },
          { label: 'Undelivered', count: metrics.undelivered, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: 'assignment_return' },
          { label: 'Exception / Expired', count: metrics.failed, color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20', icon: 'error' },
          { label: 'COD Paid', count: filtered.filter(o => o.paymentStatus === 'Paid').length, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20', icon: 'payments' },
          { label: 'Awaiting Payment', count: filtered.filter(o => o.paymentStatus !== 'Paid').length, color: 'text-text-muted', bg: 'bg-[#1c2d3d]', border: 'border-border-dark', icon: 'hourglass_empty' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} border ${s.border} rounded-xl p-4 flex flex-col gap-2`}>
            <div className="flex items-center justify-between">
              <span className={`material-symbols-outlined text-[18px] ${s.color}`}>{s.icon}</span>
              <span className={`text-2xl font-black ${s.color}`}>{s.count.toLocaleString()}</span>
            </div>
            <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest leading-snug">{s.label}</p>
          </div>
        ))}
      </div>

    </div>
  );
};

export default PerformancePage;
