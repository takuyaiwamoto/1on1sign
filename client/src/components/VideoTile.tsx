import { useEffect, useRef } from 'react';

interface VideoTileProps {
  stream: MediaStream | null;
  muted?: boolean;
  mirrored?: boolean;
  label?: string;
  placeholder?: string;
}

export function VideoTile({ stream, muted, mirrored, label, placeholder }: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
    const play = async () => {
      try {
        await video.play();
      } catch (error) {
        console.warn('Video playback deferred until user interaction', error);
      }
    };
    void play();
  }, [stream]);

  return (
    <div className="relative bg-slate-900 rounded-2xl overflow-hidden shadow ring-1 ring-slate-700">
      {label ? (
        <span className="absolute top-2 left-2 z-10 rounded-full bg-slate-900/80 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-100">
          {label}
        </span>
      ) : null}
      {stream ? (
        <video
          ref={videoRef}
          muted={muted}
          playsInline
          autoPlay
          className={`w-full h-full object-cover ${mirrored ? 'scale-x-[-1]' : ''}`}
        />
      ) : (
        <div className="flex h-full min-h-[180px] items-center justify-center text-sm text-slate-400">
          {placeholder ?? '映像待機中'}
        </div>
      )}
    </div>
  );
}
