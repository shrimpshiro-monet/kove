import { useState } from 'react'
import { renderExport, getRenderStatus } from '../lib/api-client'

interface Props {
  edl: unknown
}

export function ExportButton({ edl }: Props) {
  const [exporting, setExporting] = useState(false)
  const [exportUrl, setExportUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleExport = async () => {
    setExporting(true)
    setError(null)
    setExportUrl(null)
    try {
      const { renderJobId } = await renderExport(edl as any, '', undefined)
      // Poll for completion
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 2000))
        const status = await getRenderStatus(renderJobId)
        if (status.status === 'complete' && status.renderUrl) {
          setExportUrl(status.renderUrl)
          return
        }
        if (status.status === 'failed') {
          setError(status.error || 'Render failed')
          return
        }
      }
      setError('Render timed out')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  if (exportUrl) {
    return (
      <a href={exportUrl} download style={{ display: 'inline-block', marginTop: 20, padding: '10px 20px', background: '#28a745', color: 'white', border: 'none', borderRadius: 4, textDecoration: 'none' }}>
        Download MP4
      </a>
    )
  }

  return (
    <div>
      <button
        onClick={handleExport}
        disabled={exporting}
        style={{ marginTop: 20, padding: '10px 20px', background: '#007bff', color: 'white', border: 'none', borderRadius: 4 }}
      >
        {exporting ? 'Exporting...' : 'Export MP4'}
      </button>
      {error && (
        <span style={{ marginLeft: 10, color: '#c00' }}>{error}</span>
      )}
    </div>
  )
}
