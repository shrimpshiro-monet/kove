interface Props {
  videoFile: File | null
  audioFile: File | null
  onVideoChange: (f: File) => void
  onAudioChange: (f: File) => void
}

export function UploadPanel({ videoFile, audioFile, onVideoChange, onAudioChange }: Props) {
  return (
    <div style={{ margin: '20px 0' }}>
      <div>
        <label>Video: </label>
        <input type="file" accept="video/*" onChange={e => e.target.files?.[0] && onVideoChange(e.target.files[0])} />
        {videoFile && <span> {videoFile.name}</span>}
      </div>
      <div>
        <label>Audio: </label>
        <input type="file" accept="audio/*" onChange={e => e.target.files?.[0] && onAudioChange(e.target.files[0])} />
        {audioFile && <span> {audioFile.name}</span>}
      </div>
    </div>
  )
}
