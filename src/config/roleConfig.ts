// Role-based access configuration
// Flexible design: add new roles by adding entries here

export type UserRole = 'ADMIN' | 'MARKETING' | 'CS';

export interface RouteConfig {
  path: string;
  label: string;
  icon: string;
  group: string;
  allowedRoles: UserRole[];
  /** If true, the role has view-only access (no edit actions) */
  viewOnly?: UserRole[];
}

export const ROUTE_CONFIG: RouteConfig[] = [
  // Core
  { path: '/performance', label: 'Overview', icon: 'analytics', group: 'Core', allowedRoles: ['ADMIN', 'MARKETING', 'CS'] },
  { path: '/orders', label: 'Orders', icon: 'package_2', group: 'Core', allowedRoles: ['ADMIN', 'MARKETING', 'CS'], viewOnly: ['MARKETING'] },
  { path: '/orders/create', label: 'Create Order', icon: 'add_circle', group: 'hidden', allowedRoles: ['ADMIN', 'MARKETING', 'CS'] },
  { path: '/products', label: 'Products', icon: 'inventory', group: 'Core', allowedRoles: ['ADMIN', 'CS'] },
  { path: '/inventory', label: 'Inventory', icon: 'warehouse', group: 'Core', allowedRoles: ['ADMIN', 'CS'] },
  { path: '/customers', label: 'Customers', icon: 'group', group: 'Core', allowedRoles: ['ADMIN', 'CS'] },
  { path: '/purchases', label: 'Purchases', icon: 'shopping_bag', group: 'Core', allowedRoles: ['ADMIN', 'CS'] },

  // Logistics
  { path: '/fulfillment', label: 'Fulfillment Center', icon: 'local_shipping', group: 'Logistics', allowedRoles: ['ADMIN', 'CS'] },
  { path: '/suppliers', label: 'Suppliers', icon: 'factory', group: 'Logistics', allowedRoles: ['ADMIN', 'CS'] },
  { path: '/logistics', label: 'Logistic', icon: 'package_2', group: 'Logistics', allowedRoles: ['ADMIN', 'CS'] },

  // Operations

  { path: '/communication', label: 'Communication', icon: 'forum', group: 'Operations', allowedRoles: ['ADMIN', 'CS'] },
  { path: '/financial', label: 'Financial', icon: 'account_balance', group: 'Operations', allowedRoles: ['ADMIN', 'CS'] },

  // Marketing
  { path: '/ads', label: 'Ads Analytics', icon: 'campaign', group: 'Marketing', allowedRoles: ['ADMIN', 'MARKETING'] },
  
  // Reports
  { path: '/reports/pnl', label: 'P&L Report', icon: 'insert_chart', group: 'Marketing', allowedRoles: ['ADMIN', 'MARKETING'] },
  { path: '/reports/poc', label: 'POC Report', icon: 'science', group: 'Marketing', allowedRoles: ['ADMIN', 'MARKETING'] },
  { path: '/reports/fulfillment', label: 'Fulfillment', icon: 'local_shipping', group: 'Marketing', allowedRoles: ['ADMIN', 'MARKETING'] },
  { path: '/reports/distribution', label: 'Distribution', icon: 'public', group: 'Marketing', allowedRoles: ['ADMIN', 'MARKETING'] },

  // System
  { path: '/settings', label: 'Settings', icon: 'settings', group: 'System', allowedRoles: ['ADMIN', 'CS'] },
];

/** Check if a role can access a given path */
export function hasAccess(role: UserRole, path: string): boolean {
  const route = ROUTE_CONFIG.find((r) => r.path === path);
  if (!route) return role === 'ADMIN'; // unknown routes: admin only
  return route.allowedRoles.includes(role);
}

/** Check if a role has view-only access for a path */
export function isViewOnly(role: UserRole, path: string): boolean {
  const route = ROUTE_CONFIG.find((r) => r.path === path);
  return route?.viewOnly?.includes(role) ?? false;
}

/** Get the sidebar items for a given role (excludes 'hidden' group items) */
export function getSidebarItems(role: UserRole) {
  return ROUTE_CONFIG.filter(
    (r) => r.group !== 'hidden' && r.allowedRoles.includes(role),
  );
}

/** Get the default landing page for a role */
export function getDefaultRoute(role: UserRole): string {
  switch (role) {
    case 'ADMIN':
      return '/performance';
    case 'MARKETING':
      return '/orders';
    case 'CS':
      return '/orders';
    default:
      return '/orders';
  }
}

/** Roles that can see the Performance revenue/profit widgets */
export const REVENUE_VISIBLE_ROLES: UserRole[] = ['ADMIN', 'MARKETING'];
