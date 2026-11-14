/**
 * Loader and minimal types for the YouTube IFrame Player API
 * (spec: skill-video-pipeline, Req 2.9, 12.4). No dependency: the script comes
 * from www.youtube.com and the player itself from www.youtube-nocookie.com.
 */

export const YT_SCRIPT_URL = 'https://www.youtube.com/iframe_api'
export const YT_EMBED_HOST = 'https://www.youtube-nocookie.com'

/** Values of `onStateChange` event data that the Watch player uses. */
export const YT_STATE = { ended: 0, playing: 1, paused: 2 } as const

export interface YTPlayer {
  destroy(): void
  playVideo(): void
  pauseVideo(): void
  loadVideoById(videoId: string): void
  getPlaybackRate(): number
}

export interface YTPlayerEvent {
  data: number
  target: YTPlayer
}

export interface YTPlayerOptions {
  host: string
  videoId: string
  playerVars: Record<string, string | number>
  events: {
    onReady?: (event: YTPlayerEvent) => void
    onStateChange?: (event: YTPlayerEvent) => void
  }
}

export interface YTNamespace {
  Player: new (element: HTMLElement, options: YTPlayerOptions) => YTPlayer
}

type YTWindow = Window & { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void }

let loading: Promise<YTNamespace> | null = null

/** Loads the IFrame API script once and resolves with the `YT` namespace. Client only. */
export function loadYouTubeApi(): Promise<YTNamespace> {
  if (loading) return loading
  const win = window as YTWindow
  if (win.YT?.Player) return Promise.resolve(win.YT)
  loading = new Promise<YTNamespace>((resolve, reject) => {
    const previous = win.onYouTubeIframeAPIReady
    win.onYouTubeIframeAPIReady = () => {
      previous?.()
      if (win.YT?.Player) resolve(win.YT)
      else reject(new Error('youtube_api_unavailable'))
    }
    const script = document.createElement('script')
    script.src = YT_SCRIPT_URL
    script.async = true
    script.onerror = () => {
      script.remove()
      reject(new Error('youtube_api_blocked'))
    }
    document.head.appendChild(script)
  })
  // A failed load can be tried again on the next play.
  loading.catch(() => {
    loading = null
  })
  return loading
}
