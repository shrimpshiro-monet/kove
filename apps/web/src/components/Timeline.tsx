interface TimelineProps {
  currentTime: number
  duration: number
  onSeek: (time: number) => void
}

export function Timeline({ currentTime, duration, onSeek }: TimelineProps) {
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percent = Math.max(0, Math.min(1, x / rect.width))
    const time = percent * duration
    onSeek(time)
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div
      onClick={handleClick}
      style={{
        width: '100%',
        height: 40,
        background: '#333',
        borderRadius: 4,
        cursor: 'pointer',
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: `${progress}%`,
          top: 0,
          width: 2,
          height: '100%',
          background: '#007bff',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: `${progress}%`,
          height: '100%',
          background: 'rgba(0,123,255,0.3)',
          borderRadius: 4,
        }}
      />
    </div>
  )
}
