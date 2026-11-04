import {
  Dialog, DialogContent, TextField, Box, Typography,
  Table, TableBody, TableCell, TableHead, TableRow,
  Chip, InputAdornment, IconButton,
} from '@mui/material'
import { Search, Close } from '@mui/icons-material'
import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'motion/react'
import { useAppSelector, useCan } from '@/app/hooks'
import type { Product } from '@/shared/types/catalog.types'
import { formatCurrency } from '@/shared/utils/formatters'

const CAT_COLORS: Record<string, 'primary' | 'success' | 'warning' | 'info' | 'error' | 'default'> = {
  electronics: 'info', building: 'warning', chemical: 'error',
  food: 'success', clothing: 'primary', other: 'default',
}
import { CAT_LABELS } from '@/shared/constants'

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (product: Product) => void
  title?: string
}

export default function ProductSearchModal({ open, onClose, onSelect }: Props) {
  const { t } = useTranslation()
  const showCost = useCan('costs.view')
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const products = useAppSelector((s) => s.products.items)

  const filtered = query.length >= 1
    ? products.filter((p) =>
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.code.toLowerCase().includes(query.toLowerCase()) ||
        (p.barcode && p.barcode.includes(query)),
      )
    : products.slice(0, 10)

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }, [open])

  const handleSelect = (product: Product) => {
    onSelect(product)
    onClose()
  }

  return (
    <Dialog
      open={open} onClose={onClose} maxWidth="md" fullWidth
      slotProps={{ paper: { sx: { borderRadius: 3, overflow: 'hidden' } } }}
    >
      {/* Search header */}
      <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', gap: 1, alignItems: 'center' }}>
        <TextField
          inputRef={inputRef}
          fullWidth value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('Mahsulot nomini yozing...')}
          variant="standard"
          slotProps={{
            input: {
              disableUnderline: true,
              startAdornment: <InputAdornment position="start"><Search color="action" /></InputAdornment>,
              sx: { fontSize: '1.1rem', fontWeight: 500 },
            },
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'Enter' && filtered.length === 1) handleSelect(filtered[0])
          }}
        />
        <IconButton size="small" onClick={onClose}><Close /></IconButton>
      </Box>

      <DialogContent sx={{ p: 0, maxHeight: '60vh', overflow: 'auto' }}>
        {filtered.length === 0 ? (
          <Box sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
            <Typography>{t('Mahsulot topilmadi')}</Typography>
          </Box>
        ) : (
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase' }}>{t('Kod')}</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase' }}>{t('Nomi')}</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase' }}>{t('Kategoriya')}</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase' }}>{t("O'lchov")}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase' }}>{t('Narx')}</TableCell>
                {showCost && <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase' }}>{t('Tannarxi')}</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              <AnimatePresence>
                {filtered.map((p, i) => (
                  <motion.tr
                    key={p.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    onClick={() => handleSelect(p)}
                    style={{ cursor: 'pointer' }}
                  >
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'text.secondary' }}>
                      {p.code}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{p.name}</TableCell>
                    <TableCell>
                      <Chip
                        label={t(CAT_LABELS[p.category] || p.category)}
                        color={CAT_COLORS[p.category] || 'default'}
                        size="small"
                        sx={{ borderRadius: 1, fontWeight: 600, fontSize: '0.7rem' }}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip label={p.unit} variant="outlined" size="small" sx={{ borderRadius: 1, fontSize: '0.75rem' }} />
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: 'primary.main' }}>
                      {p.price === undefined ? '—' : formatCurrency(p.price)}
                    </TableCell>
                    {showCost && <TableCell align="right" sx={{ fontWeight: 700, color: 'success.main' }}>{formatCurrency(p.costPrice)}</TableCell>}
                  </motion.tr>
                ))}
              </AnimatePresence>
            </TableBody>
          </Table>
        )}
        <Box sx={{ p: 1.5, borderTop: '1px solid', borderColor: 'divider', display: 'flex', gap: 2 }}>
          <Typography variant="caption" color="text.secondary">
            <kbd style={{ padding: '1px 6px', borderRadius: 4, border: '1px solid #ccc', fontFamily: 'monospace' }}>↵</kbd> {t('tanlash')}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            <kbd style={{ padding: '1px 6px', borderRadius: 4, border: '1px solid #ccc', fontFamily: 'monospace' }}>Esc</kbd> {t('yopish')}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
            {t('{{count}} ta topildi', { count: filtered.length })}
          </Typography>
        </Box>
      </DialogContent>
    </Dialog>
  )
}
