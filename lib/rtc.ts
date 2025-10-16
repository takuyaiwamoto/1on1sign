import { WEBRTC_CONFIG } from '../config/webrtc';
import type { IceCandidateInit, SessionDescription } from '../types/signaling';

interface PeerConnectionCallbacks {
  onIceCandidate?: (candidate: IceCandidateInit) => void;
  onTrack?: (stream: MediaStream) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
}

export function createPeerConnection(callbacks: PeerConnectionCallbacks = {}) {
  const pc = new RTCPeerConnection(WEBRTC_CONFIG);
  let composedStream: MediaStream | null = null;

  pc.onicecandidate = (event) => {
    if (event.candidate && callbacks.onIceCandidate) {
      const { candidate, sdpMid, sdpMLineIndex, usernameFragment } = event.candidate;
      callbacks.onIceCandidate({
        candidate,
        sdpMid: sdpMid ?? undefined,
        sdpMLineIndex: sdpMLineIndex ?? undefined,
        usernameFragment: usernameFragment ?? undefined
      });
    }
  };

  pc.ontrack = (event) => {
    if (callbacks.onTrack) {
      const [stream] = event.streams;
      if (stream) {
        composedStream = stream;
        callbacks.onTrack(stream);
        return;
      }

      if (!composedStream) {
        composedStream = new MediaStream();
      }
      composedStream.addTrack(event.track);
      callbacks.onTrack(composedStream);
    }
  };

  pc.onconnectionstatechange = () => {
    callbacks.onConnectionStateChange?.(pc.connectionState);
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      composedStream = null;
    }
  };

  return pc;
}

export async function createOffer(pc: RTCPeerConnection): Promise<SessionDescription> {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  return {
    type: offer.type ?? 'offer',
    sdp: offer.sdp ?? undefined
  };
}

export async function createAnswer(pc: RTCPeerConnection): Promise<SessionDescription> {
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  return {
    type: answer.type ?? 'answer',
    sdp: answer.sdp ?? undefined
  };
}

export async function acceptRemoteDescription(
  pc: RTCPeerConnection,
  description: SessionDescription
) {
  const current = pc.currentRemoteDescription?.type;
  if (current === description.type) {
    return;
  }
  await pc.setRemoteDescription(description);
}

export async function addIceCandidate(
  pc: RTCPeerConnection,
  candidate: IceCandidateInit
): Promise<void> {
  try {
    await pc.addIceCandidate(candidate);
  } catch (error) {
    // Ignore harmless errors triggered by late candidates after close.
    console.warn('Failed to add ICE candidate', error);
  }
}
