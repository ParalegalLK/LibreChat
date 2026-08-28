import { memo, useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RecordPlugin from 'wavesurfer.js/dist/plugins/record.js';
import { useLocalize } from '~/hooks';

const WAVEFORM_HEIGHT = 44;
const SCROLLING_WINDOW_SECONDS = 6;
const FALLBACK_BARS = [0, 1, 2, 3, 4];

function mountLiveWaveform(container: HTMLDivElement, stream: MediaStream) {
  const record = RecordPlugin.create({
    scrollingWaveform: true,
    scrollingWaveformWindow: SCROLLING_WINDOW_SECONDS,
    renderRecordedAudio: false,
  });
  const color = getComputedStyle(container).color;
  const wavesurfer = WaveSurfer.create({
    container,
    height: WAVEFORM_HEIGHT,
    waveColor: color,
    progressColor: color,
    cursorWidth: 0,
    interact: false,
    barWidth: 3,
    barGap: 2,
    barRadius: 2,
    plugins: [record],
  });
  const mic = record.renderMicStream(stream);

  return () => {
    mic.onDestroy();
    wavesurfer.destroy();
  };
}

function LiveWaveform({ stream }: { stream: MediaStream }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    return mountLiveWaveform(container, stream);
  }, [stream]);

  return <div ref={containerRef} className="relative h-11 w-full" />;
}

function PulsingBars() {
  return (
    <div className="relative flex h-11 w-full items-center justify-end gap-0.5 pr-2">
      {FALLBACK_BARS.map((index) => (
        <span
          key={index}
          className="w-[3px] animate-pulse rounded-full bg-current"
          style={{ height: `${12 + (index % 3) * 8}px`, animationDelay: `${index * 120}ms` }}
        />
      ))}
    </div>
  );
}

export default memo(function Waveform({ stream }: { stream: MediaStream | null }) {
  const localize = useLocalize();

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={localize('com_ui_recording')}
      data-testid="recording-waveform"
      className="relative mx-4 flex h-11 flex-1 items-center text-text-primary"
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-1/2 border-t-2 border-dotted border-border-medium"
      />
      {stream ? <LiveWaveform stream={stream} /> : <PulsingBars />}
    </div>
  );
});
