
import React, { useState, useRef, useEffect } from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import { authService } from '../src/services/auth.service';
import { getSidebarItems } from '../src/config/roleConfig';

// ─── Collapsible Sidebar Group ─────────────────────────────
const SidebarGroup: React.FC<{
  icon: string;
  label: string;
  children: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  hasActiveChild: boolean;
}> = ({ icon, label, children, isExpanded, onToggle, hasActiveChild }) => (
  <div className="select-none">
    <button
      onClick={onToggle}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all group ${
        hasActiveChild && !isExpanded
          ? 'bg-primary/8 text-primary'
          : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
      }`}
    >
      <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>{icon}</span>
      <span className="text-sm font-semibold flex-1 text-left truncate leading-tight">{label}</span>
      <span
        className={`material-symbols-outlined text-outline transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
        style={{ fontSize: '18px' }}
      >
        expand_more
      </span>
    </button>
    <div
      className={`overflow-hidden transition-all duration-250 ease-in-out ${
        isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
      }`}
    >
      <div className="ml-3 pl-3.5 border-l border-outline-variant/50 mt-1 mb-1 space-y-0.5">
        {children}
      </div>
    </div>
  </div>
);

// ─── Child Navigation Item ─────────────────────────────────
const SidebarChildItem: React.FC<{
  to: string;
  icon: string;
  label: string;
  active: boolean;
}> = ({ to, icon, label, active }) => (
  <Link
    to={to}
    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all text-[13px] ${
      active
        ? 'bg-primary-btn text-white shadow-sm shadow-primary/15 font-bold'
        : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface font-medium'
    }`}
  >
    <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>{icon}</span>
    <span>{label}</span>
  </Link>
);

// ─── Flat Navigation Item (no children) ────────────────────
const SidebarItem: React.FC<{
  to: string;
  icon: string;
  label: string;
  active: boolean;
}> = ({ to, icon, label, active }) => (
  <Link
    to={to}
    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${active
      ? 'bg-primary-btn text-white shadow-md shadow-primary/20'
      : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
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
  ADMIN: 'bg-purple-100 text-purple-700 border-purple-200',
  MARKETING: 'bg-blue-100 text-blue-700 border-blue-200',
  CS: 'bg-emerald-100 text-emerald-700 border-emerald-200',
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
  '/reports/pnl': 'P&L Statement',
  '/reports/poc': 'POC Analytics',
  '/reports/fulfillment': 'Fulfillment Report',
  '/reports/distribution': 'Distribution Report',
  '/logistics': 'Logistic Companies',
  '/communication': 'Communication Hub',
  '/financial': 'Financial Management',
};

// ─── Sidebar Hierarchy Config ──────────────────────────────
// Defines which groups are collapsible parent menus with child items
// This is separate from roleConfig so the sidebar structure can evolve independently
interface SidebarSection {
  type: 'group-label' | 'parent' | 'flat';
  label: string;
  icon?: string;
  /** For 'flat' items: direct path */
  path?: string;
  /** For 'parent' items: children paths to pull from role config */
  childPaths?: string[];
  /** For 'group-label': visual header only */
}

const SIDEBAR_STRUCTURE: SidebarSection[] = [
  // ── Top Level ──
  { type: 'flat', label: 'Overview', icon: 'analytics', path: '/performance' },

  // ── Commerce ──
  { type: 'group-label', label: 'Commerce' },
  {
    type: 'parent', label: 'Orders', icon: 'package_2',
    childPaths: ['/orders'],
  },
  {
    type: 'parent', label: 'Products & Inventory', icon: 'inventory',
    childPaths: ['/products', '/inventory'],
  },
  { type: 'flat', label: 'Customers', icon: 'group', path: '/customers' },
  { type: 'flat', label: 'Purchases', icon: 'shopping_bag', path: '/purchases' },

  // ── Logistics ──
  { type: 'group-label', label: 'Logistics' },
  {
    type: 'parent', label: 'Supply Chain', icon: 'local_shipping',
    childPaths: ['/fulfillment', '/suppliers', '/logistics'],
  },

  // ── Operations ──
  { type: 'group-label', label: 'Operations' },
  { type: 'flat', label: 'Communication', icon: 'forum', path: '/communication' },
  { type: 'flat', label: 'Financial', icon: 'account_balance', path: '/financial' },

  { type: 'group-label', label: 'Reports & Marketing' },
  {
    type: 'parent', label: 'Reports', icon: 'assessment',
    childPaths: ['/reports/pnl', '/reports/poc', '/reports/fulfillment', '/reports/distribution'],
  },
  { type: 'flat', label: 'Ads Analytics', icon: 'campaign', path: '/ads' },

  // ── System ──
  { type: 'group-label', label: 'System' },
  { type: 'flat', label: 'Settings', icon: 'settings', path: '/settings' },
];

const DashboardLayout: React.FC = () => {
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAvatarDropdownOpen, setIsAvatarDropdownOpen] = useState(false);
  const avatarDropdownRef = useRef<HTMLDivElement>(null);

  // Track which parent groups are expanded (by label key)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

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
  const allowedPaths = new Set(sidebarItems.map((i) => i.path));

  // Auto-expand the group that contains the active path on mount
  useEffect(() => {
    SIDEBAR_STRUCTURE.forEach((section) => {
      if (section.type === 'parent' && section.childPaths) {
        if (section.childPaths.some((p) => location.pathname === p || location.pathname.startsWith(p + '/'))) {
          setExpandedGroups((prev) => ({ ...prev, [section.label]: true }));
        }
      }
    });
  }, [location.pathname]);

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  // Close sidebar on route change for mobile
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  // Helper: get item config from role config by path
  const getItemByPath = (path: string) => sidebarItems.find((i) => i.path === path);

  return (
    <div className="flex h-screen overflow-hidden bg-surface-low text-on-surface relative">
      {/* Mobile Backdrop */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 flex flex-col border-r border-outline-variant bg-surface-lowest shrink-0 transform transition-transform duration-300 ease-in-out md:static md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 flex flex-col gap-4 h-full overflow-y-auto custom-scrollbar">
          <div className="flex items-center gap-3 px-1 mb-2">
            <img src="/logo.svg" alt="JOT COD" className="h-10 w-auto" />
          </div>

          <nav className="flex flex-col gap-0.5 flex-1">
            {SIDEBAR_STRUCTURE.map((section, idx) => {
              // ── Group Label ──
              if (section.type === 'group-label') {
                return (
                  <p key={`label-${idx}`} className="text-[10px] text-outline font-bold uppercase tracking-widest px-3 mt-5 first:mt-0 mb-1.5">
                    {section.label}
                  </p>
                );
              }

              // ── Flat Item (no children) ──
              if (section.type === 'flat' && section.path) {
                if (!allowedPaths.has(section.path)) return null;
                return (
                  <SidebarItem
                    key={section.path}
                    to={section.path}
                    icon={section.icon || 'circle'}
                    label={section.label}
                    active={location.pathname === section.path}
                  />
                );
              }

              // ── Collapsible Parent ──
              if (section.type === 'parent' && section.childPaths) {
                const visibleChildren = section.childPaths
                  .map((p) => getItemByPath(p))
                  .filter(Boolean) as ReturnType<typeof getItemByPath>[];

                if (visibleChildren.length === 0) return null;

                // If only 1 child, render as flat item instead of collapsible
                if (visibleChildren.length === 1) {
                  const only = visibleChildren[0]!;
                  return (
                    <SidebarItem
                      key={only.path}
                      to={only.path}
                      icon={section.icon || only.icon}
                      label={section.label}
                      active={location.pathname === only.path}
                    />
                  );
                }

                const hasActiveChild = section.childPaths.some(
                  (p) => location.pathname === p || location.pathname.startsWith(p + '/')
                );

                return (
                  <SidebarGroup
                    key={`parent-${section.label}`}
                    icon={section.icon || 'folder'}
                    label={section.label}
                    isExpanded={!!expandedGroups[section.label]}
                    onToggle={() => toggleGroup(section.label)}
                    hasActiveChild={hasActiveChild}
                  >
                    {visibleChildren.map((child) => (
                      <SidebarChildItem
                        key={child!.path}
                        to={child!.path}
                        icon={child!.icon}
                        label={child!.label}
                        active={location.pathname === child!.path}
                      />
                    ))}
                  </SidebarGroup>
                );
              }

              return null;
            })}
          </nav>

        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-0">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-outline-variant bg-surface-lowest px-4 sm:px-8 py-3 shrink-0 shadow-sm">
          <div className="flex items-center gap-4 sm:gap-8">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors"
            >
              <span className="material-symbols-outlined text-[24px]">menu</span>
            </button>
            <h2 className="text-on-surface text-base sm:text-lg font-bold tracking-tight truncate max-w-[150px] sm:max-w-none">
              {PAGE_TITLES[location.pathname] || ''}
            </h2>
            <div className="hidden lg:flex h-10 items-stretch rounded-lg bg-surface-container border border-outline-variant min-w-[320px] focus-within:ring-2 focus-within:ring-primary/30 transition-all">
              <div className="text-outline flex items-center justify-center pl-4">
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>search</span>
              </div>
              <input
                className="w-full border-none bg-transparent text-on-surface focus:ring-0 placeholder:text-outline pl-2 text-sm"
                placeholder="Search resources..."
              />
              <div className="flex items-center pr-3">
                <span className="text-[10px] font-bold bg-surface-high text-outline px-1.5 py-0.5 rounded border border-outline-variant">⌘K</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              <button className="flex size-10 items-center justify-center rounded-lg bg-surface-container text-on-surface-variant hover:bg-surface-high hover:text-primary transition-all relative">
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>notifications</span>
                <span className="absolute top-2.5 right-2.5 size-2 bg-primary-btn rounded-full border-2 border-surface-lowest"></span>
              </button>
            </div>
            <div className="h-8 w-px bg-outline-variant mx-2"></div>
            <div className="relative" ref={avatarDropdownRef}>
              <button
                onClick={() => setIsAvatarDropdownOpen(!isAvatarDropdownOpen)}
                className="flex items-center gap-3 pl-2 cursor-pointer hover:opacity-80 transition-opacity"
              >
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-bold text-on-surface leading-none">{user?.fullName || 'User'}</p>
                  <span className={`inline-block text-[9px] font-bold uppercase mt-1 tracking-wider px-1.5 py-0.5 rounded border ${ROLE_COLORS[role] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                    {ROLE_LABELS[role] || role}
                  </span>
                </div>
                <div
                  className="bg-center bg-no-repeat aspect-square bg-cover rounded-xl size-10 border-2 border-outline-variant shadow-md"
                  style={{ backgroundImage: `url('https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.fullName || 'User'}')` }}
                ></div>
              </button>

              {/* Avatar Dropdown */}
              {isAvatarDropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 rounded-xl bg-surface-lowest border border-outline-variant elevation-3 z-[100] overflow-hidden">
                  <div className="p-4 border-b border-outline-variant">
                    <p className="text-sm font-bold text-on-surface truncate">{user?.fullName || 'User'}</p>
                    <p className="text-xs text-on-surface-variant truncate mt-0.5">{user?.email || ''}</p>
                    <span className={`inline-block text-[9px] font-bold uppercase mt-2 tracking-wider px-1.5 py-0.5 rounded border ${ROLE_COLORS[role] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                      {ROLE_LABELS[role] || role}
                    </span>
                  </div>
                  <div className="p-1.5">
                    <button
                      onClick={() => authService.logout()}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-error hover:bg-error-container/30 transition-colors text-sm font-medium cursor-pointer"
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
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 bg-surface-low">
          <div className="max-w-[1600px] mx-auto">
            <Outlet />
          </div>
        </div>
      </main>

    </div>
  );
};

export default DashboardLayout;
