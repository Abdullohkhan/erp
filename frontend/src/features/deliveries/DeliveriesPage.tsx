import { useState } from 'react'
import { Box, Button, Chip, Skeleton, Stack, Typography } from '@mui/material'
import { OpenInNew } from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import AnimatedPage from '@/shared/components/AnimatedPage/AnimatedPage'
import PageHeader from '@/shared/components/PageHeader/PageHeader'
import { useAppSelector, useCan } from '@/app/hooks'
import { useFetch } from '@/shared/hooks/useFetch'
import { DELIVERY_STATUS, type Delivery, type DeliveryStatus } from '@/features/requests/types'
import DeliveryCard from './DeliveryCard'

/** Deliveries: a driver sees only the ones assigned to them (the server filters), dispatchers see all. */
export default function DeliveriesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const me = useAppSelector((s) => s.auth.user)
  const canDeliver = useCan('requests.deliver')
  const canOpenRequest = useCan('requests.view')
  const [status, setStatus] = useState<DeliveryStatus | ''>('')
  const { data, setData, loading } = useFetch<Delivery[]>(`/deliveries${status ? `?status=${status}` : ''}`)

  return (
    <AnimatedPage>
      <PageHeader title="Yetkazishlar" subtitle={t('Jami: {{count}}', { count: data?.length ?? 0 })} breadcrumbs={[{ label: 'CRM' }, { label: 'Yetkazishlar' }]} />
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <Chip label={t('Hammasi')} color={status === '' ? 'primary' : 'default'} onClick={() => setStatus('')} />
        {(Object.keys(DELIVERY_STATUS) as DeliveryStatus[]).map((s) => (
          <Chip key={s} label={t(DELIVERY_STATUS[s].label)} color={status === s ? 'primary' : 'default'} onClick={() => setStatus(s)} />
        ))}
      </Box>
      {loading && !data ? <Skeleton variant="rounded" height={200} /> : (
        <Stack spacing={2}>
          {(data ?? []).length === 0 && <Typography color="text.secondary">{t("Yetkazishlar yo'q")}</Typography>}
          {(data ?? []).map((d) => (
            <Box key={d.id}>
              <DeliveryCard d={d} showRequest canAct={canDeliver || (!!me && d.driverId === me.id)}
                onChanged={(nd) => setData((list) => (list ?? []).map((x) => (x.id === nd.id ? nd : x)))} />
              {canOpenRequest && d.request && (
                <Button size="small" startIcon={<OpenInNew />} sx={{ mt: 0.5 }} onClick={() => navigate(`/requests/${d.request!.id}`)}>{t('Zayavka')}</Button>
              )}
            </Box>
          ))}
        </Stack>
      )}
    </AnimatedPage>
  )
}
