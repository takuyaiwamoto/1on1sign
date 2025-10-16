import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';

interface VideoPanelProps {
  remoteStream: MediaStream | null;
  localStream?: MediaStream | null;
  layout?: 'stack' | 'overlay';
  mutedLocal?: boolean;
  showLocalPreview?: boolean;
  className?: string;
}

export function VideoPanel({
  remoteStream,
  localStream = null,
  layout = 'overlay',
  mutedLocal = true,
  showLocalPreview = true,
  className
}: VideoPanelProps) {
  const remoteRef = useRef<HTMLVideoElement | null>(null);
  const localRef = useRef<HTMLVideoElement | null>(null);
  const [remoteNeedsPlay, setRemoteNeedsPlay] = useState(false);

  const attemptPlay = useCallback((video: HTMLVideoElement, onFail: () => void) => {
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch((error) => {
        console.warn('[video] autoplay failed', error);
        onFail();
      });
    }
  }, []);

  useEffect(() => {
    if (remoteRef.current && remoteStream) {
      if (remoteRef.current.srcObject !== remoteStream) {
        remoteRef.current.srcObject = remoteStream;
      }
      const video = remoteRef.current;
      const play = () => {
        attemptPlay(video, () => setRemoteNeedsPlay(true));
      };
      if (video.readyState >= 2) {
        play();
      } else {
        const handler = () => {
          play();
        };
        video.addEventListener('loadeddata', handler, { once: true });
        return () => video.removeEventListener('loadeddata', handler);
      }
    }
  }, [remoteStream, attemptPlay]);

  useEffect(() => {
    if (localRef.current && localStream) {
      if (localRef.current.srcObject !== localStream) {
        localRef.current.srcObject = localStream;
      }
      const video = localRef.current;
      const play = () => {
        attemptPlay(video, () => {
          // local preview can stay muted, so retry once silently
          setTimeout(() => attemptPlay(video, () => undefined), 0);
        });
      };
      if (video.readyState >= 2) {
        play();
      } else {
        const handler = () => play();
        video.addEventListener('loadeddata', handler, { once: true });
        return () => video.removeEventListener('loadeddata', handler);
      }
    }
  }, [localStream, attemptPlay]);

  useEffect(() => {
    if (!remoteStream) {
      setRemoteNeedsPlay(false);
    }
  }, [remoteStream]);

  const containerClass = clsx(
    layout === 'stack'
      ? 'flex h-full flex-col gap-3'
      : 'relative w-full h-full overflow-hidden bg-black',
    layout === 'overlay' && 'rounded-2xl',
    className
  );

  return (
    <div className={containerClass}>
      <video
        ref={remoteRef}
        className={
          layout === 'stack'
            ? 'w-full rounded-2xl bg-black aspect-video object-cover'
            : 'absolute inset-0 h-full w-full object-cover'
        }
        autoPlay
        playsInline
        controls={false}
        muted={false}
      />
      {remoteNeedsPlay && (
        <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-black/60">
          <button
            type="button"
            onClick={() => {
              if (remoteRef.current) {
                remoteRef.current
                  .play()
                  .then(() => setRemoteNeedsPlay(false))
                  .catch((error) => {
                    console.warn('[video] manual play failed', error);
                  });
              }
            }}
            className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-gray-900 shadow-lg"
          >
            タップして視聴開始
          </button>
        </div>
      )}

      {showLocalPreview && (
        <div
          className={
            layout === 'stack'
              ? 'w-full rounded-2xl bg-black aspect-video object-cover'
              : 'absolute bottom-4 right-4 h-28 w-20 overflow-hidden rounded-xl border border-white/40 shadow-lg'
          }
        >
          <video
            ref={localRef}
            className="h-full w-full object-cover"
            autoPlay
            muted={mutedLocal}
            playsInline
            controls={false}
          />
        </div>
      )}
    </div>
  );
}
