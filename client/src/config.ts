const deriveDefaultServerOrigin = () => {
  const current = new URL(window.location.href);
  const protocol = import.meta.env.VITE_SERVER_PROTOCOL ?? (current.protocol === 'https:' ? 'https:' : 'http:');
  const host = import.meta.env.VITE_SERVER_HOST ?? current.hostname;
  const port = import.meta.env.VITE_SERVER_PORT ?? '4000';
  return `${protocol}//${host}:${port}`;
};

export const config = {
  serverOrigin: import.meta.env.VITE_SERVER_ORIGIN ?? deriveDefaultServerOrigin(),
  signalingPath: import.meta.env.VITE_SIGNALING_PATH ?? '/ws',
  iceServers: (() => {
    try {
      const parsed = import.meta.env.VITE_ICE_SERVERS ? JSON.parse(import.meta.env.VITE_ICE_SERVERS) : undefined;
      if (Array.isArray(parsed)) return parsed;
    } catch (error) {
      console.warn('Failed to parse VITE_ICE_SERVERS', error);
    }
    return undefined;
  })(),
  strokeBufferMs: Number(import.meta.env.VITE_STROKE_BUFFER_MS ?? 100)
};
