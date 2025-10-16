export interface RTCIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface RTCConfiguration {
  iceServers?: RTCIceServer[];
}
