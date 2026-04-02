
import React, { useState, useRef, useEffect } from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import { authService } from '../src/services/auth.service';
import { getSidebarItems } from '../src/config/roleConfig';

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

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  MARKETING: 'Marketing',
  CS: 'Customer Service',
};

const ROLE_COLORS: Record<string, string> = {
  ADMIN: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  MARKETING: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  CS: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
};

const PAGE_TITLES: Record<string, string> = {
  '/performance': 'Executive Performance',
  '/orders': 'Orders Console',
  '/products': 'Product Management',
  '/inventory': 'Inventory Overview',
  '/customers': 'Customer Intelligence',
  '/purchases': 'Procurement Console',
  '/fulfillment': 'Logistics & Fulfillment',
  '/suppliers': 'Supply Chain Manager',
  '/settings': 'Platform Settings',
  '/ads': 'Ads Campaign Analytics',
  '/reports': 'Reports',
  '/incidents': 'Incident Management',
  '/logistics': 'Logistic Companies',
  '/communication': 'Communication Hub',
  '/financial': 'Financial Management',
};

const DashboardLayout: React.FC = () => {
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAvatarDropdownOpen, setIsAvatarDropdownOpen] = useState(false);
  const avatarDropdownRef = useRef<HTMLDivElement>(null);

  // Close avatar dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (avatarDropdownRef.current && !avatarDropdownRef.current.contains(event.target as Node)) {
        setIsAvatarDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const user = authService.getUser();
  const role = authService.getRole();
  const sidebarItems = getSidebarItems(role);

  // Group sidebar items
  const groups = ['Core', 'Logistics', 'Operations', 'Marketing', 'System'];
  const groupedItems = groups
    .map((group) => ({
      group,
      items: sidebarItems.filter((item) => item.group === group),
    }))
    .filter((g) => g.items.length > 0);

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
            {groupedItems.map(({ group, items }) => (
              <React.Fragment key={group}>
                <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest px-3 mt-4 first:mt-0 mb-2 opacity-50">{group}</p>
                {items.map((item) => (
                  <SidebarItem
                    key={item.path}
                    to={item.path}
                    icon={item.icon}
                    label={item.label}
                    active={location.pathname === item.path}
                  />
                ))}
              </React.Fragment>
            ))}
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
              {PAGE_TITLES[location.pathname] || ''}
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
            </div>
            <div className="h-8 w-px bg-border-dark mx-2"></div>
            <div className="relative" ref={avatarDropdownRef}>
              <button
                onClick={() => setIsAvatarDropdownOpen(!isAvatarDropdownOpen)}
                className="flex items-center gap-3 pl-2 cursor-pointer hover:opacity-80 transition-opacity"
              >
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-bold text-white leading-none">{user?.fullName || 'User'}</p>
                  <span className={`inline-block text-[9px] font-bold uppercase mt-1 tracking-wider px-1.5 py-0.5 rounded border ${ROLE_COLORS[role] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                    {ROLE_LABELS[role] || role}
                  </span>
                </div>
                <div
                  className="bg-center bg-no-repeat aspect-square bg-cover rounded-xl size-10 border-2 border-border-dark shadow-lg ring-1 ring-white/5"
                  style={{ backgroundImage: `url('https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.fullName || 'User'}')` }}
                ></div>
              </button>

              {/* Avatar Dropdown */}
              {isAvatarDropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 rounded-xl bg-card-dark border border-border-dark shadow-2xl shadow-black/40 z-[100] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="p-4 border-b border-border-dark">
                    <p className="text-sm font-bold text-white truncate">{user?.fullName || 'User'}</p>
                    <p className="text-xs text-text-muted truncate mt-0.5">{user?.email || ''}</p>
                    <span className={`inline-block text-[9px] font-bold uppercase mt-2 tracking-wider px-1.5 py-0.5 rounded border ${ROLE_COLORS[role] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                      {ROLE_LABELS[role] || role}
                    </span>
                  </div>
                  <div className="p-1.5">
                    <button
                      onClick={() => authService.logout()}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors text-sm font-medium cursor-pointer"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>logout</span>
                      Log Out
                    </button>
                  </div>
                </div>
              )}
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
