interface Props {
  value: string
  onChange: (v: string) => void
}

export function PromptInput({ value, onChange }: Props) {
  return (
    <div style={{ margin: '20px 0' }}>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Describe your edit... (e.g., 'Make a hype TikTok edit with fast cuts and glow effects')"
        rows={3}
        style={{ width: '100%', padding: 10 }}
      />
    </div>
  )
}
