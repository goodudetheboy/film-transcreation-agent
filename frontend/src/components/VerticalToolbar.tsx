export interface VerticalToolbarProps {
  playing: boolean;
  zoom: number;
  onTogglePlay: () => void;
  onSeekRelative: (deltaSeconds: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onBack: () => void;
}

/** The wireframe's right-edge icon strip on the video panel (play/pause,
 * rewind/forward, zoom, back, help) — a real NLE source-monitor toolbar, not
 * a text button row. */
export function VerticalToolbar({ playing, zoom, onTogglePlay, onSeekRelative, onZoomIn, onZoomOut, onBack }: VerticalToolbarProps) {
  return (
    <div className="v-toolbar">
      <button type="button" className="v-toolbar__btn" title="Back to films" onClick={onBack}>
        ←
      </button>
      <div className="v-toolbar__divider" />
      <button type="button" className="v-toolbar__btn" title="Back 5s" onClick={() => onSeekRelative(-5)}>
        ⏮
      </button>
      <button type="button" className="v-toolbar__btn v-toolbar__btn--primary" title={playing ? 'Pause' : 'Play'} onClick={onTogglePlay}>
        {playing ? '⏸' : '▶'}
      </button>
      <button type="button" className="v-toolbar__btn" title="Forward 5s" onClick={() => onSeekRelative(5)}>
        ⏭
      </button>
      <div className="v-toolbar__divider" />
      <button type="button" className="v-toolbar__btn" title="Zoom in" onClick={onZoomIn} disabled={zoom >= 2}>
        ＋
      </button>
      <span className="v-toolbar__zoom">{Math.round(zoom * 100)}%</span>
      <button type="button" className="v-toolbar__btn" title="Zoom out" onClick={onZoomOut} disabled={zoom <= 1}>
        −
      </button>
      <div className="v-toolbar__divider" />
      <button type="button" className="v-toolbar__btn" title="Help" onClick={() => window.alert('Drag the timeline at the bottom to scrub. Click a Details row to edit it.')}>
        ?
      </button>
    </div>
  );
}
