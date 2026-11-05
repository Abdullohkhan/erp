/**
 * Permission catalog. Keys are stored on roles in the database; labels are Uzbek
 * (the frontend translates them). The "owner" role implicitly has every permission
 * and is the only one that may change role permissions by default.
 */
export const PERMISSIONS = {
  // System
  'users.view': { group: 'Tizim', label: "Foydalanuvchilarni ko'rish" },
  'users.manage': { group: 'Tizim', label: 'Foydalanuvchilarni boshqarish' },
  'roles.view': { group: 'Tizim', label: "Rollarni ko'rish" },
  'roles.manage': { group: 'Tizim', label: 'Rollar va ruxsatlarni boshqarish' },
  'settings.manage': { group: 'Tizim', label: 'Sozlamalar' },
  'audit.view': { group: 'Tizim', label: "Audit jurnalini ko'rish" },
  'costs.view': { group: 'Tizim', label: "Tannarx va xarajatlarni ko'rish" },
  'reports.view': { group: 'Tizim', label: "Hisobotlarni ko'rish" },

  // Catalogs
  'products.view': { group: 'Kataloglar', label: "Mahsulotlarni ko'rish" },
  'products.manage': { group: 'Kataloglar', label: 'Mahsulotlarni boshqarish' },
  'customers.view': { group: 'Kataloglar', label: "Mijozlarni ko'rish" },
  'customers.manage': { group: 'Kataloglar', label: 'Mijozlarni boshqarish' },
  'suppliers.view': { group: 'Kataloglar', label: "Yetkazuvchilarni ko'rish" },
  'suppliers.manage': { group: 'Kataloglar', label: 'Yetkazuvchilarni boshqarish' },
  'employees.view': { group: 'Kataloglar', label: "Xodimlarni ko'rish" },
  'employees.manage': { group: 'Kataloglar', label: 'Xodimlarni boshqarish' },
  'warehouses.view': { group: 'Kataloglar', label: "Omborlarni ko'rish" },
  'warehouses.manage': { group: 'Kataloglar', label: 'Omborlarni boshqarish' },

  // Stock
  'stock.view': { group: 'Ombor', label: "Qoldiqlar va harakatni ko'rish" },
  'stock.move': { group: 'Ombor', label: "Ko'chirish va hisobdan chiqarish" },
  'stock.receive': { group: 'Ombor', label: 'Omborga kirim qilish' },

  // Sales / purchases / finance
  'sales.view': { group: 'Savdo', label: "Savdo buyurtmalarini ko'rish" },
  'sales.create': { group: 'Savdo', label: 'Savdo buyurtmasi yaratish' },
  'sales.confirm': { group: 'Savdo', label: 'Savdo buyurtmasini tasdiqlash' },
  'sales.cancel': { group: 'Savdo', label: 'Savdo buyurtmasini bekor qilish' },
  'purchases.view': { group: 'Xarid', label: "Xaridlarni ko'rish" },
  'purchases.create': { group: 'Xarid', label: 'Xarid yaratish' },
  'purchases.confirm': { group: 'Xarid', label: 'Xaridni qabul qilish' },
  'purchases.cancel': { group: 'Xarid', label: 'Xaridni bekor qilish' },
  'invoices.view': { group: 'Moliya', label: "Fakturalarni ko'rish" },
  'invoices.create': { group: 'Moliya', label: 'Faktura yaratish' },
  'payments.view': { group: 'Moliya', label: "To'lovlarni ko'rish" },
  'payments.create': { group: 'Moliya', label: "To'lov kiritish" },

  // CRM workflow
  'requests.view': { group: 'Zayavkalar', label: "Zayavkalarni ko'rish" },
  'requests.create': { group: 'Zayavkalar', label: 'Zayavka yaratish (sotuvchi)' },
  'requests.configure': { group: 'Zayavkalar', label: 'Konfiguratsiya qilish (injener)' },
  'requests.price': { group: 'Zayavkalar', label: 'Narx shakllantirish (deklarant)' },
  'requests.review': { group: 'Zayavkalar', label: "Narxni ko'rib chiqish va ustama" },
  'requests.sell': { group: 'Zayavkalar', label: 'Buyurtmachi bilan kelishish' },
  'requests.contract': { group: 'Zayavkalar', label: 'Shartnoma tuzish' },
  'requests.advance': { group: 'Zayavkalar', label: "Avans to'lovini tasdiqlash (buxgalter)" },
  'requests.procure': { group: 'Zayavkalar', label: "Ta'minot va logistika xarajatlari" },
  'requests.approve_procurement': { group: 'Zayavkalar', label: "Ta'minotni tasdiqlash (buxgalter)" },
  'requests.receive': { group: 'Zayavkalar', label: 'Tovarni omborga qabul qilish' },
  'requests.assemble': { group: 'Zayavkalar', label: "Yig'ish (injener)" },
  'requests.act': { group: 'Zayavkalar', label: 'Dalolatnoma (akt) tuzish' },
  'requests.deliver': { group: 'Zayavkalar', label: 'Yetkazib berish' },
  'requests.cancel': { group: 'Zayavkalar', label: 'Zayavkani bekor qilish' },
  'templates.manage': { group: 'Zayavkalar', label: 'Shartnoma shablonlarini boshqarish' },

  // Delivery
  'deliveries.view': { group: 'Yetkazish', label: "Barcha yetkazishlarni ko'rish" },
  'deliveries.drive': { group: 'Yetkazish', label: "Haydovchi: o'ziga biriktirilgan yetkazishlar" },
} as const

