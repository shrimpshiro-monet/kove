import { useState } from 'react'
import { UploadPanel } from './UploadPanel'
import { PromptInput } from './PromptInput'
import { ExportButton } from './ExportButton'
import { generateEDL } from '../lib/api-client'

export function KoveApp() {
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [prompt, setPrompt] = useState('')
  const [edl, setEdl] = useState<unknown>(null)
  const [loading, setLoading] = useState(false)

  const handleGenerate = async () => {
    if (!videoFile || !audioFile || !prompt) return
    setLoading(true)
    try {
      const result = await generateEDL(videoFile, audioFile, prompt)
      setEdl(result)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h1>Kove v2</h1>
      <UploadPanel
        videoFile={videoFile}
        audioFile={audioFile}
        onVideoChange={setVideoFile}
        onAudioChange={setAudioFile}
      />
      <PromptInput value={prompt} onChange={setPrompt} />
      <button
        onClick={handleGenerate}
        disabled={loading || !videoFile || !audioFile || !prompt}
        style={{ padding: '10px 20px', background: '#28a745', color: 'white', border: 'none', borderRadius: 4 }}
      >
        {loading ? 'Generating...' : 'Generate Edit'}
      </button>
      {edl && <ExportButton edl={edl} />}
      {edl && (
        <pre style={{ maxHeight: 400, overflow: 'auto', background: '#f5f5f5', padding: 10 }}>
          {JSON.stringify(edl, null, 2)}
        </pre>
      )}
    </div>
  )
}
