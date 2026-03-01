
import React, { useState } from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';

const SidebarItem: React.FC<{
  to: string;
  icon: string;
  label: string;
  active: boolean
}> = ({ to, icon, label, active }) => (
  <Link
    to={to}
    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${active
      ? 'bg-primary text-white shadow-lg shadow-primary/20'
      : 'text-[#92adc9] hover:bg-[#233648] hover:text-white'
      }`}
  >
    <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>{icon}</span>
    <p className="text-sm font-semibold">{label}</p>
  </Link>
);

const DashboardLayout: React.FC = () => {
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Close sidebar on route change for mobile
  React.useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex h-screen overflow-hidden bg-background-dark text-white relative">
      {/* Mobile Backdrop */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 flex flex-col border-r border-border-dark bg-card-dark shrink-0 transform transition-transform duration-300 ease-in-out md:static md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 flex flex-col gap-8 h-full overflow-y-auto custom-scrollbar">
          <div className="flex items-center gap-3 px-1">
            <img src="/logo.svg" alt="JOT COD" className="h-10 w-auto" />
          </div>

          <nav className="flex flex-col gap-1 flex-1">
            <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest px-3 mb-2 opacity-50">Core</p>
            <SidebarItem to="/performance" icon="analytics" label="Overview" active={location.pathname === '/performance'} />
            <SidebarItem to="/orders" icon="package_2" label="Orders" active={location.pathname === '/orders'} />
            <SidebarItem to="/products" icon="inventory" label="Products" active={location.pathname === '/products'} />
            <SidebarItem to="/inventory" icon="warehouse" label="Inventory" active={location.pathname === '/inventory'} />
            <SidebarItem to="/customers" icon="group" label="Customers" active={location.pathname === '/customers'} />
            <SidebarItem to="/purchases" icon="shopping_bag" label="Purchases" active={location.pathname === '/purchases'} />

            <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest px-3 mt-6 mb-2 opacity-50">Logistics</p>
            <SidebarItem to="/fulfillment" icon="local_shipping" label="Fulfillment Center" active={location.pathname === '/fulfillment'} />
            <SidebarItem to="/suppliers" icon="factory" label="Suppliers" active={location.pathname === '/suppliers'} />

            <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest px-3 mt-6 mb-2 opacity-50">System</p>
            <SidebarItem to="/settings" icon="settings" label="Settings" active={location.pathname === '/settings'} />
          </nav>

        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-0">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-border-dark bg-card-dark px-4 sm:px-8 py-3 shrink-0">
          <div className="flex items-center gap-4 sm:gap-8">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden flex items-center justify-center text-text-muted hover:text-white transition-colors"
            >
              <span className="material-symbols-outlined text-[24px]">menu</span>
            </button>
            <h2 className="text-white text-base sm:text-lg font-bold tracking-tight truncate max-w-[150px] sm:max-w-none">
              {location.pathname === '/performance' && 'Executive Performance'}
              {location.pathname === '/orders' && 'Orders Console'}
              {location.pathname === '/products' && 'Product Management'}
              {location.pathname === '/inventory' && 'Inventory Overview'}
              {location.pathname === '/customers' && 'Customer Intelligence'}
              {location.pathname === '/purchases' && 'Procurement Console'}
              {location.pathname === '/fulfillment' && 'Logistics & Fulfillment'}
              {location.pathname === '/suppliers' && 'Supply Chain Manager'}
              {location.pathname === '/settings' && 'Platform Settings'}
            </h2>
            <div className="hidden lg:flex h-10 items-stretch rounded-lg bg-border-dark min-w-[320px] focus-within:ring-2 focus-within:ring-primary/40 transition-all">
              <div className="text-text-muted flex items-center justify-center pl-4">
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>search</span>
              </div>
              <input
                className="w-full border-none bg-transparent text-white focus:ring-0 placeholder:text-text-muted pl-2 text-sm"
                placeholder="Search resources..."
              />
              <div className="flex items-center pr-3">
                <span className="text-[10px] font-bold bg-[#1c2d3d] text-text-muted px-1.5 py-0.5 rounded border border-[#2d445a]">⌘K</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              <button className="flex size-10 items-center justify-center rounded-lg bg-border-dark text-white hover:bg-[#2d445a] transition-all relative">
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>notifications</span>
                <span className="absolute top-2.5 right-2.5 size-2 bg-primary rounded-full border-2 border-card-dark"></span>
              </button>
              <button className="flex size-10 items-center justify-center rounded-lg bg-border-dark text-white hover:bg-[#2d445a] transition-all relative">
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>notifications</span>
                <span className="absolute top-2.5 right-2.5 size-2 bg-primary rounded-full border-2 border-card-dark"></span>
              </button>
            </div>
            <div className="h-8 w-px bg-border-dark mx-2"></div>
            <div className="flex items-center gap-3 pl-2">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold text-white leading-none">Alex Rivera</p>
                <p className="text-[10px] text-text-muted font-bold uppercase mt-1 tracking-wider opacity-60">Admin Manager</p>
              </div>
              <div
                className="bg-center bg-no-repeat aspect-square bg-cover rounded-xl size-10 border-2 border-border-dark shadow-lg ring-1 ring-white/5"
                style={{ backgroundImage: `url('https://api.dicebear.com/7.x/avataaars/svg?seed=Alex')` }}
              ></div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 bg-pattern">
          <div className="max-w-[1600px] mx-auto">
            <Outlet />
          </div>
        </div>
      </main>

    </div>
  );
};

export default DashboardLayout;
