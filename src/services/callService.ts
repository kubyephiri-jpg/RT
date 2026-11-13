import AgoraRTC, { type IAgoraRTCClient, type ILocalAudioTrack } from 'agora-rtc-sdk-ng';
import { auth } from '../config/firebase';

const API_BASE = 'https://aletwend-render-backend.onrender.com/api/calls';

export type MicError = 'denied' | 'unsupported' | 'unavailable';
export const MIC_BLOCKED_MESSAGE = 'Microphone is blocked for this site. Tap the lock icon in the address bar, set Microphone to Allow, then reload.';

export interface ActiveCall {
  leave: () => Promise<void>;
  setMuted: (muted: boolean) => Promise<void>;
  micAvailable: boolean;
  micError: MicError | null;
  enableMicrophone: () => Promise<MicError | null>;
}

export interface CallCredentials {
  callId?: string;
  channel: string;
  appId: string;
  token: string;
  uid: string | number | null;
}

async function request<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in to call');
  const token = await user.getIdToken();
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as { success?: boolean; error?: string } & T;
  if (!response.ok || data.success === false) throw new Error(data.error || `Call request failed (${response.status})`);
  return data;
}

export const startCall = (orderId: string) => request<CallCredentials>('/start', { orderId });
export const acceptCall = (callId: string) => request<CallCredentials>('/accept', { callId });
export const declineCall = (callId: string) => request<{ success: boolean }>('/decline', { callId });
export const endCall = (callId: string, reason?: string) => request<{ success: boolean }>('/end', { callId, ...(reason ? { reason } : {}) });

export async function getMicPermissionState(): Promise<'granted' | 'prompt' | 'denied' | 'unsupported'> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' ||
    !window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    return 'unsupported';
  }
  if (!navigator.permissions?.query) return 'prompt';
  try {
    const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return permission.state === 'granted' || permission.state === 'denied' ? permission.state : 'prompt';
  } catch {
    return 'prompt';
  }
}

function getMicError(error: unknown): MicError {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' ||
    !window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    return 'unsupported';
  }
  const errorName = error && typeof error === 'object' && 'name' in error
    ? String((error as { name?: unknown }).name)
    : '';
  if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') return 'denied';
  return 'unavailable';
}

export async function primeMicrophone(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    return true;
  } catch {
    return false;
  }
}

export async function joinChannel(
  credentials: CallCredentials,
  onRemoteAudio?: () => void,
): Promise<ActiveCall> {
  const client: IAgoraRTCClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
  let localAudioTrack: ILocalAudioTrack | null = null;
  let micAvailable = false;
  let micError: MicError | null = null;
  let microphonePublished = false;
  try {
    localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
  } catch (firstError) {
    try {
      // The WebView can need a moment after Android grants the permission: try once more.
      await new Promise((resolve) => setTimeout(resolve, 800));
      localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
    } catch (error) {
      // Still join so the caller can hear remote audio without a local microphone.
      console.warn('Could not create microphone track:', firstError, error);
      micError = getMicError(error);
    }
  }
  let left = false;
  // Play the other person's voice. Retried because a WebView can refuse the first play().
  const playRemote = (user: any) => {
    try {
      const track = user?.audioTrack;
      if (!track) return;
      track.setVolume?.(100);
      Promise.resolve(track.play()).catch(() => undefined);
    } catch { /* the track may be gone while the call ends */ }
  };
  const playAllRemote = () => client.remoteUsers.forEach(playRemote);
  // If the browser blocked audio until a tap, start it on the next touch.
  (AgoraRTC as any).onAutoplayFailed = () => {
    const resume = () => { playAllRemote(); window.removeEventListener('touchstart', resume); window.removeEventListener('click', resume); };
    window.addEventListener('touchstart', resume, { once: true });
    window.addEventListener('click', resume, { once: true });
  };
  client.on('user-published', async (user, mediaType) => {
    try { await client.subscribe(user, mediaType); } catch (e) { console.warn('subscribe failed', e); return; }
    if (mediaType === 'audio' && user.audioTrack) {
      playRemote(user);
      setTimeout(() => playRemote(user), 1000);
      onRemoteAudio?.();
    }
  });
  // If the app was in the background (e.g. answered from the lock screen) the microphone can
  // come back silent. Rebuild it when the screen is visible again.
  const refreshMic = async () => {
    try {
      if (!localAudioTrack || !microphonePublished) return;
      const raw = localAudioTrack.getMediaStreamTrack();
      if (raw.readyState === 'ended' || raw.muted) {
        const old = localAudioTrack;
        await client.unpublish([old]).catch(() => undefined);
        old.close();
        localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        await client.publish([localAudioTrack]);
      }
    } catch (e) { console.warn('mic refresh failed', e); }
  };
  const onVisible = () => { if (document.visibilityState === 'visible') { void refreshMic(); playAllRemote(); } };
  document.addEventListener('visibilitychange', onVisible);
  try {
    await client.join(credentials.appId, credentials.channel, credentials.token, credentials.uid);
    if (localAudioTrack) {
      await client.publish([localAudioTrack]);
      microphonePublished = true;
      micAvailable = true;
    }
    // Pick up anyone who was already publishing before we joined.
    for (const u of client.remoteUsers) {
      if (u.hasAudio) { try { await client.subscribe(u, 'audio'); playRemote(u); } catch { /* next event retries */ } }
    }
    setTimeout(() => { void refreshMic(); playAllRemote(); }, 1500);
    setTimeout(() => { void refreshMic(); playAllRemote(); }, 4000);
  } catch (error) {
    document.removeEventListener('visibilitychange', onVisible);
    localAudioTrack?.close();
    await client.leave().catch(() => undefined);
    throw error;
  }
  return {
    micAvailable,
    micError,
    enableMicrophone: async () => {
      if (micAvailable && localAudioTrack) return null;
      try {
        localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        await client.publish([localAudioTrack]);
        microphonePublished = true;
        micAvailable = true;
        micError = null;
        return null;
      } catch (error) {
        console.warn('Could not enable microphone:', error);
        localAudioTrack?.close();
        localAudioTrack = null;
        microphonePublished = false;
        micAvailable = false;
        micError = getMicError(error);
        return micError;
      }
    },
    setMuted: async (muted) => {
      if (localAudioTrack && microphonePublished) await localAudioTrack.setEnabled(!muted);
    },
    leave: async () => {
      if (left) return;
      left = true;
      document.removeEventListener('visibilitychange', onVisible);
      localAudioTrack?.close();
      await client.leave();
    },
  };
}

export default joinChannel;
