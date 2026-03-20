
import React, { useState } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import DashboardLayout from './components/DashboardLayout';
import OrdersPage from './pages/OrdersPage';
import CreateOrderPage from './pages/CreateOrderPage';
import PerformancePage from './pages/PerformancePage';
import ProductsPage from './pages/ProductsPage';
import CustomersPage from './pages/CustomersPage';
import PurchasesPage from './pages/PurchasesPage';
import FulfillmentPage from './pages/FulfillmentPage';
import SupplierPage from './pages/SupplierPage';
import SettingsPage from './pages/SettingsPage';
import InventoryDashboard from './pages/InventoryDashboard';
import AdsPage from './pages/AdsPage';
import IncidentsPage from './pages/IncidentsPage';
import LogisticsPage from './pages/LogisticsPage';
import CommunicationPage from './pages/CommunicationPage';
import { authService } from './src/services/auth.service';
import { hasAccess, getDefaultRoute } from './src/config/roleConfig';
import type { UserRole } from './src/config/roleConfig';

/** Role-guarded route: redirects to default page if user lacks access */
const RoleRoute: React.FC<{ path: string; element: React.ReactElement }> = ({ path, element }) => {
  const role = authService.getRole();
  if (!hasAccess(role, path)) {
    return <Navigate to={getDefaultRoute(role)} replace />;
  }
  return element;
};

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(authService.isAuthenticated());

  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  const role: UserRole = authService.getRole();
  const defaultRoute = getDefaultRoute(role);

  return (
    <Router>
      <Routes>
        <Route
          path="/login"
          element={!isAuthenticated ? <LoginPage onLogin={handleLogin} /> : <Navigate to={defaultRoute} />}
        />

        <Route element={isAuthenticated ? <DashboardLayout /> : <Navigate to="/login" />}>
          <Route path="/performance" element={<RoleRoute path="/performance" element={<PerformancePage />} />} />
          <Route path="/orders" element={<RoleRoute path="/orders" element={<OrdersPage />} />} />
          <Route path="/orders/create" element={<RoleRoute path="/orders/create" element={<CreateOrderPage />} />} />
          <Route path="/products" element={<RoleRoute path="/products" element={<ProductsPage />} />} />
          <Route path="/inventory" element={<RoleRoute path="/inventory" element={<InventoryDashboard />} />} />
          <Route path="/customers" element={<RoleRoute path="/customers" element={<CustomersPage />} />} />
          <Route path="/purchases" element={<RoleRoute path="/purchases" element={<PurchasesPage />} />} />
          <Route path="/fulfillment" element={<RoleRoute path="/fulfillment" element={<FulfillmentPage />} />} />
          <Route path="/suppliers" element={<RoleRoute path="/suppliers" element={<SupplierPage />} />} />
          <Route path="/logistics" element={<RoleRoute path="/logistics" element={<LogisticsPage />} />} />
          <Route path="/settings" element={<RoleRoute path="/settings" element={<SettingsPage />} />} />
          <Route path="/ads" element={<RoleRoute path="/ads" element={<AdsPage />} />} />
          <Route path="/incidents" element={<RoleRoute path="/incidents" element={<IncidentsPage />} />} />
          <Route path="/communication" element={<RoleRoute path="/communication" element={<CommunicationPage />} />} />
          <Route path="*" element={<Navigate to={defaultRoute} />} />
        </Route>

        <Route path="/" element={<Navigate to="/login" />} />
      </Routes>
    </Router>
  );
};

export default App;
