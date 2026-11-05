import {
  Box, List, ListItem, ListItemButton, ListItemIcon, ListItemText,
  Collapse, Typography, Divider, Tooltip, Avatar,
} from '@mui/material'
import {
  Dashboard, Inventory2, People, LocalShipping, Person,
  Warehouse, ShoppingCart, Receipt, MoveDown, AccountBalance,
  BarChart, ExpandLess, ExpandMore, Category, AddShoppingCart, MoveToInbox,
  Assignment, Description, Gavel, AdminPanelSettings, Group, Security, Article, Settings, History,
} from '@mui/icons-material'
import { useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppSelector } from '@/app/hooks'
import { canAccess } from '@/app/permissions'
import { getInitials } from '@/shared/utils/formatters'
import { gsap } from 'gsap'

const DRAWER_WIDTH = 260

interface NavItem {
  label: string
  icon: React.ReactNode
  path?: string
  children?: NavItem[]
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',    icon: <Dashboard />,       path: '/' },
  {
    label: 'CRM', icon: <Assignment />,
    children: [
      { label: 'Zayavkalar',     icon: <Assignment />,  path: '/requests' },
      { label: 'Shartnomalar',   icon: <Gavel />,       path: '/documents/contracts' },
      { label: 'Dalolatnomalar', icon: <Description />, path: '/documents/acts' },
      { label: 'Yetkazishlar',   icon: <LocalShipping />, path: '/deliveries' },
    ],
  },
  {
    label: 'Kataloglar', icon: <Category />,
    children: [
      { label: 'Mahsulotlar',  icon: <Inventory2 />,      path: '/catalogs/products' },
      { label: 'Mijozlar',     icon: <People />,          path: '/catalogs/customers' },
      { label: 'Yetkazuvchilar', icon: <LocalShipping />, path: '/catalogs/suppliers' },
      { label: 'Xodimlar',     icon: <Person />,          path: '/catalogs/employees' },
      { label: 'Omborlar',     icon: <Warehouse />,       path: '/catalogs/warehouses' },
    ],
  },
  {
    label: 'Savdo', icon: <ShoppingCart />,
    children: [
      { label: 'Buyurtmalar', icon: <ShoppingCart />, path: '/sales/orders' },
      { label: 'Yangi buyurtma', icon: <AddShoppingCart />, path: '/sales/orders/new' },
      { label: 'Fakturalar',  icon: <Receipt />,      path: '/sales/invoices' },
    ],
  },
  {
    label: 'Xarid', icon: <LocalShipping />,
    children: [
      { label: 'Buyurtmalar', icon: <ShoppingCart />, path: '/purchases/orders' },
      { label: 'Yuk keldi (kirim)', icon: <MoveToInbox />, path: '/purchases/receipts/new' },
    ],
  },
  {
    label: 'Ombor', icon: <Warehouse />,
    children: [
      { label: 'Qoldiqlar',      icon: <Inventory2 />, path: '/warehouse/balance' },
      { label: 'Tovar harakati', icon: <MoveDown />,   path: '/warehouse/movements' },
    ],
  },
  {
    label: 'Moliya', icon: <AccountBalance />,
    children: [
      { label: "To'lovlar", icon: <AccountBalance />, path: '/finance/payments' },
    ],
  },
  {
    label: 'Hisobotlar', icon: <BarChart />,
    children: [
      { label: 'Savdo',    icon: <BarChart />,   path: '/reports/sales' },
      { label: 'Qoldiqlar', icon: <Inventory2 />, path: '/reports/stock' },
    ],
  },
  {
    label: 'Boshqaruv', icon: <AdminPanelSettings />,
    children: [
      { label: 'Foydalanuvchilar', icon: <Group />, path: '/admin/users' },
      { label: 'Rollar va ruxsatlar', icon: <Security />, path: '/admin/roles' },
      { label: 'Shartnoma shablonlari', icon: <Article />, path: '/admin/templates' },
      { label: 'Sozlamalar', icon: <Settings />, path: '/admin/settings' },
      { label: 'Audit jurnali', icon: <History />, path: '/admin/audit' },
    ],
  },
]

interface Props { collapsed: boolean; onNavigate?: () => void }

