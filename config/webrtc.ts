function parseTurnServers(): RTCIceServer[] {
  const urlsRaw = (process.env.NEXT_PUBLIC_TURN_URLS ?? "").trim();
  if (!urlsRaw) {
    return [];
  }
  const urls = urlsRaw
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  if (urls.length === 0) {
    return [];
  }
  return [
    {
      urls,
      username: process.env.NEXT_PUBLIC_TURN_USERNAME ?? undefined,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL ?? undefined
    }
  ];
}

export const ICE_SERVERS: RTCIceServer[] = [
  {
    urls: ["stun:stun.l.google.com:19302"]
  },
  ...parseTurnServers()
];

export const ICE_CONFIGURATION: RTCConfiguration = {
  iceServers: ICE_SERVERS,
  iceCandidatePoolSize: 2
};
