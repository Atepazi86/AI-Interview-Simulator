import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  ArrowRight,
  Camera,
  CameraOff,
  CheckCircle2,
  Loader2,
  Mic,
  MicOff,
  SlidersHorizontal,
  Volume2,
  X,
} from 'lucide-react';
import {
  ExperienceLevel,
  INTERVIEWER_PROFILES,
  InterviewConfig,
  InterviewerType,
  InterviewLanguage,
  QuestionCount,
} from '../types';
import { getCopy } from '../utils/i18n';
import { playSpeakerTestChime, speakText, stopSpeaking } from '../utils/speechService';

interface LobbyViewProps {
  config: InterviewConfig;
  onChangeConfig: (next: InterviewConfig) => void;
  onStartInterview: () => void;
  isStarting: boolean;
  startError: string | null;
}

const QUICK_ROLES = ['Web Developer', 'UI/UX Designer', 'Admin Keuangan', 'Digital Marketing'];

export const LobbyView: React.FC<LobbyViewProps> = ({
  config,
  onChangeConfig,
  onStartInterview,
  isStarting,
  startError,
}) => {
  const t = getCopy(config.language);

  const [deviceModalOpen, setDeviceModalOpen] = useState(false);

  const [micTesting, setMicTesting] = useState(false);
  const [micSpectrum, setMicSpectrum] = useState<number[]>(Array(16).fill(10));
  const [micLevel, setMicLevel] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const micRafRef = useRef<number | null>(null);

  const [camPreviewOn, setCamPreviewOn] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [speakerTesting, setSpeakerTesting] = useState(false);

  const stopMicTest = () => {
    if (micRafRef.current) cancelAnimationFrame(micRafRef.current);
    micRafRef.current = null;
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((tr) => tr.stop());
      micStreamRef.current = null;
    }
    if (micCtxRef.current && micCtxRef.current.state !== 'closed') {
      micCtxRef.current.close().catch(() => {});
      micCtxRef.current = null;
    }
    setMicTesting(false);
    setMicLevel(0);
    setMicSpectrum(Array(16).fill(10));
  };

  const toggleMicTest = async () => {
    if (micTesting) {
      stopMicTest();
      return;
    }
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      micCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);
      setMicTesting(true);

      const update = () => {
        if (!micStreamRef.current) return;
        analyser.getByteFrequencyData(data);
        let sum = 0;
        const bars: number[] = [];
        for (let i = 0; i < 16; i++) {
          const val = data[i + 1] || 0;
          sum += val;
          bars.push(Math.max(10, Math.min(100, Math.round((val / 180) * 100))));
        }
        const avg = sum / 16;
        setMicLevel(Math.min(100, Math.round((avg / 90) * 100)));
        setMicSpectrum(bars);
        micRafRef.current = requestAnimationFrame(update);
      };
      micRafRef.current = requestAnimationFrame(update);
    } catch {
      setMicError(t.micBlockedLabel);
    }
  };

  const stopCamPreview = () => {
    if (camStreamRef.current) {
      camStreamRef.current.getTracks().forEach((tr) => tr.stop());
      camStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCamPreviewOn(false);
  };

  const toggleCamPreview = async () => {
    if (camPreviewOn) {
      stopCamPreview();
      return;
    }
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      camStreamRef.current = stream;
      setCamPreviewOn(true);
    } catch {
      setCamError(
        config.language === 'id'
          ? 'Kamera tidak tersedia atau izin ditolak.'
          : 'Camera unavailable or permission denied.',
      );
    }
  };

  useEffect(() => {
    if (camPreviewOn && videoRef.current && camStreamRef.current) {
      videoRef.current.srcObject = camStreamRef.current;
    }
  }, [camPreviewOn]);

  const handleSpeakerTest = () => {
    if (speakerTesting) {
      stopSpeaking();
      setSpeakerTesting(false);
      return;
    }
    playSpeakerTestChime();
    const sampleLine =
      config.language === 'id'
        ? 'Halo, suara pewawancara terdengar jelas. Semoga sukses hari ini.'
        : 'Hello, your interviewer audio is clear. Best of luck today.';
    speakText(sampleLine, config.language, {
      onStart: () => setSpeakerTesting(true),
      onEnd: () => setSpeakerTesting(false),
      onError: () => setSpeakerTesting(false),
    });
  };

  const closeDeviceModal = () => {
    stopMicTest();
    stopCamPreview();
    stopSpeaking();
    setSpeakerTesting(false);
    setDeviceModalOpen(false);
  };

  useEffect(() => {
    return () => {
      stopMicTest();
      stopCamPreview();
      stopSpeaking();
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!config.position.trim() || isStarting) return;
    stopMicTest();
    stopCamPreview();
    stopSpeaking();
    onStartInterview();
  };

  const selectedProfile = INTERVIEWER_PROFILES[config.interviewerType];

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#F5F6F8] text-slate-900 flex flex-col">
      {/* Calm Atmospheric Ambient Canvas */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          animate={{ x: [0, 24, 0], y: [0, -16, 0] }}
          transition={{ repeat: Infinity, duration: 18, ease: 'easeInOut' }}
          className="absolute -top-36 left-1/4 w-[520px] h-[520px] rounded-full bg-sky-200/45 blur-[110px]"
        />
        <motion.div
          animate={{ x: [0, -20, 0], y: [0, 20, 0] }}
          transition={{ repeat: Infinity, duration: 22, ease: 'easeInOut' }}
          className="absolute top-1/3 right-1/5 w-[460px] h-[460px] rounded-full bg-amber-100/55 blur-[120px]"
        />
        <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-slate-200/40 to-transparent" />
      </div>

      {/* Floating Centered Pill Header (matching serene minimalist aesthetic) */}
      <header className="relative z-20 pt-6 px-4 flex justify-center">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center gap-6 sm:gap-8 px-4 py-2 rounded-full bg-white/80 backdrop-blur-xl border border-white/90 shadow-[0_8px_30px_rgba(15,23,42,0.06)]"
        >
          <span className="font-display text-sm sm:text-base font-bold tracking-tight text-slate-900 pl-2 whitespace-nowrap shrink-0">
            {t.brandName}
          </span>

          <nav className="hidden sm:flex items-center gap-5 text-xs font-medium text-slate-500">
            <a href="#studio-dock" className="hover:text-slate-900 transition-colors whitespace-nowrap">
              {t.navLobby}
            </a>
            <button
              type="button"
              onClick={() => setDeviceModalOpen(true)}
              className="hover:text-slate-900 transition-colors whitespace-nowrap"
            >
              {t.navDevice}
            </button>
          </nav>

          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={() =>
              onChangeConfig({
                ...config,
                language: config.language === 'id' ? 'en' : 'id',
              })
            }
            className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-950 hover:bg-slate-800 rounded-full transition-colors whitespace-nowrap shrink-0"
          >
            {config.language === 'id' ? 'ID' : 'EN'}
          </motion.button>
        </motion.div>
      </header>

      {/* Main Serene Centered Stage */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 py-10 sm:py-14">
        {/* Minimalist Centered Hero */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="text-center max-w-2xl mx-auto mb-9 space-y-3.5"
        >
          <p className="text-xs font-medium text-slate-500 tracking-wide">{t.heroKicker}</p>
          <h1
            className="font-display text-4xl sm:text-5xl lg:text-[56px] font-semibold tracking-tight text-slate-950 leading-[1.08]"
            style={{ textWrap: 'balance' }}
          >
            {t.heroTitle}
          </h1>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-md mx-auto">
            {t.heroSubtitle}
          </p>
        </motion.div>

        <AnimatePresence>
          {startError && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              role="alert"
              className="w-full max-w-2xl mb-5 px-4 py-3 rounded-2xl bg-red-50/90 backdrop-blur border border-red-200 text-red-800 flex items-center gap-2.5 text-xs sm:text-sm"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{startError}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sleek Floating Studio Setup Dock (Low-Text, Visual-First) */}
        <motion.form
          id="studio-dock"
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-2xl bg-white/80 backdrop-blur-2xl border border-white rounded-3xl p-5 sm:p-7 shadow-[0_24px_60px_rgba(15,23,42,0.08)] space-y-6"
        >
          {/* Role + Optional Name Row */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-8">
              <label htmlFor="position-input" className="sr-only">
                {t.positionLabel}
              </label>
              <input
                id="position-input"
                type="text"
                required
                value={config.position}
                onChange={(e) => onChangeConfig({ ...config, position: e.target.value })}
                placeholder={t.positionPlaceholder}
                className="w-full px-4 py-3 text-sm font-medium bg-slate-100/75 hover:bg-slate-100 focus:bg-white border border-transparent focus:border-slate-300 rounded-2xl text-slate-900 placeholder:text-slate-400 focus:outline-none transition-all"
              />
            </div>

            <div className="sm:col-span-4">
              <label htmlFor="candidate-name" className="sr-only">
                {t.candidateNameLabel}
              </label>
              <input
                id="candidate-name"
                type="text"
                value={config.candidateName}
                onChange={(e) => onChangeConfig({ ...config, candidateName: e.target.value })}
                placeholder={`${t.candidateNameLabel} (${t.candidateNamePlaceholder})`}
                className="w-full px-4 py-3 text-sm bg-slate-100/75 hover:bg-slate-100 focus:bg-white border border-transparent focus:border-slate-300 rounded-2xl text-slate-900 placeholder:text-slate-400 focus:outline-none transition-all"
              />
            </div>
          </div>

          {/* Quick Role Chips */}
          <div className="flex flex-wrap items-center gap-1.5 -mt-2">
            {QUICK_ROLES.map((role) => {
              const active = config.position.toLowerCase() === role.toLowerCase();
              return (
                <motion.button
                  key={role}
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={() => onChangeConfig({ ...config, position: role })}
                  className={`px-3 py-1 text-xs font-medium rounded-full transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
                  }`}
                >
                  {role}
                </motion.button>
              );
            })}
          </div>

          {/* Minimalist Interviewer Portrait Selector */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-medium text-slate-700">{t.interviewerTypeLabel}</span>
              <AnimatePresence mode="wait">
                <motion.span
                  key={selectedProfile.id}
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -3 }}
                  transition={{ duration: 0.16 }}
                  className="text-slate-500 truncate max-w-[65%] text-right"
                >
                  {config.language === 'id' ? selectedProfile.focusId : selectedProfile.focusEn}
                </motion.span>
              </AnimatePresence>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {(['hrd', 'tech', 'mixed'] as InterviewerType[]).map((type) => {
                const profile = INTERVIEWER_PROFILES[type];
                const selected = config.interviewerType === type;
                return (
                  <motion.button
                    key={type}
                    type="button"
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => onChangeConfig({ ...config, interviewerType: type })}
                    className={`group p-2.5 rounded-2xl border text-left flex items-center gap-3 transition-all ${
                      selected
                        ? 'bg-slate-950 text-white border-slate-950 shadow-md'
                        : 'bg-slate-50/80 hover:bg-white text-slate-800 border-slate-200/80'
                    }`}
                  >
                    <img
                      src={profile.imageUrl}
                      alt={profile.name}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-xl object-cover shrink-0 bg-slate-200"
                    />
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-semibold truncate">{profile.name}</p>
                      <p
                        className={`text-[11px] truncate ${
                          selected ? 'text-slate-300' : 'text-slate-500'
                        }`}
                      >
                        {type === 'hrd'
                          ? 'HRD'
                          : type === 'tech'
                            ? 'Tech Lead'
                            : config.language === 'id'
                              ? 'Campuran'
                              : 'Full Panel'}
                      </p>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* Compact Parameter Bar (Level + Rounds + Language) */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            {/* Experience Level */}
            <div className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-full">
              {(
                [
                  { id: 'fresh_grad', labelId: 'Fresh Grad', labelEn: 'Fresh' },
                  { id: 'junior', labelId: 'Junior', labelEn: 'Junior' },
                  { id: 'senior', labelId: 'Senior', labelEn: 'Senior' },
                ] as { id: ExperienceLevel; labelId: string; labelEn: string }[]
              ).map((item) => {
                const active = config.experienceLevel === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onChangeConfig({ ...config, experienceLevel: item.id })}
                    className={`relative px-3.5 py-1.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap ${
                      active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="level-capsule"
                        transition={{ type: 'spring', stiffness: 440, damping: 32 }}
                        className="absolute inset-0 bg-white rounded-full shadow-xs"
                      />
                    )}
                    <span className="relative z-10">
                      {config.language === 'id' ? item.labelId : item.labelEn}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Question Count & Language */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-full">
                {([5, 8] as QuestionCount[]).map((count) => {
                  const active = config.questionCount === count;
                  return (
                    <button
                      key={count}
                      type="button"
                      onClick={() => onChangeConfig({ ...config, questionCount: count })}
                      className={`relative px-3 py-1.5 text-xs font-medium rounded-full tabular-nums transition-colors whitespace-nowrap ${
                        active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="count-capsule"
                          transition={{ type: 'spring', stiffness: 440, damping: 32 }}
                          className="absolute inset-0 bg-white rounded-full shadow-xs"
                        />
                      )}
                      <span className="relative z-10">
                        {count} {config.language === 'id' ? 'Sesi' : 'Q'}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-full">
                {(['id', 'en'] as InterviewLanguage[]).map((langOpt) => {
                  const active = config.language === langOpt;
                  return (
                    <button
                      key={langOpt}
                      type="button"
                      onClick={() => onChangeConfig({ ...config, language: langOpt })}
                      className={`relative px-3 py-1.5 text-xs font-medium rounded-full uppercase transition-colors ${
                        active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="lang-capsule"
                          transition={{ type: 'spring', stiffness: 440, damping: 32 }}
                          className="absolute inset-0 bg-white rounded-full shadow-xs"
                        />
                      )}
                      <span className="relative z-10">{langOpt}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Primary Action Bar (Clean 2-button hierarchy like reference) */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <motion.button
              type="submit"
              whileHover={!isStarting && config.position.trim() ? { scale: 1.02 } : undefined}
              whileTap={!isStarting && config.position.trim() ? { scale: 0.97 } : undefined}
              disabled={!config.position.trim() || isStarting}
              className="w-full sm:w-auto px-7 py-3.5 rounded-full bg-slate-950 hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-slate-950/15 whitespace-nowrap"
            >
              {isStarting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t.enteringRoomBtn}</span>
                </>
              ) : (
                <>
                  <span>{t.enterRoomBtn}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </motion.button>

            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setDeviceModalOpen(true)}
              className="w-full sm:w-auto px-5 py-3.5 rounded-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-sm font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
            >
              <SlidersHorizontal className="w-4 h-4 text-slate-500" />
              <span>{t.deviceCheckBtn}</span>
            </motion.button>
          </div>
        </motion.form>
      </main>

      {/* Sleek On-Demand Device Check Modal */}
      <AnimatePresence>
        {deviceModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={closeDeviceModal}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-[#0F1522] text-slate-100 border border-white/10 rounded-3xl p-6 space-y-5 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-semibold text-white">
                  {t.deviceCheckTitle}
                </h2>
                <button
                  type="button"
                  onClick={closeDeviceModal}
                  className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Camera / Interviewer Preview */}
              <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-950 border border-white/10">
                {camPreviewOn ? (
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover scale-x-[-1]"
                  />
                ) : (
                  <img
                    src={selectedProfile.imageUrl}
                    alt={selectedProfile.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                )}
                <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 to-transparent text-xs text-slate-200">
                  {camPreviewOn ? t.candidateTileLabel : selectedProfile.name}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={toggleMicTest}
                  className={`px-3 py-2.5 text-xs font-semibold rounded-xl border flex items-center justify-center gap-1.5 transition-colors ${
                    micTesting
                      ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                      : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
                  }`}
                >
                  {micTesting ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                  <span>{micTesting ? t.stopMicBtn : t.testMicBtn}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSpeakerTest}
                  className={`px-3 py-2.5 text-xs font-semibold rounded-xl border flex items-center justify-center gap-1.5 transition-colors ${
                    speakerTesting
                      ? 'bg-blue-500/20 border-blue-400/50 text-blue-300'
                      : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
                  }`}
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>{t.testSpeakerBtn}</span>
                </button>

                <button
                  type="button"
                  onClick={toggleCamPreview}
                  className={`px-3 py-2.5 text-xs font-semibold rounded-xl border flex items-center justify-center gap-1.5 transition-colors ${
                    camPreviewOn
                      ? 'bg-blue-500/20 border-blue-400/50 text-blue-300'
                      : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
                  }`}
                >
                  {camPreviewOn ? <CameraOff className="w-3.5 h-3.5" /> : <Camera className="w-3.5 h-3.5" />}
                  <span>{t.togglePreviewCam}</span>
                </button>
              </div>

              {micTesting && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-emerald-300">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {t.micReadyLabel}
                    </span>
                    <span className="font-mono tabular-nums text-slate-400">{micLevel}%</span>
                  </div>
                  <div className="flex items-end gap-1 h-7 px-3 py-1 rounded-xl bg-slate-950 border border-white/10">
                    {micSpectrum.map((val, idx) => (
                      <span
                        key={idx}
                        className="flex-1 rounded-full bg-emerald-400 transition-all duration-75"
                        style={{ height: `${val}%` }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {(micError || camError) && (
                <p className="text-xs text-amber-200 bg-amber-950/70 border border-amber-500/30 rounded-xl p-2.5">
                  {micError || camError}
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