export default function Sidebar({ collapsed, onNavigate }: Props) {
  const { t } = useTranslation()
  const user = useAppSelector((s) => s.auth.user)
  const navigate = useNavigate()
  const go = (path: string) => { navigate(path); onNavigate?.() }
  const navItems = useMemo(() => NAV_ITEMS
    .map((item) => item.children ? { ...item, children: item.children.filter((c) => c.path && canAccess(user, c.path)) } : item)
    .filter((item) => (item.children ? item.children.length > 0 : item.path && canAccess(user, item.path))), [user])
  const location = useLocation()
  const [openGroups, setOpenGroups] = useState<string[]>(['CRM'])
  const logoRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (logoRef.current) {
      gsap.fromTo(logoRef.current, { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.5, ease: 'power2.out' })
    }
  }, [])

  const toggleGroup = (label: string) =>
    setOpenGroups((prev) => prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label])

  const isActive = (path: string) => location.pathname === path || (path !== '/' && path !== '/sales/orders' && location.pathname.startsWith(`${path}/`))

  return (
    <Box
      sx={{
        width: collapsed ? 64 : DRAWER_WIDTH,
        transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)',
        height: '100vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
        borderRight: '1px solid',
        borderColor: 'divider',
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <Box ref={logoRef} sx={{ px: 2.5, py: 2.5, display: 'flex', alignItems: 'center', gap: 1.5, minHeight: 64 }}>
        <Avatar sx={{ bgcolor: 'primary.main', width: 36, height: 36, borderRadius: 2, fontSize: '0.9rem', fontWeight: 800 }}>
          1C
        </Avatar>
        {!collapsed && (
          <Box>
            <Typography variant="subtitle2" sx={{  lineHeight: 1.1 , fontWeight: 800 }}>ERP System</Typography>
            <Typography variant="caption" color="text.secondary">v{__APP_VERSION__}</Typography>
          </Box>
        )}
      </Box>

      <Divider />

      {/* Nav */}
      <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', py: 1,
        '&::-webkit-scrollbar': { width: 4 },
        '&::-webkit-scrollbar-thumb': { bgcolor: 'divider', borderRadius: 4 },
      }}>
        <List dense disablePadding>
          {navItems.map((item) => {
            if (item.path) {
              const active = isActive(item.path)
              return (
                <Tooltip key={item.path} title={collapsed ? t(item.label) : ''} placement="right">
                  <ListItem disablePadding sx={{ px: 1, mb: 0.25 }}>
                    <ListItemButton
                      onClick={() => go(item.path!)}
                      selected={active}
                      sx={{
                        borderRadius: 2,
                        minHeight: 40,
                        px: collapsed ? 1 : 1.5,
                        justifyContent: collapsed ? 'center' : 'flex-start',
                        '&.Mui-selected': {
                          bgcolor: 'primary.main',
                          color: 'white',
                          '& .MuiListItemIcon-root': { color: 'white' },
                          '&:hover': { bgcolor: 'primary.dark' },
                        },
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: collapsed ? 0 : 36, justifyContent: 'center', color: active ? 'inherit' : 'text.secondary' }}>
                        {item.icon}
                      </ListItemIcon>
                      {!collapsed && <ListItemText primary={t(item.label)} slotProps={{ primary: { sx: { fontWeight: active ? 700 : 500, fontSize: '0.875rem' } } }} />}
                    </ListItemButton>
                  </ListItem>
                </Tooltip>
              )
            }

            // Group with children
            const isOpen = openGroups.includes(item.label) || !!item.children?.some((c) => c.path && isActive(c.path))
            const hasActiveChild = item.children?.some((c) => c.path && isActive(c.path))
            return (
              <Box key={item.label}>
                <Tooltip title={collapsed ? t(item.label) : ''} placement="right">
                  <ListItem disablePadding sx={{ px: 1, mb: 0.25 }}>
                    <ListItemButton
                      onClick={() => !collapsed && toggleGroup(item.label)}
                      sx={{
                        borderRadius: 2, minHeight: 40,
                        px: collapsed ? 1 : 1.5,
                        justifyContent: collapsed ? 'center' : 'flex-start',
                        bgcolor: hasActiveChild ? 'action.selected' : 'transparent',
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: collapsed ? 0 : 36, justifyContent: 'center', color: 'text.secondary' }}>
                        {item.icon}
                      </ListItemIcon>
                      {!collapsed && (
                        <>
                          <ListItemText primary={t(item.label)} slotProps={{ primary: { sx: { fontWeight: 600, fontSize: '0.875rem', color: 'text.secondary' } } }} />
                          {isOpen ? <ExpandLess fontSize="small" sx={{ color: 'text.secondary' }} /> : <ExpandMore fontSize="small" sx={{ color: 'text.secondary' }} />}
                        </>
                      )}
                    </ListItemButton>
                  </ListItem>
                </Tooltip>

                {!collapsed && (
                  <Collapse in={isOpen} timeout="auto">
                    <List dense disablePadding sx={{ pl: 1 }}>
                      {item.children?.map((child) => {
                        const childActive = child.path ? isActive(child.path) : false
                        return (
                          <ListItem key={child.path} disablePadding sx={{ px: 1, mb: 0.25 }}>
                            <ListItemButton
                              onClick={() => go(child.path!)}
                              selected={childActive}
                              sx={{
                                borderRadius: 2, minHeight: 36, pl: 2,
                                '&.Mui-selected': {
                                  bgcolor: 'primary.main', color: 'white',
                                  '& .MuiListItemIcon-root': { color: 'white' },
                                  '&:hover': { bgcolor: 'primary.dark' },
                                },
                              }}
                            >
                              <ListItemIcon sx={{ minWidth: 30, color: childActive ? 'inherit' : 'text.secondary' }}>
                                <Box sx={{ fontSize: 16, display: 'flex' }}>{child.icon}</Box>
                              </ListItemIcon>
                              <ListItemText primary={t(child.label)} slotProps={{ primary: { sx: { fontWeight: childActive ? 700 : 500, fontSize: '0.825rem' } } }} />
                            </ListItemButton>
                          </ListItem>
                        )
                      })}
                    </List>
                  </Collapse>
                )}
              </Box>
            )
          })}
        </List>
      </Box>

      <Divider />
      <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Avatar sx={{ width: 30, height: 30, bgcolor: 'secondary.main', fontSize: '0.75rem' }}>{getInitials(user?.fullName)}</Avatar>
        {!collapsed && user && (
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" noWrap sx={{ fontWeight: 600, display: 'block' }}>{user.fullName}</Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: '0.7rem', display: 'block' }}>{t(user.roleName)}</Typography>
          </Box>
        )}
      </Box>
    </Box>
  )
}
