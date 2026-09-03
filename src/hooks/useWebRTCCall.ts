import { useState, useRef, useEffect } from 'react';
import { Alert } from 'react-native';
import { CallState, UserProfile, ChatThread } from '../types';
import { generateCallSasWords } from '../utils/crypto';
import { callAudio } from '../utils/callAudio';
import { webrtcCallEngine } from '../utils/webrtcCall';
import { requestSinglePermission } from '../utils/permissions';
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

  const handleCallConnectionStateChange = (state: string) => {
    console.log('[Call] connection state:', state);
    if (state === 'failed') {
      setCallState(prev => ({ ...prev, isReconnecting: false }));
      Alert.alert('Call Disconnected', 'The connection was lost and could not be recovered.');
      handleHangupCall();
      return;
    }
    setCallState(prev => ({ ...prev, isReconnecting: state === 'disconnected' }));
  };

  const handleStartCall = async (type: 'audio' | 'video') => {
    if (!activeChatId || !currentUser || !mySecretKey) return;
    if (callState.active) return;
    const activeChat = chats.find(c => c.id === activeChatId);
    if (!activeChat) return;

    if (!webrtcCallEngine.isSupported()) {
      Alert.alert(
        'Development Build Required',
        'WebRTC real-time voice and video calling requires native code (not included in standard Expo Go).\n\nPlease run "npx expo run:android" or "npx expo run:ios" to test calling.'
      );
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

    const sas = await generateCallSasWords(mySecretKey, activeChat.participant.publicKey, Date.now());
    const callId = `call_${Date.now()}_${currentUser.id}`;
    activeCallIdRef.current = callId;

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

    callAudio.playConnected();
    callAudio.releaseAudioSession();
    setCallState(prev => ({ ...prev, status: 'connected' }));
    startCallTimer();

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
    stopCallTimer();
    callAudio.playHangup();

    const pending = pendingIncomingCallRef.current;
    if (pending && callState.isIncoming && callState.status === 'ringing' && currentUser) {
      webrtcCallEngine.rejectIncoming(currentUser.id, pending.senderId, pending.callId, callState.type);
    } else {
      webrtcCallEngine.endCall();
    }

    setLocalStream(null);
    setRemoteStream(null);
    pendingIncomingCallRef.current = null;
    activeCallIdRef.current = null;
    onLogCallToChat(callStateRef.current, 'missed');
    setCallState(prev => ({ ...prev, active: false, status: 'ended', duration: 0 }));
  };

  const handleToggleMute = () => {
    setCallState(prev => {
      const nextMute = !prev.isMuted;
      webrtcCallEngine.setMuted(nextMute);
      return { ...prev, isMuted: nextMute };
    });
  };

  const handleToggleVideo = () => {
    setCallState(prev => {
      const nextVideoOff = !prev.isVideoOff;
      webrtcCallEngine.setVideoEnabled(!nextVideoOff);
      return { ...prev, isVideoOff: nextVideoOff };
    });
  };

  const handleToggleSpeaker = () => {
    setCallState(prev => {
      const nextSpeaker = !prev.isSpeakerOn;
      webrtcCallEngine.setSpeakerEnabled(nextSpeaker);
      return { ...prev, isSpeakerOn: nextSpeaker };
    });
  };

  const handleFlipCamera = () => {
    setCallState(prev => ({ ...prev, isFrontCamera: !prev.isFrontCamera }));
  };

  const resetCallState = () => {
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
