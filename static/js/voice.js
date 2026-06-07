/** WebRTC voice chat (peer mesh via socket signaling) */
class VoiceChat {
  constructor(socket, roomId, myId) {
    this.socket = socket;
    this.roomId = roomId;
    this.myId = myId;
    this.peers = {};
    this.localStream = null;
    this.micOn = false;
    this.speakerOn = true;
    this.audioEls = {};
  }

  async enableMic() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false
      });
      this.micOn = true;
      return true;
    } catch (e) {
      console.warn('Mic permission denied', e);
      return false;
    }
  }

  async start(peerIds) {
    if (!this.localStream) {
      const ok = await this.enableMic();
      if (!ok) return false;
    }
    for (const pid of peerIds) {
      if (pid !== this.myId && !this.peers[pid]) {
        await this._callPeer(pid);
      }
    }
    this._listenSignals();
    return true;
  }

  _listenSignals() {
    this.socket.off('webrtc_signal');
    this.socket.on('webrtc_signal', async (data) => {
      if (data.from === this.myId) return;
      const from = data.from;
      if (data.type === 'offer') {
        const pc = this._createPC(from);
        await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.socket.emit('webrtc_signal', {
          room_id: this.roomId,
          target: from,
          type: 'answer',
          signal: answer
        });
      } else if (data.type === 'answer') {
        const pc = this.peers[from];
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
      } else if (data.type === 'ice') {
        const pc = this.peers[from];
        if (pc) await pc.addIceCandidate(new RTCIceCandidate(data.signal));
      }
    });
  }

  async _callPeer(targetId) {
    const pc = this._createPC(targetId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.socket.emit('webrtc_signal', {
      room_id: this.roomId,
      target: targetId,
      type: 'offer',
      signal: offer
    });
  }

  _createPC(peerId) {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    this.peers[peerId] = pc;

    if (this.localStream) {
      this.localStream.getTracks().forEach(t => pc.addTrack(t, this.localStream));
    }

    pc.ontrack = (e) => {
      if (!this.audioEls[peerId]) {
        const audio = document.createElement('audio');
        audio.autoplay = true;
        audio.id = `audio-${peerId}`;
        document.body.appendChild(audio);
        this.audioEls[peerId] = audio;
      }
      this.audioEls[peerId].srcObject = e.streams[0];
      this.audioEls[peerId].muted = !this.speakerOn;
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.socket.emit('webrtc_signal', {
          room_id: this.roomId,
          target: peerId,
          type: 'ice',
          signal: e.candidate
        });
      }
    };

    return pc;
  }

  toggleMic() {
    this.micOn = !this.micOn;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(t => { t.enabled = this.micOn; });
    }
    return this.micOn;
  }

  toggleSpeaker() {
    this.speakerOn = !this.speakerOn;
    Object.values(this.audioEls).forEach(a => { a.muted = !this.speakerOn; });
    return this.speakerOn;
  }

  stop() {
    Object.values(this.peers).forEach(pc => pc.close());
    this.peers = {};
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }
    Object.values(this.audioEls).forEach(a => a.remove());
    this.audioEls = {};
  }
}

window.VoiceChat = VoiceChat;