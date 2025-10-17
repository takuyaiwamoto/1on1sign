import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type VideoPanelProps = {
  stream: MediaStream | null;
  muted?: boolean;
  mirror?: boolean;
  label?: string;
  className?: string;
};

export function VideoPanel({ stream, muted = false, mirror = false, label, className }: VideoPanelProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [needsPlay, setNeedsPlay] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (stream) {
      if (video.srcObject !== stream) {
        video.srcObject = stream;
      }
      const play = async () => {
        try {
          await video.play();
          setNeedsPlay(false);
        } catch (error) {
          setNeedsPlay(true);
        }
      };
      play();
    } else {
      video.pause();
      video.srcObject = null;
      video.removeAttribute("src");
      video.load();
      setNeedsPlay(false);
    }
  }, [stream]);

  const handleManualPlay = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      await video.play();
      setNeedsPlay(false);
    } catch (error) {
      console.error("video play failed", error);
    }
  };

  return (
    <div className={cn("relative overflow-hidden rounded-xl bg-black shadow-md", className)}>
      <video
        ref={videoRef}
        muted={muted}
        playsInline
        autoPlay
        controls={false}
        className={`h-full w-full object-cover ${mirror ? "scale-x-[-1]" : ""}`}
      />
      {needsPlay && (
        <button
          type="button"
          onClick={handleManualPlay}
          className="absolute inset-0 flex items-center justify-center bg-black/60 text-white"
        >
          視聴を開始
        </button>
      )}
      {label ? (
        <div className="absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-xs text-white">
          {label}
        </div>
      ) : null}
    </div>
  );
}
