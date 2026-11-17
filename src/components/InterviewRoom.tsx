import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  Captions,
  Check,
  Loader2,
  MessageSquareText,
  Mic,
  MicOff,
  PhoneOff,
  RotateCcw,
  Send,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  INTERVIEWER_PROFILES,
  InterviewConfig,
  TranscriptMessage,
} from '../types';
import { getCopy } from '../utils/i18n';
import { speakText, stopSpeaking } from '../utils/speechService';
import { useVoiceInput } from '../hooks/useVoiceInput';

type RoomStatus = 'speaking' | 'listening' | 'thinking' | 'idle';

interface InterviewRoomProps {
  config: InterviewConfig;
  initialMessage: {
    spokenResponse: string;
    topic: string;
    questionNumber: number;
  };
  onCompleteInterview: (transcript: TranscriptMessage[], durationSeconds: number) => void;
  onAbortToLobby: () => void;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const InterviewRoom: React.FC<InterviewRoomProps> = ({
  config,
  initialMessage,
  onCompleteInterview,
  onAbortToLobby,
}) => {
  const t = getCopy(config.language);
  const profile = INTERVIEWER_PROFILES[config.interviewerType];

  const [transcript, setTranscript] = useState<TranscriptMessage[]>(() => [
    {
      id: `msg-init-${Date.now()}`,
      role: 'interviewer',
      text: initialMessage.spokenResponse,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      questionNumber: initialMessage.questionNumber,
      topic: initialMessage.topic,
      isFollowUp: false,
    },
  ]);

  const [currentQuestionNumber, setCurrentQuestionNumber] = useState(initialMessage.questionNumber);
  const [followUpsOnTopic, setFollowUpsOnTopic] = useState(0);
  const [isConcluded, setIsConcluded] = useState(false);

  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [aiVoiceMuted, setAiVoiceMuted] = useState(false);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [autoSendEnabled, setAutoSendEnabled] = useState(true);
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
  const [textDraft, setTextDraft] = useState('');
  const [apiError, setApiError] = useState<string | null>(null);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [camOn, setCamOn] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const camVideoRef = useRef<HTMLVideoElement | null>(null);

  const transcriptRef = useRef<TranscriptMessage[]>(transcript);
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (chatDrawerOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcript, chatDrawerOpen]);

