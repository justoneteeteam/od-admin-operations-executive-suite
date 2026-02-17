
import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface DashboardData {
  metrics: {
    label: string;
    value: string;
    trend: string;
    icon: string;
    color: string;
    border: string;
  }[];
  countryData: {
    name: string;
    value: number;
    color: string;
  }[];
  productPerformance: {
    name: string;
    sku: string;
    revenue: number;
    profit: number;
    returns: string;
  }[];
}

const PerformancePage: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('30 DAY');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showCustomRange, setShowCustomRange] = useState(false);

  const aiInsight = "Based on current velocity, you are projected to hit $1.8M total revenue by end of Q4, exceeding target by 12%.";

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');

        let url = `http://localhost:3000/analytics/dashboard?period=${filter}`;
        if (filter === 'CUSTOM' && customStart && customEnd) {
          url += `&startDate=${customStart}&endDate=${customEnd}`;
        }

        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          const result = await response.json();
          // Add colors to country data if missing
          const colors = ['#137fec', '#10b981', '#f59e0b', '#6366f1', '#ec4899'];
          if (result.countryData) {
            result.countryData = result.countryData.map((c: any, i: number) => ({
              ...c,
              color: colors[i % colors.length]
            }));
          }
          setData(result);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [filter, customStart, customEnd]);

  if (loading) {
    return <div className="p-8 text-white">Loading dashboard analytics...</div>;
  }

  const metrics = data?.metrics || [];
  const countryData = data?.countryData || [];
  const productPerformance = data?.productPerformance || [];

  return (
    <div className="flex flex-col gap-8 pb-12">
      <div className="flex flex-wrap justify-between items-end gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-text-muted text-xs font-bold uppercase tracking-wider opacity-60">Home</span>
            <span className="text-text-muted text-xs opacity-30">/</span>
            <span className="text-white text-xs font-bold uppercase tracking-wider">Metrics</span>
          </div>
          <h1 className="text-white text-3xl font-black tracking-tight">Executive Dashboard</h1>
          <p className="text-text-muted text-sm max-w-lg leading-relaxed">Global business health overview. Analyzing real-time COD performance across GCC markets.</p>
        </div>

        <div className="flex gap-3 relative">
          <div
            onClick={() => setShowFilterMenu(!showFilterMenu)}
            className="flex h-10 items-center justify-center gap-2 rounded-lg bg-card-dark px-4 border border-border-dark group cursor-pointer hover:border-primary/50 transition-all shadow-sm select-none"
          >
            <span className="material-symbols-outlined text-text-muted group-hover:text-primary" style={{ fontSize: '18px' }}>calendar_today</span>
            <span className="text-white text-sm font-semibold">
              {filter === 'TODAY' ? 'Today' : filter === '7 DAY' ? 'Last 7 Days' : filter === '30 DAY' ? 'Last 30 Days' : filter === 'ALL TIME' ? 'All Time' : 'Custom Range'}
            </span>
            <span className="material-symbols-outlined text-text-muted" style={{ fontSize: '18px' }}>expand_more</span>
          </div>

          {showFilterMenu && (
            <div className="absolute top-12 left-0 bg-[#0f172a] border border-border-dark z-50 p-1 rounded-xl shadow-2xl w-48 overflow-hidden backdrop-blur-md">
              {['TODAY', '7 DAY', '30 DAY', 'ALL TIME', 'CUSTOM'].map(f => (
                <button
                  key={f}
                  className={`block w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors ${filter === f ? 'bg-primary/20 text-primary' : 'text-text-muted hover:bg-white/5 hover:text-white'}`}
                  onClick={() => {
                    setFilter(f);
                    setShowFilterMenu(false);
                    if (f === 'CUSTOM') setShowCustomRange(true);
                    else setShowCustomRange(false);
                  }}
                >
                  {f === 'TODAY' ? 'Today' : f === '7 DAY' ? 'Last 7 Days' : f === '30 DAY' ? 'Last 30 Days' : f === 'ALL TIME' ? 'All Time' : 'Custom Range'}
                </button>
              ))}
            </div>
          )}

          {filter === 'CUSTOM' && (
            <div className="flex items-center gap-2">
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="bg-card-dark border border-border-dark rounded-lg px-2 py-1 text-white text-xs h-10 focus:border-primary outline-none" />
              <span className="text-text-muted">-</span>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="bg-card-dark border border-border-dark rounded-lg px-2 py-1 text-white text-xs h-10 focus:border-primary outline-none" />
            </div>
          )}

          <button className="flex items-center justify-center rounded-lg h-10 px-6 bg-primary text-white text-sm font-bold hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all">
            <span className="material-symbols-outlined mr-2" style={{ fontSize: '18px' }}>download</span>
            Export
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {metrics.map((metric, i) => (
          <div key={i} className={`bg-card-dark p-6 rounded-2xl border border-border-dark flex flex-col gap-2 border-l-4 ${metric.border} shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group`}>
            <div className="absolute -right-2 -bottom-2 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity">
              <span className="material-symbols-outlined text-[120px]">{metric.icon}</span>
            </div>
            <div className="flex justify-between items-start relative z-10">
              <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em]">{metric.label}</p>
              <div className={`size-8 rounded-lg flex items-center justify-center bg-${metric.color}/10 text-${metric.color}`}>
                <span className="material-symbols-outlined text-[18px]">{metric.icon}</span>
              </div>
            </div>
            <div className="flex items-baseline gap-3 mt-4 relative z-10">
              <h3 className="text-3xl font-black tracking-tight">{metric.value}</h3>
              <span className={`text-${metric.color === 'red-500' ? 'red-400' : 'emerald-400'} text-xs font-bold flex items-center bg-${metric.color === 'red-500' ? 'red-500' : 'emerald-500'}/10 px-2 py-0.5 rounded-full`}>
                {metric.trend}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-card-dark rounded-2xl border border-border-dark p-6 flex flex-col min-h-[480px] shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xs font-black uppercase tracking-widest text-text-muted">Market Share</h3>
            <button className="material-symbols-outlined text-text-muted hover:text-white transition-colors" style={{ fontSize: '20px' }}>more_horiz</button>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center relative">
            <div className="size-64 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={countryData}
                    innerRadius={75}
                    outerRadius={105}
                    paddingAngle={8}
                    dataKey="value"
                    stroke="none"
                  >
                    {countryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#111a22', border: '1px solid #233648', borderRadius: '12px' }}
                    itemStyle={{ color: '#fff', fontSize: '12px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-3xl font-black tracking-tighter">
                  ${(countryData.reduce((acc, curr) => acc + curr.value, 0) / 1000).toFixed(1)}k
                </span>
                <span className="text-[9px] text-text-muted font-bold uppercase tracking-widest">Revenue</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-y-4 gap-x-8 w-full mt-8 px-4">
              {countryData.map((country, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="size-2.5 rounded-full ring-4 ring-white/5 shadow-sm" style={{ backgroundColor: country.color }}></div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider">{country.name}</span>
                    <span className="text-sm font-bold">${(country.value / 1000).toFixed(0)}k</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 bg-card-dark rounded-2xl border border-border-dark flex flex-col shadow-sm overflow-hidden">
          <div className="px-8 py-5 border-b border-border-dark flex items-center justify-between bg-[#14202c]">
            <h3 className="text-xs font-black uppercase tracking-widest text-text-muted">Top Moving SKUs</h3>
            <div className="flex gap-1.5 p-1 bg-background-dark rounded-lg border border-border-dark">
              <button className="px-4 py-1.5 text-[10px] font-bold bg-primary text-white rounded-md shadow-sm">Revenue</button>
              <button className="px-4 py-1.5 text-[10px] font-bold text-text-muted hover:text-white transition-colors">Profit</button>
            </div>
          </div>
          <div className="overflow-x-auto custom-scrollbar flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#17232f]/50">
                  <th className="px-8 py-4 text-text-muted font-black text-[10px] uppercase tracking-[0.15em]">Product Details</th>
                  <th className="px-8 py-4 text-text-muted font-black text-[10px] uppercase tracking-[0.15em] text-right">Revenue</th>
                  <th className="px-8 py-4 text-text-muted font-black text-[10px] uppercase tracking-[0.15em] text-right">Profit</th>
                  <th className="px-8 py-4 text-text-muted font-black text-[10px] uppercase tracking-[0.15em]">Efficiency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dark/50">
                {productPerformance.map((p, i) => (
                  <tr key={i} className="hover:bg-primary/[0.02] transition-colors">
                    <td className="px-8 py-5">
                      <p className="text-sm font-bold text-white leading-none">{p.name}</p>
                      <p className="text-[10px] text-text-muted font-medium mt-1.5 opacity-60">Fulfillment: Global</p>
                    </td>
                    <td className="px-8 py-5 text-sm font-black text-right">${p.revenue.toLocaleString()}</td>
                    <td className="px-8 py-5 text-sm font-black text-emerald-400 text-right">${p.profit.toLocaleString()}</td>
                    <td className="px-8 py-5">
                      <div className="flex flex-col gap-2 min-w-[100px]">
                        <div className="flex justify-between items-center text-[10px] font-bold">
                          <span className="text-text-muted uppercase tracking-tighter">Returns</span>
                          <span className={parseInt(p.returns) > 6 ? 'text-red-400' : 'text-emerald-400'}>{p.returns}</span>
                        </div>
                        <div className="w-full h-1.5 bg-border-dark rounded-full overflow-hidden shadow-inner">
                          <div className={`h-full ${parseInt(p.returns) > 6 ? 'bg-red-500' : 'bg-emerald-500'} transition-all duration-1000`} style={{ width: p.returns }}></div>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-8 py-4 border-t border-border-dark bg-[#17232f]/80 flex justify-between items-center">
            <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest opacity-60">Real-time Data</p>
            <button className="text-[10px] text-primary font-black uppercase tracking-widest hover:underline underline-offset-4">Full Inventory Audit</button>
          </div>
        </div>
      </div>

      <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 flex flex-col md:flex-row items-center gap-6 shadow-sm group hover:border-primary/40 transition-all relative overflow-hidden">
        <div className="size-14 bg-primary/10 rounded-2xl flex items-center justify-center text-primary border border-primary/20 shadow-inner group-hover:scale-110 transition-transform">
          <span className="material-symbols-outlined text-3xl">auto_graph</span>
        </div>
        <div className="flex-1 text-center md:text-left relative z-10">
          <div className="flex items-center gap-2 justify-center md:justify-start mb-1">
            <h4 className="text-xs font-black text-primary uppercase tracking-[0.2em]">Operations Forecast</h4>
          </div>
          <p className="text-text-muted text-sm leading-relaxed">
            {aiInsight}
          </p>
        </div>
      </div>
    </div>
  );
};

export default PerformancePage;
