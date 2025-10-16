import clsx from 'clsx';
import { useEffect, useRef } from 'react';

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

  useEffect(() => {
    if (remoteRef.current && remoteStream) {
      if (remoteRef.current.srcObject !== remoteStream) {
        remoteRef.current.srcObject = remoteStream;
      }
    }
  }, [remoteStream]);

  useEffect(() => {
    if (localRef.current && localStream) {
      if (localRef.current.srcObject !== localStream) {
        localRef.current.srcObject = localStream;
      }
    }
  }, [localStream]);

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
