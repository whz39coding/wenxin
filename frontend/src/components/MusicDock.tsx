import { useEffect, useRef, useState } from 'react';
import { Music2, Pause, Volume2 } from 'lucide-react';

const audioModules = import.meta.glob('../assets/audio/*.{mp3,wav,ogg,m4a,aac,flac}', {
  eager: true,
  import: 'default',
  query: '?url',
}) as Record<string, string>;

const firstTrack = Object.values(audioModules)[0] ?? '';

function useAmbientMusic() {
  const [enabled, setEnabled] = useState(false);
  const [volume, setVolume] = useState(0.22);
  const [error, setError] = useState('');
  const [hasTrack, setHasTrack] = useState(Boolean(firstTrack));
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!firstTrack) {
      setHasTrack(false);
      setError('未检测到音频文件，请将 mp3/wav 放入 src/assets/audio。');
      return;
    }

    const audio = new Audio(firstTrack);
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = volume;
    audioRef.current = audio;
    setHasTrack(true);

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
    };
  }, []);

  async function toggle() {
    if (!audioRef.current) {
      return;
    }

    if (enabled) {
      audioRef.current.pause();
      setEnabled(false);
      return;
    }

    try {
      await audioRef.current.play();
      setEnabled(true);
      setError('');
    } catch {
      setEnabled(false);
      setError('播放失败，请确认音频文件可用，或与页面交互后再试。');
    }
  }

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  return { enabled, volume, setVolume, toggle, error, hasTrack };
}

export default function MusicDock() {
  const { enabled, volume, setVolume, toggle, error, hasTrack } = useAmbientMusic();
  const [nearRightEdge, setNearRightEdge] = useState(false);
  const [hoveringDock, setHoveringDock] = useState(false);
  const [finePointer, setFinePointer] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(hover: hover) and (pointer: fine)');
    const syncPointerType = () => setFinePointer(media.matches);
    syncPointerType();

    const onPointerTypeChange = () => syncPointerType();
    media.addEventListener('change', onPointerTypeChange);

    return () => {
      media.removeEventListener('change', onPointerTypeChange);
    };
  }, []);

  useEffect(() => {
    if (!finePointer) {
      setNearRightEdge(true);
      return;
    }

    const REVEAL_EDGE_PX = 140;
    const onMouseMove = (event: MouseEvent) => {
      setNearRightEdge(event.clientX >= window.innerWidth - REVEAL_EDGE_PX);
    };

    window.addEventListener('mousemove', onMouseMove);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, [finePointer]);

  const visible = nearRightEdge || hoveringDock;

  return (
    <div
      className={`fixed bottom-6 right-4 z-[70] flex flex-col items-end gap-3 transition-all duration-250 sm:right-6 ${visible
        ? 'translate-x-0 opacity-100 pointer-events-auto'
        : 'translate-x-4 opacity-0 pointer-events-none'
        }`}
      onMouseEnter={() => setHoveringDock(true)}
      onMouseLeave={() => setHoveringDock(false)}
    >
      <div className="rounded-[26px] border border-[color:var(--line-soft)] bg-[rgba(255,250,243,0.82)] p-3 shadow-card backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void toggle()}
            disabled={!hasTrack}
            className="inline-flex h-12 items-center gap-2 rounded-full border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.56)] px-4 text-sm tracking-[0.12em] text-[color:var(--ink-strong)] transition hover:border-[color:var(--line-strong)]"
          >
            {enabled ? <Pause className="h-4 w-4" /> : <Music2 className="h-4 w-4" />}
            丝竹
          </button>
          <div className="hidden items-center gap-2 rounded-full border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.48)] px-3 py-3 sm:flex">
            <Volume2 className="h-4 w-4 text-[color:var(--ink-faint)]" />
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(event) => setVolume(Number(event.target.value))}
              className="h-1.5 w-24 accent-[color:var(--accent)]"
            />
          </div>
        </div>
        {error ? <p className="mt-2 text-xs text-[color:var(--accent)]">{error}</p> : null}
      </div>
    </div>
  );
}
