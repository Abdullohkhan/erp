import { Suspense, lazy, type ComponentType, type ReactNode } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import PageLoader from '@/shared/components/PageLoader/PageLoader'
import AppLayout from '@/shared/components/Layout/AppLayout'
import ProtectedRoute from '@/features/auth/ProtectedRoute'
import LoginPage from '@/features/auth/LoginPage'
import RouteError from '@/shared/components/RouteError/RouteError'
import { ROUTE_PERMS } from './permissions'

// Pages are split into separate chunks and loaded on first visit.
const page = (loader: () => Promise<{ default: ComponentType }>) => lazy(loader)
const Dashboard = page(() => import('@/features/dashboard/DashboardPage'))
const Products = page(() => import('@/features/catalogs/products/ProductsPage'))
const Customers = page(() => import('@/features/catalogs/customers/CustomersPage'))
const CustomerDetail = page(() => import('@/features/catalogs/customers/CustomerDetailPage'))
const Suppliers = page(() => import('@/features/catalogs/suppliers/SuppliersPage'))
const Employees = page(() => import('@/features/catalogs/employees/EmployeesPage'))
const Warehouses = page(() => import('@/features/catalogs/warehouses/WarehousesPage'))
const SaleOrders = page(() => import('@/features/sales/orders/SaleOrdersPage'))
const NewOrder = page(() => import('@/features/sales/neworder/NewOrderPage'))
const Invoices = page(() => import('@/features/sales/invoices/InvoicesPage'))
const PurchaseOrders = page(() => import('@/features/purchases/orders/PurchaseOrdersPage'))
const Receipt = page(() => import('@/features/purchases/receipts/ReceiptPage'))
const WarehouseBalance = page(() => import('@/features/warehouse/balance/WarehouseBalancePage'))
const Movements = page(() => import('@/features/warehouse/movements/MovementsPage'))
const Payments = page(() => import('@/features/finance/payments/PaymentsPage'))
const SalesReport = page(() => import('@/features/reports/sales/SalesReportPage'))
const StockReport = page(() => import('@/features/reports/stock/StockReportPage'))
const Requests = page(() => import('@/features/requests/RequestsPage'))
const RequestDetail = page(() => import('@/features/requests/RequestDetailPage'))
const Contracts = page(() => import('@/features/documents/ContractsPage'))
const Acts = page(() => import('@/features/documents/ActsPage'))
const Deliveries = page(() => import('@/features/deliveries/DeliveriesPage'))
const Notifications = page(() => import('@/features/notifications/NotificationsPage'))
const Users = page(() => import('@/features/admin/UsersPage'))
const Roles = page(() => import('@/features/admin/RolesPage'))
const Templates = page(() => import('@/features/admin/TemplatesPage'))
const Settings = page(() => import('@/features/admin/SettingsPage'))
const Audit = page(() => import('@/features/admin/AuditPage'))

const guard = (path: string, Page: ComponentType): { path?: string; index?: boolean; element: ReactNode } => ({
  ...(path === '/' ? { index: true } : { path: path.slice(1) }),
  element: (
    <ProtectedRoute perms={ROUTE_PERMS[path]}>
      <Suspense fallback={<PageLoader />}><Page /></Suspense>
    </ProtectedRoute>
  ),
})

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage />, errorElement: <RouteError /> },
  {
    path: '/',
    element: <ProtectedRoute><AppLayout /></ProtectedRoute>,
    errorElement: <RouteError />,
    children: [
      guard('/', Dashboard),
      guard('/requests', Requests),
      guard('/requests/:id', RequestDetail),
      guard('/documents/contracts', Contracts),
      guard('/documents/acts', Acts),
      guard('/deliveries', Deliveries),
      guard('/notifications', Notifications),
      guard('/admin/users', Users),
      guard('/admin/roles', Roles),
      guard('/admin/templates', Templates),
      guard('/admin/settings', Settings),
      guard('/admin/audit', Audit),
      guard('/catalogs/products', Products),
      guard('/catalogs/customers', Customers),
      guard('/catalogs/customers/:id', CustomerDetail),
      guard('/catalogs/suppliers', Suppliers),
      guard('/catalogs/employees', Employees),
      guard('/catalogs/warehouses', Warehouses),
      guard('/sales/orders', SaleOrders),
      guard('/sales/orders/new', NewOrder),
      guard('/sales/invoices', Invoices),
      guard('/purchases/orders', PurchaseOrders),
      guard('/purchases/receipts/new', Receipt),
      guard('/warehouse/balance', WarehouseBalance),
      guard('/warehouse/movements', Movements),
      guard('/finance/payments', Payments),
      guard('/reports/sales', SalesReport),
      guard('/reports/stock', StockReport),
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
