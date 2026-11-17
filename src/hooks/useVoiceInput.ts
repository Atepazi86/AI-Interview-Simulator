import { useCallback, useEffect, useRef, useState } from 'react';
import { InterviewLanguage } from '../types';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

interface UseVoiceInputOptions {
  language: InterviewLanguage;
  autoSendEnabled: boolean;
  autoSendDelayMs?: number;
  paused: boolean; // true when AI is speaking or evaluating
  onAutoSend: (text: string) => void;
}

export function useVoiceInput({
  language,
  autoSendEnabled,
  autoSendDelayMs = 2500,
  paused,
  onAutoSend,
}: UseVoiceInputOptions) {
  const isSupported = Boolean(getSpeechRecognitionCtor());

  const [isMicOn, setIsMicOn] = useState(false);
  const [finalTranscript, setFinalTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [countdownMs, setCountdownMs] = useState<number | null>(null);
  const [audioBars, setAudioBars] = useState<number[]>(Array(12).fill(8));

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const isMicOnRef = useRef(false);
  const pausedRef = useRef(paused);
  const autoSendEnabledRef = useRef(autoSendEnabled);
  const onAutoSendRef = useRef(onAutoSend);

  const finalRef = useRef('');
  const interimRef = useRef('');
  const lastSpeechAtRef = useRef<number | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    autoSendEnabledRef.current = autoSendEnabled;
  }, [autoSendEnabled]);

  useEffect(() => {
    onAutoSendRef.current = onAutoSend;
  }, [onAutoSend]);

  const stopAudioMeter = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setAudioBars(Array(12).fill(8));
  }, []);

  const startAudioMeter = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!streamRef.current) return;
        analyser.getByteFrequencyData(data);
        const bars: number[] = [];
        for (let i = 0; i < 12; i++) {
          const val = data[i + 1] || 0;
          const heightPct = pausedRef.current ? 8 : Math.max(8, Math.min(100, Math.round((val / 200) * 100)));
          bars.push(heightPct);
        }
        setAudioBars(bars);
        animFrameRef.current = requestAnimationFrame(tick);
      };
      animFrameRef.current = requestAnimationFrame(tick);
    } catch {
      // Mic meter optional if SpeechRecognition handles audio directly
    }
  }, []);

  const clearDraft = useCallback(() => {
    finalRef.current = '';
    interimRef.current = '';
    lastSpeechAtRef.current = null;
    setFinalTranscript('');
    setInterimTranscript('');
    setCountdownMs(null);
  }, []);

  const stopRecognitionInstance = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.stop();
      } catch {
        // Ignore stop errors
      }
      recognitionRef.current = null;
    }
  }, []);

  const startRecognitionInstance = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor || pausedRef.current || !isMicOnRef.current) return;

    stopRecognitionInstance();

    try {
      const recognition = new Ctor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = language === 'id' ? 'id-ID' : 'en-US';

      recognition.onresult = (event: SpeechRecognitionEventLike) => {
        if (pausedRef.current) return;
        let newFinal = finalRef.current;
        let newInterim = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const piece = event.results[i][0]?.transcript || '';
          if (event.results[i].isFinal) {
            newFinal = `${newFinal} ${piece}`.replace(/\s+/g, ' ').trim();
          } else {
            newInterim += piece;
          }
        }

        finalRef.current = newFinal;
        interimRef.current = newInterim.trim();
        setFinalTranscript(finalRef.current);
        setInterimTranscript(interimRef.current);
        lastSpeechAtRef.current = Date.now();
        setSpeechError(null);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
        if (event.error === 'no-speech' || event.error === 'aborted') {
          return;
        }
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setSpeechError(
            language === 'id'
              ? 'Izin mikrofon ditolak oleh browser. Aktifkan izin mikrofon atau gunakan panel chat teks.'
              : 'Microphone permission denied. Allow microphone access or use the text chat drawer.',
          );
          isMicOnRef.current = false;
          setIsMicOn(false);
          stopAudioMeter();
        }
      };

      recognition.onend = () => {
        if (isMicOnRef.current && !pausedRef.current) {
          setTimeout(() => {
            if (isMicOnRef.current && !pausedRef.current) {
              startRecognitionInstance();
            }
          }, 180);
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch {
      setSpeechError(
        language === 'id'
          ? 'Gagal memulai pengenalan suara. Coba klik mic lagi atau ketik lewat panel teks.'
          : 'Unable to start speech recognition. Try toggling the mic or typing in the chat drawer.',
      );
    }
  }, [language, stopAudioMeter, stopRecognitionInstance]);

  // Pause/resume SpeechRecognition automatically when AI speaks or thinks
  useEffect(() => {
    if (paused) {
      stopRecognitionInstance();
      lastSpeechAtRef.current = null;
      setCountdownMs(null);
    } else if (isMicOnRef.current) {
      startRecognitionInstance();
    }
  }, [paused, startRecognitionInstance, stopRecognitionInstance]);

  // Auto-send silence detector (2.5 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      if (
        !autoSendEnabledRef.current ||
        pausedRef.current ||
        !isMicOnRef.current ||
        lastSpeechAtRef.current === null
      ) {
        setCountdownMs(null);
        return;
      }

      const combined = `${finalRef.current} ${interimRef.current}`.trim();
      if (!combined) {
        setCountdownMs(null);
        return;
      }

      const elapsed = Date.now() - lastSpeechAtRef.current;
      const remaining = autoSendDelayMs - elapsed;

      if (remaining <= 0) {
        const toSend = combined;
        clearDraft();
        onAutoSendRef.current(toSend);
      } else {
        setCountdownMs(remaining);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [autoSendDelayMs, clearDraft]);

  const toggleMic = useCallback(async () => {
    if (isMicOnRef.current) {
      isMicOnRef.current = false;
      setIsMicOn(false);
      stopRecognitionInstance();
      stopAudioMeter();
      setCountdownMs(null);
      return;
    }

    setSpeechError(null);
    isMicOnRef.current = true;
    setIsMicOn(true);
    await startAudioMeter();
    if (!pausedRef.current) {
      startRecognitionInstance();
    }
  }, [startAudioMeter, startRecognitionInstance, stopAudioMeter, stopRecognitionInstance]);

  const turnOffMic = useCallback(() => {
    isMicOnRef.current = false;
    setIsMicOn(false);
    stopRecognitionInstance();
    stopAudioMeter();
    clearDraft();
  }, [clearDraft, stopAudioMeter, stopRecognitionInstance]);

  useEffect(() => {
    return () => {
      isMicOnRef.current = false;
      stopRecognitionInstance();
      stopAudioMeter();
    };
  }, [stopAudioMeter, stopRecognitionInstance]);

  const combinedTranscript = `${finalTranscript} ${interimTranscript}`.trim();

  return {
    isSupported,
    isMicOn,
    finalTranscript,
    interimTranscript,
    combinedTranscript,
    speechError,
    countdownMs,
    audioBars,
    toggleMic,
    turnOffMic,
    clearDraft,
  };
}
