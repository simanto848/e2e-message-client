import { useState, useRef, useEffect } from 'react';
import { Alert } from 'react-native';
import { CallState, UserProfile, ChatThread } from '../types';
import { generateCallSasWords } from '../utils/crypto';
import { callAudio } from '../utils/callAudio';
import { webrtcCallEngine } from '../utils/webrtcCall';
import { requestSinglePermission } from '../utils/permissions';
import { notificationService } from '../services/notificationService';
import { socketService } from '../services/socket';
import type { MediaStream } from '../utils/webrtcAdapter';

interface UseWebRTCCallOptions {
  currentUser: UserProfile | null;
  mySecretKey: string | null;
  activeChatId: string | null;
  chats: ChatThread[];
  onLogCallToChat: (callState: CallState, status: 'completed' | 'missed' | 'declined') => void;
}

export function useWebRTCCall({
  currentUser,
  mySecretKey,
  activeChatId,
  chats,
  onLogCallToChat,
}: UseWebRTCCallOptions) {
  const [callState, setCallState] = useState<CallState>({
    active: false,
    type: 'audio',
    status: 'ended',
    isIncoming: false,
    isMuted: false,
    isVideoOff: false,
    isSpeakerOn: true,
    isFrontCamera: true,
    duration: 0,
    sasVerificationWords: [],
    isReconnecting: false,
  });

  const callStateRef = useRef<CallState>(callState);
  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const activeCallIdRef = useRef<string | null>(null);
  const pendingIncomingCallRef = useRef<any>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Call-health supervision: without this a call whose ICE never connects
  // sits there with a running timer and dead silence (the exact reported
  // bug), and a mid-call path death just freezes instead of recovering.
  const mediaWatchdogRef = useRef<NodeJS.Timeout | null>(null);
  const restartTimerRef = useRef<NodeJS.Timeout | null>(null);
  const restartAttemptsRef = useRef(0);
  const MEDIA_WATCHDOG_MS = 25000;
  const MAX_ICE_RESTARTS = 2;

  const clearCallHealthTimers = () => {
    if (mediaWatchdogRef.current) {
      clearTimeout(mediaWatchdogRef.current);
      mediaWatchdogRef.current = null;
    }
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  };

  // Latest-hangup ref so watchdog/restart timers (which outlive renders)
  // always invoke current logic instead of a stale closure.
  const hangupRef = useRef(() => {});
  const failCallRef = useRef((title: string, message: string) => {});

  const startCallTimer = () => {
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    callTimerRef.current = setInterval(() => {
      setCallState(prev => (prev.active ? { ...prev, duration: prev.duration + 1 } : prev));
    }, 1000);
  };

  const stopCallTimer = () => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopCallTimer();
      clearCallHealthTimers();
      if (callStateRef.current.active) {
        webrtcCallEngine.endCall(callStateRef.current.type);
      }
    };
  }, []);

  // No-media watchdog: once the UI says "connected" (offer answered), the
  // ICE path must actually establish. If it doesn't within the window, tell
  // the user plainly instead of leaving a silent call with a running timer.
  useEffect(() => {
    if (!callState.active || callState.status !== 'connected') return;
    if (mediaWatchdogRef.current) clearTimeout(mediaWatchdogRef.current);
    mediaWatchdogRef.current = setTimeout(() => {
      mediaWatchdogRef.current = null;
      if (!callStateRef.current.active) return;
      const pcState = webrtcCallEngine.getConnectionState();
      webrtcCallEngine.logMediaDiagnostics('[Call] Media watchdog');
      if (pcState !== 'connected') {
        failCallRef.current(
          'No Audio Path',
          'The call connected but no voice path could be established (usually NAT/firewall blocking peer-to-peer — a working TURN relay is required). Check your connection and TURN settings, then try again.'
        );
      }
    }, MEDIA_WATCHDOG_MS);
    return () => {
      if (mediaWatchdogRef.current) {
        clearTimeout(mediaWatchdogRef.current);
        mediaWatchdogRef.current = null;
      }
    };
  }, [callState.active, callState.status]);

  const handleCallConnectionStateChange = (state: string) => {
    if (__DEV__) {
      console.log('[Call] connection state:', state);
    }
    if (state === 'connected') {
      // Media path is live: stand down all recovery, clear the watchdog.
      restartAttemptsRef.current = 0;
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
      if (mediaWatchdogRef.current) {
        clearTimeout(mediaWatchdogRef.current);
        mediaWatchdogRef.current = null;
      }
      webrtcCallEngine.logMediaDiagnostics('[Call] Connected');
      setCallState(prev => ({ ...prev, isReconnecting: false }));
      return;
    }
    if (state === 'disconnected') {
      // Transient path loss (handover/NAT rebinding): try an ICE restart
      // before giving up, instead of freezing in silence.
      setCallState(prev => ({ ...prev, isReconnecting: true }));
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      restartTimerRef.current = setTimeout(async () => {
        restartTimerRef.current = null;
        if (!callStateRef.current.active) return;
        if (webrtcCallEngine.getConnectionState() === 'connected') {
          setCallState(prev => ({ ...prev, isReconnecting: false }));
          return;
        }
        if (restartAttemptsRef.current >= MAX_ICE_RESTARTS || !socketService.isConnected()) {
          // Out of retries (or no signaling to renegotiate over) — the media
          // watchdog will end the call with an explanation if needed.
          return;
        }
        restartAttemptsRef.current += 1;
        try {
          await webrtcCallEngine.restartIce();
        } catch (err) {
          console.warn('[Call] ICE restart failed:', err);
        }
      }, 2500);
      return;
    }
    if (state === 'failed') {
      clearCallHealthTimers();
      setCallState(prev => ({ ...prev, isReconnecting: false }));
      Alert.alert('Call Disconnected', 'The connection was lost and could not be recovered.');
      handleHangupCall();
      return;
    }
    setCallState(prev => ({ ...prev, isReconnecting: state === 'disconnected' }));
  };

  const handleStartCall = async (type: 'audio' | 'video') => {
    if (!currentUser || !activeChatId || !mySecretKey) return;
    const activeChat = chats.find(c => c.id === activeChatId);
    if (!activeChat) return;

    if (!webrtcCallEngine.isSupported()) {
      Alert.alert(
        'Development Build Required',
        'WebRTC real-time voice and video calling requires native code (not included in standard Expo Go).\n\nPlease run "npx expo run:android" or "npx expo run:ios" to test calling.'
      );
      return;
    }

    // Never start a call the peer can never hear about: the offer is only
    // sent over a live socket (offline offers are dropped, not queued), so
    // without this the UI would ring forever in silence.
    if (!socketService.isConnected()) {
      Alert.alert('Not Connected', 'No live connection to deliver the call. Check your network and try again.');
      return;
    }

    const micGranted = await requestSinglePermission('microphone');
    if (!micGranted) {
      Alert.alert('Microphone Access Needed', 'JABY needs microphone access to place voice and video calls.');
      return;
    }
    if (type === 'video') {
      const camGranted = await requestSinglePermission('camera');
      if (!camGranted) {
        Alert.alert('Camera Access Needed', 'JABY needs camera access for video calls.');
        return;
      }
    }

    const callTimestamp = Date.now();
    const sas = await generateCallSasWords(mySecretKey, activeChat.participant.publicKey, callTimestamp);
    const randomNonce = Math.random().toString(36).slice(2, 9);
    const callId = `call_${callTimestamp}_${currentUser.id}_${randomNonce}`;
    activeCallIdRef.current = callId;
    restartAttemptsRef.current = 0;
    clearCallHealthTimers();

    callAudio.playRingtone();

    setCallState({
      active: true,
      type,
      status: 'ringing',
      remoteUser: activeChat.participant,
      isIncoming: false,
      isMuted: false,
      isVideoOff: false,
      isSpeakerOn: true,
      isFrontCamera: true,
      duration: 0,
      sasVerificationWords: sas,
      isReconnecting: false,
    });

    try {
      await webrtcCallEngine.startCall(
        currentUser.id,
        activeChat.participant.id,
        callId,
        type === 'video',
        {
          onRemoteStream: stream => setRemoteStream(stream),
          onConnectionStateChange: handleCallConnectionStateChange,
        },
        true
      );
      setLocalStream(webrtcCallEngine.getLocalStream());
    } catch (err) {
      console.error('[Call] Failed to start call:', err);
      Alert.alert('Call Failed', 'Could not access the microphone/camera, or the connection failed to establish.');
      handleHangupCall();
    }
  };

  const handleAcceptIncomingCall = async () => {
    if (!currentUser || !callState.remoteUser) return;
    if (!webrtcCallEngine.isSupported()) {
      Alert.alert(
        'Development Build Required',
        'WebRTC real-time voice and video calling requires native code (not included in standard Expo Go).\n\nPlease run "npx expo run:android" or "npx expo run:ios" to test calling.'
      );
      handleHangupCall();
      return;
    }
    const pending = pendingIncomingCallRef.current;
    if (!pending) {
      Alert.alert('Call Error', 'The incoming call offer expired. Ask the caller to try again.');
      handleHangupCall();
      return;
    }

    const micGranted = await requestSinglePermission('microphone');
    if (!micGranted) {
      Alert.alert('Microphone Access Needed', 'JABY needs microphone access to answer calls.');
      handleHangupCall();
      return;
    }
    if (callState.type === 'video') {
      const camGranted = await requestSinglePermission('camera');
      if (!camGranted) {
        Alert.alert('Camera Access Needed', 'JABY needs camera access for video calls.');
        handleHangupCall();
        return;
      }
    }

    activeCallIdRef.current = pending.callId;
    restartAttemptsRef.current = 0;
    clearCallHealthTimers();
    await callAudio.stopAudio();
    notificationService.cancelCallNotification().catch(() => {});

    try {
      await webrtcCallEngine.acceptCall(
        currentUser.id,
        callState.remoteUser.id,
        pending.callId,
        callState.type === 'video',
        pending.sdp,
        {
          onRemoteStream: stream => setRemoteStream(stream),
          onConnectionStateChange: handleCallConnectionStateChange,
        },
        callState.isSpeakerOn
      );
      setCallState(prev => ({ ...prev, status: 'connected' }));
      startCallTimer();
      setLocalStream(webrtcCallEngine.getLocalStream());
    } catch (err) {
      console.error('[Call] Failed to accept call:', err);
      Alert.alert('Call Failed', 'Could not access the microphone/camera.');
      handleHangupCall();
    } finally {
      pendingIncomingCallRef.current = null;
    }
  };

  const handleHangupCall = () => {
    notificationService.cancelCallNotification().catch(() => {});
    stopCallTimer();
    clearCallHealthTimers();
    restartAttemptsRef.current = 0;

    const currentCall = callStateRef.current;
    const pending = pendingIncomingCallRef.current;
    if (pending && currentCall.isIncoming && currentCall.status === 'ringing' && currentUser) {
      webrtcCallEngine.rejectIncoming(currentUser.id, pending.senderId, pending.callId, currentCall.type);
    } else {
      webrtcCallEngine.endCall(currentCall.type);
    }
    callAudio.playHangup();

    setLocalStream(null);
    setRemoteStream(null);
    pendingIncomingCallRef.current = null;
    const finalReason = currentCall.status === 'connected' || currentCall.duration > 0
      ? 'completed'
      : (currentCall.isIncoming ? 'declined' : 'missed');
    onLogCallToChat(currentCall, finalReason);
    setCallState(prev => ({ ...prev, active: false, status: 'ended', duration: 0 }));
  };

  const handleToggleMute = () => {
    const nextMute = !callStateRef.current.isMuted;
    webrtcCallEngine.setMuted(nextMute);
    setCallState(prev => ({ ...prev, isMuted: nextMute }));
  };

  const handleToggleVideo = () => {
    const nextVideoOff = !callStateRef.current.isVideoOff;
    webrtcCallEngine.setVideoEnabled(!nextVideoOff);
    setCallState(prev => ({ ...prev, isVideoOff: nextVideoOff }));
  };

  const handleToggleSpeaker = () => {
    const nextSpeaker = !callStateRef.current.isSpeakerOn;
    webrtcCallEngine.setSpeakerEnabled(nextSpeaker);
    setCallState(prev => ({ ...prev, isSpeakerOn: nextSpeaker }));
  };

  const handleFlipCamera = () => {
    webrtcCallEngine.switchCamera();
    setCallState(prev => ({ ...prev, isFrontCamera: !prev.isFrontCamera }));
  };

  const resetCallState = () => {
    clearCallHealthTimers();
    restartAttemptsRef.current = 0;
    setCallState({
      active: false,
      type: 'audio',
      status: 'ended',
      isIncoming: false,
      isMuted: false,
      isVideoOff: false,
      isSpeakerOn: true,
      isFrontCamera: true,
      duration: 0,
      sasVerificationWords: [],
      isReconnecting: false,
    });
  };

  // Keep timer callbacks pointed at the latest logic (defined above).
  hangupRef.current = handleHangupCall;
  failCallRef.current = (title: string, message: string) => {
    Alert.alert(title, message);
    handleHangupCall();
  };

  return {
    callState,
    setCallState,
    callStateRef,
    localStream,
    setLocalStream,
    remoteStream,
    setRemoteStream,
    activeCallIdRef,
    pendingIncomingCallRef,
    startCallTimer,
    stopCallTimer,
    handleStartCall,
    handleAcceptIncomingCall,
    handleHangupCall,
    handleToggleMute,
    handleToggleVideo,
    handleToggleSpeaker,
    handleFlipCamera,
    resetCallState,
    handleCallConnectionStateChange,
  };
}
