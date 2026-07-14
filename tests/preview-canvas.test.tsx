// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'

beforeAll(() => {
  vi.stubGlobal(
    'AudioContext',
    vi.fn().mockImplementation(() => ({
      createMediaElementSource: vi.fn().mockReturnValue({
        connect: vi.fn(),
        disconnect: vi.fn(),
      }),
      destination: {},
      resume: vi.fn().mockResolvedValue(undefined),
      suspend: vi.fn().mockResolvedValue(undefined),
    }))
  )
  HTMLVideoElement.prototype.load = vi.fn() as any
  HTMLVideoElement.prototype.play = vi.fn().mockResolvedValue(undefined) as any
  HTMLVideoElement.prototype.pause = vi.fn() as any
  HTMLAudioElement.prototype.load = vi.fn() as any
  HTMLAudioElement.prototype.pause = vi.fn() as any

  // Mock requestAnimationFrame / cancelAnimationFrame
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(cb, 16) as unknown as number)
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
})

afterAll(() => {
  vi.restoreAllMocks()
})

import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { PreviewCanvas } from '../apps/web/src/components/PreviewCanvas'
import { Timeline } from '../apps/web/src/components/Timeline'

function mount(element: React.ReactElement): { container: HTMLDivElement; root: ReturnType<typeof createRoot>; unmount: () => void } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(element) })
  return {
    container,
    root,
    unmount: () => {
      act(() => { root.unmount() })
      document.body.removeChild(container)
    },
  }
}

describe('PreviewCanvas', () => {
  it('renders a canvas element with data-testid="preview-canvas"', () => {
    const { container, unmount } = mount(<PreviewCanvas edl={null} />)
    const canvas = container.querySelector('[data-testid="preview-canvas"]') as HTMLCanvasElement | null
    expect(canvas).not.toBeNull()
    expect(canvas!.tagName).toBe('CANVAS')
    unmount()
  })

  it('renders play and pause buttons', () => {
    const { container, unmount } = mount(<PreviewCanvas edl={null} />)
    const buttons = container.querySelectorAll('button')
    expect(buttons.length).toBeGreaterThanOrEqual(2)
    expect(buttons[0].textContent).toBe('Play')
    expect(buttons[1].textContent).toBe('Pause')
    unmount()
  })

  it('renders time display', () => {
    const { container, unmount } = mount(<PreviewCanvas edl={null} />)
    const spans = container.querySelectorAll('span')
    const timeSpan = Array.from(spans).find(s => s.textContent?.includes('/'))
    expect(timeSpan).toBeDefined()
    expect(timeSpan!.textContent).toContain('0.0s')
    unmount()
  })

  it('canvas has default dimensions 1920x1080', () => {
    const { container, unmount } = mount(<PreviewCanvas edl={null} />)
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(canvas.width).toBe(1920)
    expect(canvas.height).toBe(1080)
    unmount()
  })
})

describe('Timeline', () => {
  it('renders a clickable timeline container', () => {
    const onSeek = vi.fn()
    const { container, unmount } = mount(
      <Timeline currentTime={0} duration={10} onSeek={onSeek} />
    )
    const timeline = container.firstElementChild as HTMLElement
    expect(timeline).not.toBeNull()
    expect(timeline.style.cursor).toBe('pointer')
    unmount()
  })

  it('renders a playhead element', () => {
    const onSeek = vi.fn()
    const { container, unmount } = mount(
      <Timeline currentTime={5} duration={10} onSeek={onSeek} />
    )
    const timeline = container.firstElementChild as HTMLElement
    const playhead = timeline.children[0] as HTMLElement
    expect(playhead).not.toBeNull()
    expect(playhead.style.position).toBe('absolute')
    expect(playhead.style.width).toBe('2px')
    unmount()
  })

  it('renders a progress bar', () => {
    const onSeek = vi.fn()
    const { container, unmount } = mount(
      <Timeline currentTime={5} duration={10} onSeek={onSeek} />
    )
    const timeline = container.firstElementChild as HTMLElement
    const progressBar = timeline.children[1] as HTMLElement
    expect(progressBar).not.toBeNull()
    expect(progressBar.style.position).toBe('absolute')
    expect(progressBar.style.width).toBe('50%')
    unmount()
  })

  it('calls onSeek with correct time on click', () => {
    const onSeek = vi.fn()
    const { container, unmount } = mount(
      <Timeline currentTime={0} duration={10} onSeek={onSeek} />
    )
    const timeline = container.firstElementChild as HTMLElement

    // Mock getBoundingClientRect
    vi.spyOn(timeline, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 200, height: 40,
      right: 200, bottom: 40, x: 0, y: 0, toJSON: () => {},
    })

    const event = new MouseEvent('click', { clientX: 100, bubbles: true })
    timeline.dispatchEvent(event)

    expect(onSeek).toHaveBeenCalledTimes(1)
    expect(onSeek).toHaveBeenCalledWith(5) // 100/200 * 10 = 5
    unmount()
  })

  it('positions playhead at correct percentage', () => {
    const onSeek = vi.fn()
    const { container, unmount } = mount(
      <Timeline currentTime={7.5} duration={10} onSeek={onSeek} />
    )
    const timeline = container.firstElementChild as HTMLElement
    const playhead = timeline.children[0] as HTMLElement
    expect(playhead.style.left).toBe('75%')
    unmount()
  })
})
