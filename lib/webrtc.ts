import { ICE_CONFIGURATION } from "@/config/webrtc";
import type { IceCandidate } from "@/types/signaling";

type NegotiationRole = "fan" | "talent";

type WebRtcOptions = {
  role: NegotiationRole;
  onIceCandidate: (candidate: IceCandidate) => void;
  onNegotiationNeeded: () => void;
  onRemoteStream: (stream: MediaStream) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
};

export class WebRtcClient {
  private pc?: RTCPeerConnection;
  private localStream?: MediaStream;
  private readonly pendingCandidates: IceCandidate[] = [];

  constructor(private readonly options: WebRtcOptions) {}

  getPeerConnection() {
    return this.pc;
  }

  ensurePeerConnection() {
    if (!this.pc) {
      this.pc = new RTCPeerConnection(ICE_CONFIGURATION);
      this.pc.onicecandidate = (event) => {
        if (event.candidate) {
          const { candidate, sdpMid, sdpMLineIndex, usernameFragment } = event.candidate;
          this.options.onIceCandidate({
            candidate,
            sdpMid,
            sdpMLineIndex,
            usernameFragment
          });
        }
      };

      this.pc.ontrack = (event) => {
        const [stream] = event.streams;
        if (stream) {
          this.options.onRemoteStream(stream);
        }
      };

      this.pc.onnegotiationneeded = () => {
        this.options.onNegotiationNeeded();
      };

      this.pc.onconnectionstatechange = () => {
        this.options.onConnectionStateChange?.(this.pc?.connectionState ?? "new");
      };

      if (this.localStream) {
        this.localStream.getTracks().forEach((track) => {
          this.pc?.addTrack(track, this.localStream!);
        });
      }
    }
    return this.pc;
  }

  async setLocalStream(stream: MediaStream) {
    this.localStream = stream;
    const pc = this.ensurePeerConnection();

    const senders = pc.getSenders();
    stream.getTracks().forEach((track) => {
      const existingSender = senders.find((sender) => sender.track?.kind === track.kind);
      if (existingSender) {
        existingSender.replaceTrack(track);
      } else {
        pc.addTrack(track, stream);
      }
    });
  }

  async createOffer(options?: RTCOfferOptions) {
    const pc = this.ensurePeerConnection();
    const offer = await pc.createOffer({ iceRestart: false, ...options });
    await pc.setLocalDescription(offer);
    return offer;
  }

  async createAnswer() {
    const pc = this.ensurePeerConnection();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    return answer;
  }

  async applyRemoteDescription(description: RTCSessionDescriptionInit) {
    const pc = this.ensurePeerConnection();
    if (pc.signalingState === "have-local-offer" && description.type === "offer") {
      await pc.setLocalDescription({ type: "rollback" } as RTCSessionDescriptionInit);
    }
    await pc.setRemoteDescription(description);
    await this.flushPendingCandidates();
  }

  async addIceCandidate(candidate: IceCandidate) {
    const pc = this.ensurePeerConnection();
    if (pc.remoteDescription) {
      await pc.addIceCandidate(candidate);
    } else {
      this.pendingCandidates.push(candidate);
    }
  }

  close() {
    if (this.pc) {
      this.pc.close();
      this.pc = undefined;
    }
  }

  private async flushPendingCandidates() {
    const pc = this.ensurePeerConnection();
    while (this.pendingCandidates.length > 0) {
      const candidate = this.pendingCandidates.shift();
      if (candidate) {
        await pc.addIceCandidate(candidate);
      }
    }
  }
}
