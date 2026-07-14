interface Props {
  edl: unknown
}

export function ExportButton({ edl }: Props) {
  const handleExport = async () => {
    // TODO: call export API
    alert('Export coming soon!')
  }

  return (
    <button onClick={handleExport} style={{ marginTop: 20, padding: '10px 20px', background: '#007bff', color: 'white', border: 'none', borderRadius: 4 }}>
      Export MP4
    </button>
  )
}
