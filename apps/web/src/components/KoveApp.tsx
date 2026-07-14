import { useState, useEffect, useCallback } from 'react'
import { UploadPanel } from './UploadPanel'
import { PromptInput } from './PromptInput'
import { ExportButton } from './ExportButton'
import { PreviewCanvas } from './PreviewCanvas'
import { Timeline } from './Timeline'
import { type TimelineState } from '../lib/timeline-player'
import { generateEDL } from '../lib/api-client'

export function KoveApp() {
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [prompt, setPrompt] = useState('')
  const [edl, setEdl] = useState<unknown>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [previewState, setPreviewState] = useState<TimelineState>({
    currentTime: 0,
    duration: 0,
    isPlaying: false,
    fps: 30,
  })
  const [seekTime, setSeekTime] = useState<number | null>(null)

  useEffect(() => {
    const urls: string[] = []
    if (videoFile) {
      const url = URL.createObjectURL(videoFile)
      setVideoUrl(url)
      urls.push(url)
    } else {
      setVideoUrl(null)
    }
    if (audioFile) {
      const url = URL.createObjectURL(audioFile)
      setAudioUrl(url)
      urls.push(url)
    } else {
      setAudioUrl(null)
    }
    return () => {
      urls.forEach(URL.revokeObjectURL)
    }
  }, [videoFile, audioFile])

  const handleSeek = useCallback((time: number) => {
    setSeekTime(time)
  }, [])

  const handleGenerate = async () => {
    if (!videoFile || !audioFile || !prompt) return
    setLoading(true)
    setError(null)
    try {
      const result = await generateEDL(videoFile, audioFile, prompt)
      setEdl(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
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
      {error && (
        <div style={{ marginTop: 10, padding: 10, background: '#fee', border: '1px solid #fcc', borderRadius: 4, color: '#c00' }}>
          {error}
        </div>
      )}
      {edl && <ExportButton edl={edl} />}
      {edl && videoUrl && audioUrl && (
        <div style={{ marginTop: 20 }}>
          <h3>Preview</h3>
          <PreviewCanvas
            edl={edl}
            videoUrl={videoUrl}
            audioUrl={audioUrl}
            onStateChange={setPreviewState}
            seekTime={seekTime}
          />
          <Timeline
            currentTime={previewState.currentTime}
            duration={previewState.duration}
            onSeek={handleSeek}
          />
        </div>
      )}
      {edl && (
        <pre style={{ maxHeight: 400, overflow: 'auto', background: '#f5f5f5', padding: 10 }}>
          {JSON.stringify(edl, null, 2)}
        </pre>
      )}
    </div>
  )
}
