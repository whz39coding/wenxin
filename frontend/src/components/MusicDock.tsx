import { useEffect, useRef, useState } from 'react';
import { Music2, Pause, SkipForward, Volume2 } from 'lucide-react';
import { Howl } from 'howler';

const audioModules = import.meta.glob('../assets/audio/*.{mp3,wav,ogg,m4a,aac,flac}', {
  eager: true,
  import: 'default',
  query: '?url',
}) as Record<string, string>;

const VOLUME_STORAGE_KEY = 'wenxin_music_volume';
const TRACK_INDEX_STORAGE_KEY = 'wenxin_music_track_index';

type TrackItem = {
  id: string;
  label: string;
  src: string;
};

function normalizeVolume(raw: string | null) {
  const parsed = Number(raw ?? '0.22');
  if (Number.isNaN(parsed)) {
    return 0.22;
  }
  return Math.min(1, Math.max(0, parsed));
}

function normalizeTrackIndex(raw: string | null, maxExclusive: number) {
  const parsed = Number(raw ?? '0');
  if (Number.isNaN(parsed) || parsed < 0) {
    return 0;
  }
  if (parsed >= maxExclusive) {
    return 0;
  }
  return Math.floor(parsed);
}

function buildBuiltinTracks(): TrackItem[] {
  return Object.entries(audioModules)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([path, url], index) => ({
      id: `builtin-${index}`,
      label: `内置 ${index + 1}`,
      src: url,
    }));
}

function useAmbientMusic() {
  const [enabled, setEnabled] = useState(false);
  const [volume, setVolume] = useState(() => normalizeVolume(window.localStorage.getItem(VOLUME_STORAGE_KEY)));
  const [error, setError] = useState('');
  const [tracks, setTracks] = useState<TrackItem[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [trackSourceLabel, setTrackSourceLabel] = useState('');
  const howlRef = useRef<Howl | null>(null);

  const hasTrack = tracks.length > 0;

  function cleanupHowl() {
    if (howlRef.current) {
      howlRef.current.unload();
      howlRef.current = null;
    }
  }

  function createHowl(track: TrackItem, autoplay: boolean) {
    cleanupHowl();

    const howl = new Howl({
      src: [track.src],
      html5: true,
      preload: true,
      loop: true,
      volume,
      onplay: () => {
        setEnabled(true);
        setError('');
      },
      onpause: () => setEnabled(false),
      onstop: () => setEnabled(false),
      onloaderror: () => {
        setEnabled(false);
        setError('当前音轨加载失败，请尝试切换下一首。');
      },
      onplayerror: () => {
        setEnabled(false);
        setError('浏览器阻止了自动播放，请再次点击播放按钮。');
      },
    });

    howlRef.current = howl;
    setTrackSourceLabel(track.label);

    if (autoplay) {
      howl.play();
    }
  }

  function switchTrack(nextIndex: number, autoplay: boolean) {
    if (!tracks.length) {
      return;
    }
    const normalized = ((nextIndex % tracks.length) + tracks.length) % tracks.length;
    setCurrentTrackIndex(normalized);
    window.localStorage.setItem(TRACK_INDEX_STORAGE_KEY, String(normalized));
    createHowl(tracks[normalized], autoplay);
  }

  useEffect(() => {
    const builtins = buildBuiltinTracks();

    if (!builtins.length) {
      setError('未检测到音频文件，请将 mp3/wav 放入 src/assets/audio。');
      setTracks([]);
      return () => {
        cleanupHowl();
      };
    }

    setTracks(builtins);
    const savedIndex = normalizeTrackIndex(
      window.localStorage.getItem(TRACK_INDEX_STORAGE_KEY),
      builtins.length,
    );
    setCurrentTrackIndex(savedIndex);
    createHowl(builtins[savedIndex], false);

    return () => {
      cleanupHowl();
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(VOLUME_STORAGE_KEY, String(volume));
  }, [volume]);

  async function toggle() {
    const howl = howlRef.current;
    if (!howl) {
      return;
    }

    if (howl.playing()) {
      howl.pause();
      setEnabled(false);
      return;
    }

    try {
      howl.play();
      setEnabled(true);
      setError('');
    } catch {
      setEnabled(false);
      setError('播放失败，请确认音频文件可用，或与页面交互后再试。');
    }
  }

  function switchNextTrack() {
    if (!tracks.length) {
      return;
    }
    const shouldAutoplay = howlRef.current?.playing() ?? false;
    switchTrack(currentTrackIndex + 1, shouldAutoplay);
  }

  useEffect(() => {
    if (howlRef.current) {
      howlRef.current.volume(volume);
    }
  }, [volume]);

  return { enabled, volume, setVolume, toggle, switchNextTrack, error, hasTrack, trackSourceLabel };
}

export default function MusicDock() {
  const { enabled, volume, setVolume, toggle, switchNextTrack, error, hasTrack, trackSourceLabel } = useAmbientMusic();
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
        {!error && hasTrack ? <p className="mt-2 text-xs text-[color:var(--ink-faint)]">音源：{trackSourceLabel}</p> : null}
      </div>
    </div>
  );
}