  useEffect(() => {
    const id = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const speakInterviewerLine = useCallback(
    (line: string) => {
      if (aiVoiceMuted) {
        setIsAiSpeaking(false);
        return;
      }
      speakText(line, config.language, {
        onStart: () => setIsAiSpeaking(true),
        onEnd: () => setIsAiSpeaking(false),
        onError: () => setIsAiSpeaking(false),
      });
    },
    [aiVoiceMuted, config.language],
  );

  useEffect(() => {
    speakInterviewerLine(initialMessage.spokenResponse);
    return () => {
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitCandidateAnswer = useCallback(
    async (rawAnswer: string) => {
      const cleaned = rawAnswer.trim();
      if (!cleaned || isAiThinking) return;

      setApiError(null);
      stopSpeaking();
      setIsAiSpeaking(false);

      const candidateMsg: TranscriptMessage = {
        id: `cand-${Date.now()}`,
        role: 'candidate',
        text: cleaned,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        questionNumber: currentQuestionNumber,
      };

      const updatedHistory = [...transcriptRef.current, candidateMsg];
      setTranscript(updatedHistory);
      setIsAiThinking(true);

      try {
        const res = await fetch('/api/interview/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            config,
            history: updatedHistory.map((h) => ({
              role: h.role,
              text: h.text,
              questionNumber: h.questionNumber,
              isFollowUp: h.isFollowUp,
            })),
            currentQuestionIndex: currentQuestionNumber,
            followUpsOnCurrentTopic: followUpsOnTopic,
            userAnswer: cleaned,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to get interviewer response.');
        }

        const aiMsg: TranscriptMessage = {
          id: `ai-${Date.now()}`,
          role: 'interviewer',
          text: data.spokenResponse,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          questionNumber: data.questionNumber,
          topic: data.topic,
          isFollowUp: data.isFollowUp,
        };

        setTranscript((prev) => [...prev, aiMsg]);
        setCurrentQuestionNumber(data.questionNumber);
        setFollowUpsOnTopic(data.isFollowUp ? followUpsOnTopic + 1 : 0);
        setIsConcluded(Boolean(data.shouldConclude));
        setIsAiThinking(false);

        speakInterviewerLine(data.spokenResponse);
      } catch (err: unknown) {
        setIsAiThinking(false);
        setApiError(err instanceof Error ? err.message : 'Network error.');
      }
    },
    [config, currentQuestionNumber, followUpsOnTopic, isAiThinking, speakInterviewerLine],
  );

  const {
    isSupported: isSpeechSupported,
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
  } = useVoiceInput({
    language: config.language,
    autoSendEnabled,
    autoSendDelayMs: 2500,
    paused: isAiSpeaking || isAiThinking || isConcluded,
    onAutoSend: (text) => {
      submitCandidateAnswer(text);
    },
  });

  const handleManualSendVoice = () => {
    if (!combinedTranscript.trim()) return;
    const text = combinedTranscript.trim();
    clearDraft();
    submitCandidateAnswer(text);
  };

  const handleSendTextDraft = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textDraft.trim() || isAiThinking) return;
    const msg = textDraft.trim();
    setTextDraft('');
    submitCandidateAnswer(msg);
  };

  const handleRepeatQuestion = () => {
    const lastAi = [...transcript].reverse().find((m) => m.role === 'interviewer');
    if (!lastAi) return;
    if (aiVoiceMuted) setAiVoiceMuted(false);
    speakText(lastAi.text, config.language, {
      onStart: () => setIsAiSpeaking(true),
      onEnd: () => setIsAiSpeaking(false),
      onError: () => setIsAiSpeaking(false),
    });
  };

  const toggleAiMute = () => {
    if (!aiVoiceMuted) {
      stopSpeaking();
      setIsAiSpeaking(false);
      setAiVoiceMuted(true);
    } else {
      setAiVoiceMuted(false);
    }
  };

  const toggleCamera = async () => {
    if (camOn) {
      if (camStreamRef.current) {
        camStreamRef.current.getTracks().forEach((tr) => tr.stop());
        camStreamRef.current = null;
      }
      if (camVideoRef.current) camVideoRef.current.srcObject = null;
      setCamOn(false);
      return;
    }
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      camStreamRef.current = stream;
      setCamOn(true);
    } catch {
      setCamError(
        config.language === 'id'
          ? 'Kamera tidak tersedia atau izin ditolak.'
          : 'Camera unavailable or permission denied.',
      );
    }
  };

  useEffect(() => {
    if (camOn && camVideoRef.current && camStreamRef.current) {
      camVideoRef.current.srcObject = camStreamRef.current;
    }
  }, [camOn]);

  useEffect(() => {
    return () => {
      if (camStreamRef.current) {
        camStreamRef.current.getTracks().forEach((tr) => tr.stop());
      }
      stopSpeaking();
    };
  }, []);

  const handleEndSession = () => {
    stopSpeaking();
    turnOffMic();
    if (camStreamRef.current) {
      camStreamRef.current.getTracks().forEach((tr) => tr.stop());
    }
    const candidateAnswersCount = transcript.filter((m) => m.role === 'candidate').length;
    if (candidateAnswersCount === 0) {
      onAbortToLobby();
    } else {
      onCompleteInterview(transcript, elapsedSeconds);
    }
  };

  const roomStatus: RoomStatus = isAiThinking
    ? 'thinking'
    : isAiSpeaking
      ? 'speaking'
      : isMicOn
        ? 'listening'
        : 'idle';

  const statusText =
    roomStatus === 'speaking'
      ? t.statusSpeaking
      : roomStatus === 'thinking'
        ? t.statusThinking
        : roomStatus === 'listening'
          ? t.statusListening
          : t.statusIdle;

  const latestAiMessage = [...transcript].reverse().find((m) => m.role === 'interviewer');
  const candidateInitials = (config.candidateName.trim() || 'Anda')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');

  const autoSendProgressPct =
    countdownMs !== null ? Math.max(0, Math.min(100, (countdownMs / 2500) * 100)) : 0;

  return (
    <div
      className="min-h-screen text-slate-100 flex flex-col"
      style={{
        backgroundColor: '#090B10',
        backgroundImage:
          'radial-gradient(circle at 22% 18%, rgba(56, 189, 248, 0.06), transparent 45%), radial-gradient(circle at 80% 82%, rgba(16, 185, 129, 0.05), transparent 40%)',
      }}
    >
      {/* Minimal Floating Top Info Bar */}
      <header className="px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-display text-sm font-bold tracking-tight text-white whitespace-nowrap shrink-0">
            {t.brandName}
          </span>
          <span className="text-slate-600" aria-hidden="true">
            ·
          </span>
          <span className="text-xs text-slate-400 truncate">{config.position}</span>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400 font-mono tabular-nums shrink-0">
          <span>
            {t.questionProgress} {currentQuestionNumber}/{config.questionCount}
          </span>
          <span aria-hidden="true">·</span>
          <span>{formatDuration(elapsedSeconds)}</span>
        </div>
      </header>

      {/* Main Stage */}
      <div className="flex-1 relative flex overflow-hidden">
        <div className="flex-1 flex flex-col justify-between px-4 sm:px-6 pb-6 max-w-6xl mx-auto w-full gap-4">
          {(!isSpeechSupported || speechError || apiError || camError) && (
            <div className="space-y-2">
              {!isSpeechSupported && (
                <div className="px-4 py-2 rounded-2xl bg-amber-950/70 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>{t.speechUnsupported}</span>
                </div>
              )}
              {(speechError || apiError || camError) && (
                <div className="px-4 py-2 rounded-2xl bg-red-950/70 border border-red-500/30 text-red-200 text-xs flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                    <span>{speechError || apiError || camError}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setApiError(null)}
                    className="text-red-300 hover:text-white"
                    aria-label="Dismiss error"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 2 Clean Rounded Video Tiles */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-[340px] lg:min-h-[430px]">
            {/* LEFT TILE: AI Interviewer */}
            <motion.div
              animate={{
                boxShadow:
                  roomStatus === 'speaking'
                    ? '0 0 0 2px rgba(56,189,248,0.65), 0 20px 55px -15px rgba(56,189,248,0.28)'
                    : '0 0 0 1px rgba(255,255,255,0.08)',
              }}
              transition={{ duration: 0.35 }}
              className="relative rounded-3xl overflow-hidden bg-[#121620] min-h-[260px]"
            >
              <motion.img
                src={profile.imageUrl}
                alt={profile.name}
                referrerPolicy="no-referrer"
                animate={{ scale: roomStatus === 'speaking' ? 1.02 : 1 }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                className="w-full h-full object-cover"
              />

              {/* Concise Status Top-Left */}
              <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/55 backdrop-blur-md text-xs font-medium text-white">
                {roomStatus === 'speaking' && <Volume2 className="w-3.5 h-3.5 text-sky-400" />}
                {roomStatus === 'thinking' && (
                  <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                )}
                {roomStatus === 'listening' && <Mic className="w-3.5 h-3.5 text-emerald-400" />}
                {roomStatus === 'idle' && <MicOff className="w-3.5 h-3.5 text-slate-400" />}
                <span>{statusText}</span>
              </div>

              {/* Acoustic Halo Rings when Speaking */}
              <AnimatePresence>
                {roomStatus === 'speaking' && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="absolute top-4 right-4 flex items-center justify-center"
                  >
                    <span className="absolute w-10 h-10 rounded-full border-2 border-sky-400 animate-voice-ring" />
                    <div className="w-9 h-9 rounded-full bg-sky-500/90 flex items-center justify-center gap-0.5 shadow-lg">
                      {[0.2, 0.6, 0.4, 0.8].map((delay, idx) => (
                        <motion.span
                          key={idx}
                          animate={{ height: ['22%', '68%', '28%'] }}
                          transition={{
                            repeat: Infinity,
                            duration: 0.55,
                            delay: delay * 0.3,
                            ease: 'easeInOut',
                          }}
                          className="w-0.5 bg-white rounded-full"
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="absolute inset-x-0 bottom-0 p-5 bg-gradient-to-t from-black/80 via-black/35 to-transparent">
                <p className="text-sm font-semibold text-white">{profile.name}</p>
                <p className="text-xs text-slate-300">
                  {config.interviewerType === 'hrd'
                    ? 'HRD Recruiter'
                    : config.interviewerType === 'tech'
                      ? 'Tech Lead'
                      : 'Hiring Director'}
                </p>
              </div>
            </motion.div>

            {/* RIGHT TILE: Candidate */}
            <motion.div
              animate={{
                boxShadow:
                  isMicOn && !isAiSpeaking && !isAiThinking
                    ? '0 0 0 2px rgba(16,185,129,0.6), 0 20px 55px -15px rgba(16,185,129,0.2)'
                    : '0 0 0 1px rgba(255,255,255,0.08)',
              }}
              transition={{ duration: 0.3 }}
              className="relative rounded-3xl overflow-hidden bg-[#121620] flex items-center justify-center min-h-[260px]"
            >
              {camOn ? (
                <video
                  ref={camVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover scale-x-[-1]"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-6">
                  <motion.div
                    animate={
                      isMicOn && !isAiSpeaking && !isAiThinking
                        ? { scale: [1, 1.04, 1] }
                        : { scale: 1 }
                    }
                    transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
                    className="w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-2xl font-bold text-slate-200 mb-3"
                  >
                    {candidateInitials}
                  </motion.div>
                  <p className="text-xs text-slate-500">{t.cameraOffHint}</p>
                </div>
              )}

              <div className="absolute inset-x-0 bottom-0 p-5 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-white">
                    {config.candidateName.trim() || t.candidateTileLabel}
                  </p>
                  <p className="text-xs text-slate-300">
                    {isMicOn ? t.micUnmute : t.micMute}
                  </p>
                </div>

                {/* Live Audio Waveform Bars */}
                <div
                  className="flex items-end gap-1 h-7 px-2.5 py-1.5 rounded-full bg-black/50 backdrop-blur border border-white/10"
                  aria-label="Microphone audio level"
                >
                  {audioBars.map((heightPct, idx) => (
                    <span
                      key={idx}
                      className={`w-1 rounded-full transition-all duration-75 ${
                        isMicOn && !isAiSpeaking && !isAiThinking
                          ? 'bg-emerald-400'
                          : 'bg-slate-600'
                      }`}
                      style={{ height: `${Math.max(15, heightPct)}%` }}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          </div>

          {/* Minimal Live Subtitles (CC) */}
          <AnimatePresence>
            {captionsEnabled && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.2 }}
                className="relative overflow-hidden rounded-2xl bg-[#121620]/90 backdrop-blur-md border border-white/8 px-5 py-3.5 text-center max-w-3xl mx-auto w-full"
              >
                {countdownMs !== null && combinedTranscript && (
                  <div
                    className="absolute top-0 left-0 h-0.5 bg-emerald-400 transition-all duration-100"
                    style={{ width: `${autoSendProgressPct}%` }}
                  />
                )}

                <AnimatePresence mode="wait">
                  <motion.p
                    key={
                      combinedTranscript
                        ? 'user-live'
                        : isAiThinking
                          ? 'ai-thinking'
                          : latestAiMessage?.id || 'empty'
                    }
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="text-sm sm:text-base text-slate-100 leading-relaxed"
                  >
                    {combinedTranscript ? (
                      <>
                        <span>{finalTranscript}</span>
                        {interimTranscript && (
                          <span className="text-slate-400 italic">
                            {finalTranscript ? ' ' : ''}
                            {interimTranscript}
                          </span>
                        )}
                      </>
                    ) : isAiThinking ? (
                      <span className="text-slate-400 italic">{t.statusThinking}...</span>
                    ) : (
                      latestAiMessage?.text || ''
                    )}
                  </motion.p>
                </AnimatePresence>

                {countdownMs !== null && combinedTranscript && (
                  <div className="mt-2 flex items-center justify-center gap-3 text-xs">
                    <span className="font-mono tabular-nums text-emerald-400">
                      {t.autoSendCountdown} {(countdownMs / 1000).toFixed(1)}s
                    </span>
                    <button
                      type="button"
                      onClick={handleManualSendVoice}
                      className="px-2.5 py-0.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors"
                    >
                      {t.sendNowBtn}
                    </button>
                  </div>
                )}

                {isConcluded && (
                  <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-center gap-3">
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={handleEndSession}
                      className="px-5 py-2 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors"
                    >
                      {config.language === 'id' ? 'Lihat Rapor Evaluasi' : 'View Evaluation Report'}
                    </motion.button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Centered Floating Capsule Controls Bar */}
          <div className="flex justify-center">
            <div className="inline-flex flex-wrap items-center justify-center gap-2 px-3 py-2 rounded-full bg-[#141925]/90 backdrop-blur-xl border border-white/10 shadow-2xl">
              <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                disabled={!isSpeechSupported || isConcluded}
                onClick={toggleMic}
                className={`px-4 py-2.5 rounded-full text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap disabled:opacity-40 ${
                  isMicOn
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-white/10 hover:bg-white/15 text-slate-100'
                }`}
              >
                {isMicOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                <span>{isMicOn ? t.micUnmute : t.micMute}</span>
              </motion.button>

              <motion.button
                type="button"
                whileTap={{ scale: 0.94 }}
                onClick={toggleCamera}
                className={`p-2.5 rounded-full transition-colors ${
                  camOn
                    ? 'bg-sky-500/20 text-sky-300'
                    : 'bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
                aria-label="Toggle camera"
              >
                {camOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
              </motion.button>

              <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={() => setAutoSendEnabled((v) => !v)}
                className={`px-3 py-2 rounded-full text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  autoSendEnabled
                    ? 'bg-sky-500/20 text-sky-200'
                    : 'bg-white/5 text-slate-400 hover:text-slate-200'
                }`}
              >
                {autoSendEnabled && <Check className="w-3.5 h-3.5" />}
                <span>{t.autoSendLabel}</span>
              </motion.button>

              {combinedTranscript && !autoSendEnabled && (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={handleManualSendVoice}
                  className="px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{t.sendNowBtn}</span>
                </motion.button>
              )}

              <motion.button
                type="button"
                whileTap={{ scale: 0.94 }}
                onClick={handleRepeatQuestion}
                className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 text-slate-200 transition-colors"
                title={t.repeatQuestionBtn}
                aria-label={t.repeatQuestionBtn}
              >
                <RotateCcw className="w-4 h-4" />
              </motion.button>

              <motion.button
                type="button"
                whileTap={{ scale: 0.94 }}
                onClick={() => setCaptionsEnabled((v) => !v)}
                className={`p-2.5 rounded-full transition-colors ${
                  captionsEnabled ? 'bg-white/15 text-white' : 'bg-white/5 text-slate-400'
                }`}
                title={t.captionsOn}
                aria-label="Toggle captions"
              >
                <Captions className="w-4 h-4" />
              </motion.button>

              <motion.button
                type="button"
                whileTap={{ scale: 0.94 }}
                onClick={toggleAiMute}
                className={`p-2.5 rounded-full transition-colors ${
                  aiVoiceMuted ? 'bg-amber-500/20 text-amber-300' : 'bg-white/5 text-slate-200 hover:bg-white/10'
                }`}
                aria-label="Toggle AI voice"
              >
                {aiVoiceMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </motion.button>

              <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={() => setChatDrawerOpen((v) => !v)}
                className={`px-3.5 py-2 rounded-full text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  chatDrawerOpen
                    ? 'bg-white text-slate-950'
                    : 'bg-white/5 hover:bg-white/10 text-slate-200'
                }`}
              >
                <MessageSquareText className="w-4 h-4" />
                <span className="hidden sm:inline">{t.chatDrawerBtn}</span>
              </motion.button>

              <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={handleEndSession}
                className="px-4 py-2.5 rounded-full bg-red-600 hover:bg-red-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <PhoneOff className="w-4 h-4" />
                <span>{t.endInterviewBtn}</span>
              </motion.button>
            </div>
          </div>
        </div>

        {/* Slide-Over Transcript & Fallback Text Drawer */}
        <AnimatePresence>
          {chatDrawerOpen && (
            <motion.aside
              initial={{ x: 360, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 360, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="w-full sm:w-96 bg-[#0E121B] border-l border-white/10 flex flex-col h-[calc(100vh-52px)] shrink-0"
            >
              <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold text-white">{t.chatDrawerBtn}</h2>
                <button
                  type="button"
                  onClick={() => setChatDrawerOpen(false)}
                  className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/5"
                  aria-label="Close drawer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {transcript.map((item) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`flex flex-col gap-1 ${
                      item.role === 'candidate' ? 'items-end' : 'items-start'
                    }`}
                  >
                    <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                      {item.role === 'interviewer' ? profile.name : t.candidateTileLabel} · {item.timestamp}
                    </span>
                    <div
                      className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed ${
                        item.role === 'candidate'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white/5 text-slate-100 border border-white/10'
                      }`}
                    >
                      {item.text}
                    </div>
                  </motion.div>
                ))}
                <div ref={chatEndRef} />
              </div>

              <form onSubmit={handleSendTextDraft} className="p-4 border-t border-white/10 space-y-2">
                <textarea
                  rows={2}
                  value={textDraft}
                  onChange={(e) => setTextDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendTextDraft(e);
                    }
                  }}
                  disabled={isAiThinking || isConcluded}
                  placeholder={t.typeFallbackPlaceholder}
                  className="w-full px-3.5 py-2.5 text-sm bg-white/5 border border-white/10 rounded-2xl text-white placeholder:text-slate-500 focus:outline-none focus:border-white/25 resize-none disabled:opacity-50"
                />
                <motion.button
                  type="submit"
                  whileTap={{ scale: 0.98 }}
                  disabled={!textDraft.trim() || isAiThinking || isConcluded}
                  className="w-full px-4 py-2.5 rounded-full bg-white text-slate-950 hover:bg-slate-200 disabled:bg-white/10 disabled:text-slate-500 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{t.sendNowBtn}</span>
                </motion.button>
              </form>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