export type Permission = keyof typeof PERMISSIONS
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[]
export const OWNER_ROLE = 'owner'

const view: Permission[] = ['products.view', 'customers.view', 'warehouses.view', 'stock.view', 'requests.view']

/** Roles created by the seed. The owner can later change everything except the owner role itself. */
export const DEFAULT_ROLES: { key: string; name: string; description: string; permissions: Permission[] }[] = [
  { key: OWNER_ROLE, name: 'Owner', description: "Barcha ruxsatlar; rollar va ruxsatlarni boshqaradi", permissions: [] },
  {
    key: 'admin', name: 'Admin', description: 'Foydalanuvchilar, kataloglar va sozlamalar',
    permissions: ALL_PERMISSIONS.filter((p) => p !== 'roles.manage'),
  },
  {
    key: 'director', name: 'Direktor', description: "Hamma narsani ko'radi, narx va bekor qilishni tasdiqlaydi",
    permissions: ALL_PERMISSIONS.filter((p) => !['users.manage', 'roles.manage', 'settings.manage'].includes(p)),
  },
  {
    key: 'seller', name: 'Sotuvchi', description: 'Zayavka ochadi, mijoz bilan narx va shartnoma kelishadi',
    permissions: [...view, 'customers.manage', 'requests.create', 'requests.sell', 'requests.contract', 'requests.act',
      'sales.view', 'sales.create', 'sales.confirm', 'invoices.view'],
  },
  {
    key: 'engineer', name: 'Injener', description: "Konfiguratsiya qiladi va yig'adi; tannarxni ko'rmaydi",
    permissions: [...view, 'requests.configure', 'requests.assemble'],
  },
  {
    key: 'declarant', name: 'Deklarant', description: 'TN VED, bojxona va narx shakllantirish',
    permissions: [...view, 'products.manage', 'requests.price', 'costs.view', 'suppliers.view'],
  },
  {
    key: 'procurement', name: "Ta'minotchi", description: "Yetkazuvchi, logistika va yetkazib berish",
    permissions: [...view, 'suppliers.view', 'suppliers.manage', 'requests.procure', 'requests.deliver', 'deliveries.view', 'purchases.view', 'costs.view'],
  },
  {
    key: 'accountant', name: 'Buxgalter', description: "To'lovlar, avans va xarajatlarni tasdiqlaydi",
    permissions: [...view, 'suppliers.view', 'requests.advance', 'requests.approve_procurement', 'payments.view', 'payments.create',
      'invoices.view', 'invoices.create', 'sales.view', 'purchases.view', 'reports.view', 'costs.view', 'employees.view'],
  },
  {
    key: 'storekeeper', name: 'Omborchi', description: 'Omborga kirim, chiqim va harakat',
    permissions: [...view, 'stock.move', 'stock.receive', 'requests.receive', 'purchases.view', 'purchases.confirm'],
  },
  {
    key: 'driver', name: 'Haydovchi', description: "Faqat o'ziga biriktirilgan yetkazishlar; narxlarni ko'rmaydi",
    permissions: ['deliveries.drive'],
  },
]
