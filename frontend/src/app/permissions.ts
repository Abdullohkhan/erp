import type { AuthUser } from '@/features/auth/authSlice'

/** Permission keys — mirror of backend/src/auth/permissions.ts. The server is the source of truth. */
export type Permission =
  'users.view' | 'users.manage' | 'roles.view' | 'roles.manage' | 'settings.manage' | 'audit.view' | 'costs.view' | 'reports.view' | 'products.view' | 'products.manage' | 'customers.view' | 'customers.manage' | 'suppliers.view' | 'suppliers.manage' | 'employees.view' | 'employees.manage' | 'warehouses.view' | 'warehouses.manage' | 'stock.view' | 'stock.move' | 'stock.receive' | 'sales.view' | 'sales.create' | 'sales.confirm' | 'sales.cancel' | 'purchases.view' | 'purchases.create' | 'purchases.confirm' | 'purchases.cancel' | 'invoices.view' | 'invoices.create' | 'payments.view' | 'payments.create' | 'requests.view' | 'requests.create' | 'requests.configure' | 'requests.price' | 'requests.review' | 'requests.sell' | 'requests.contract' | 'requests.advance' | 'requests.procure' | 'requests.approve_procurement' | 'requests.receive' | 'requests.assemble' | 'requests.act' | 'requests.deliver' | 'requests.cancel' | 'templates.manage' | 'deliveries.view' | 'deliveries.drive'

/** Which permission (any of) opens which page. */
export const ROUTE_PERMS: Record<string, Permission[]> = {
  '/': [],
  '/requests': ['requests.view'],
  '/requests/:id': ['requests.view'],
  '/documents/contracts': ['requests.contract', 'requests.advance', 'payments.view'],
  '/documents/acts': ['requests.act', 'requests.contract', 'payments.view'],
  '/deliveries': ['deliveries.view', 'deliveries.drive', 'requests.deliver'],
  '/catalogs/products': ['products.view', 'products.manage'],
  '/catalogs/customers': ['customers.view', 'customers.manage'],
  '/catalogs/customers/:id': ['customers.view', 'customers.manage'],
  '/catalogs/suppliers': ['suppliers.view', 'suppliers.manage'],
  '/catalogs/employees': ['employees.view', 'employees.manage'],
  '/catalogs/warehouses': ['warehouses.view', 'warehouses.manage'],
  '/sales/orders': ['sales.view'],
  '/sales/orders/new': ['sales.create'],
  '/sales/invoices': ['invoices.view'],
  '/purchases/orders': ['purchases.view'],
  '/purchases/receipts/new': ['purchases.create'],
  '/warehouse/balance': ['stock.view'],
  '/warehouse/movements': ['stock.view'],
  '/finance/payments': ['payments.view'],
  '/reports/sales': ['reports.view'],
  '/reports/stock': ['reports.view'],
  '/notifications': [],
  '/admin/users': ['users.view', 'users.manage'],
  '/admin/roles': ['roles.view', 'roles.manage'],
  '/admin/templates': ['templates.manage'],
  '/admin/settings': ['settings.manage'],
  '/admin/audit': ['audit.view'],
}

export const can = (user: AuthUser | null | undefined, perm: Permission): boolean =>
  !!user && user.permissions.includes(perm)

/** Empty list = any signed-in user. */
export const canAccess = (user: AuthUser | null | undefined, path: string): boolean => {
  if (!user) return false
  const need = ROUTE_PERMS[path]
  if (!need) return false
  return need.length === 0 || need.some((p) => user.permissions.includes(p))
}
