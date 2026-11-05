import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material'
import { Print, PictureAsPdf } from '@mui/icons-material'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAction } from '@/shared/hooks/useAction'
import { downloadFile } from '@/lib/download'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

/** A4 print layout: the <title> becomes the PDF file name; table rows are not split across pages. */
const wrap = (title: string, body: string) => `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>@page{size:A4;margin:15mm 12mm 15mm 20mm}
body{font-family:'Times New Roman',serif;font-size:14px;line-height:1.5;color:#000;background:#fff;margin:24px}
h2,h4{page-break-after:avoid}table{font-size:13px;border-collapse:collapse}th{background:#f2f2f2}
thead{display:table-header-group}tr,img{page-break-inside:avoid}td:nth-child(n+3),th:nth-child(n+3){white-space:nowrap}
@media print{body{margin:0}th{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>${body}</body></html>`

/**
 * Shows a server-rendered HTML document (contract, act, invoice, waybill) in a sandboxed frame; prints it,
 * and with `pdf` downloads the server-generated PDF.
 */
export default function HtmlDocDialog({ open, title, html, onClose, pdf }: {
  open: boolean; title: string; html: string; onClose: () => void; pdf?: { url: string; fileName: string }
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLIFrameElement>(null)
  const { busy, run } = useAction()
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>{title}</DialogTitle>
      <DialogContent sx={{ p: 0, height: '70vh' }}>
        <iframe ref={ref} title={title} sandbox="allow-same-origin allow-modals" srcDoc={wrap(title, html)}
          style={{ border: 0, width: '100%', height: '100%', background: '#fff' }} />
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={onClose} variant="outlined" color="inherit">{t('Yopish')}</Button>
        {pdf && <Button variant="outlined" startIcon={<PictureAsPdf />} disabled={busy}
          onClick={() => run(() => downloadFile(pdf.url, pdf.fileName), 'PDF yuklab olindi')}>{t('PDF yuklab olish')}</Button>}
        <Button variant="contained" startIcon={<Print />} onClick={() => ref.current?.contentWindow?.print()}>{t('Chop etish')}</Button>
      </DialogActions>
    </Dialog>
  )
}
