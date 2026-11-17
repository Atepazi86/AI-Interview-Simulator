import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  Copy,
  Download,
  Printer,
  RotateCcw,
} from 'lucide-react';
import {
  EvaluationReportData,
  INTERVIEWER_PROFILES,
  InterviewConfig,
  TranscriptMessage,
} from '../types';
import { getCopy } from '../utils/i18n';

interface EvaluationReportProps {
  config: InterviewConfig;
  durationSeconds: number;
  transcript: TranscriptMessage[];
  report: EvaluationReportData | null;
  isLoading: boolean;
  error: string | null;
  onRetryEvaluate: () => void;
  onPracticeAgain: () => void;
}

function getScoreTextColor(score: number): string {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-blue-600';
  return 'text-amber-600';
}

function getScoreBarColor(score: number): string {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 60) return 'bg-blue-600';
  return 'bg-amber-500';
}

function formatDurationText(sec: number, lang: 'id' | 'en'): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return lang === 'id' ? `${m}m ${s}d` : `${m}m ${s}s`;
}

export const EvaluationReport: React.FC<EvaluationReportProps> = ({
  config,
  durationSeconds,
  transcript,
  report,
  isLoading,
  error,
  onRetryEvaluate,
  onPracticeAgain,
}) => {
  const t = getCopy(config.language);
  const profile = INTERVIEWER_PROFILES[config.interviewerType];
  const [expandedMap, setExpandedMap] = useState<Record<number, boolean>>({ 0: true });
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [displayScore, setDisplayScore] = useState(0);

  const targetScore = report?.overallScore ?? 0;

  useEffect(() => {
    if (!report) {
      setDisplayScore(0);
      return;
    }
    let frame = 0;
    const totalFrames = 32;
    const timer = setInterval(() => {
      frame += 1;
      const progress = Math.min(1, frame / totalFrames);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayScore(Math.round(targetScore * eased));
      if (frame >= totalFrames) clearInterval(timer);
    }, 20);
    return () => clearInterval(timer);
  }, [report, targetScore]);

  const toggleAccordion = (idx: number) => {
    setExpandedMap((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const handleCopyImproved = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(idx);
      setTimeout(() => setCopiedIndex(null), 1800);
    } catch {
      // Ignore clipboard error
    }
  };

  const handleDownloadTxt = () => {
    if (!report) return;
    const lines: string[] = [
      `INTERVIEWMEET — ${t.reportHeaderTitle.toUpperCase()}`,
      `Role     : ${config.position}`,
      `Interviewer: ${profile.name}`,
      `Duration : ${formatDurationText(durationSeconds, config.language)}`,
      `Score    : ${report.overallScore}/100 (${report.readinessLabel})`,
      '',
      report.executiveSummary,
      '',
      ...report.aspects.map((a) => `- ${a.name}: ${a.score}/100 — ${a.feedback}`),
      '',
      ...report.questionBreakdown.flatMap((q, i) => [
        `[Q${i + 1}] ${q.question} (${q.score}/100)`,
        `Answer : ${q.candidateAnswer}`,
        `Notes  : ${q.critique}`,
        `Rewrite: ${q.improvedAnswer}`,
        '',
      ]),
      ...report.actionableNextSteps.map((s, i) => `${i + 1}. ${s}`),
      '',
      ...transcript.map(
        (m) => `[${m.timestamp}] ${m.role === 'interviewer' ? profile.name : 'You'}: ${m.text}`,
      ),
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `InterviewMeet-${config.position.replace(/\s+/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrintPdf = () => {
    if (report) {
      const allOpen: Record<number, boolean> = {};
      report.questionBreakdown.forEach((_, idx) => {
        allOpen[idx] = true;
      });
      setExpandedMap(allOpen);
      setTimeout(() => window.print(), 160);
    }
  };

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset =
    circumference - (Math.max(0, Math.min(100, targetScore)) / 100) * circumference;

  return (
    <div className="min-h-screen bg-[#F5F6F8] text-slate-900">
      {/* Floating Minimal Header */}
      <header className="no-print pt-6 px-4 flex justify-center">
        <div className="w-full max-w-4xl flex items-center justify-between px-5 py-2.5 rounded-full bg-white/85 backdrop-blur-xl border border-white shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
          <span className="font-display text-sm sm:text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
            {t.brandName}
          </span>

          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={onPracticeAgain}
            className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-950 hover:bg-slate-800 rounded-full flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t.retryBtn}</span>
          </motion.button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 py-10 space-y-8">
        {isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl p-8 space-y-6 border border-slate-200/70"
          >
            <div>
              <h1 className="font-display text-xl font-bold text-slate-900">{t.reportLoadingTitle}</h1>
              <p className="text-sm text-slate-500 mt-1">{t.reportLoadingDesc}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-pulse">
              <div className="h-24 bg-slate-100 rounded-2xl" />
              <div className="h-24 bg-slate-100 rounded-2xl" />
            </div>
          </motion.div>
        )}

        {error && !isLoading && (
          <div className="bg-white border border-red-200 rounded-3xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-slate-700">{error}</p>
            </div>
            <button
              type="button"
              onClick={onRetryEvaluate}
              className="px-5 py-2.5 bg-slate-950 hover:bg-slate-800 text-white text-xs font-semibold rounded-full whitespace-nowrap shrink-0"
            >
              {config.language === 'id' ? 'Coba Lagi' : 'Retry'}
            </button>
          </div>
        )}

        {report && !isLoading && (
          <>
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col sm:flex-row sm:items-end justify-between gap-4"
            >
              <div>
                <p className="text-xs text-slate-500 mb-1.5">
                  {config.position} · {profile.name} · {formatDurationText(durationSeconds, config.language)}
                </p>
                <h1 className="font-display text-3xl font-bold tracking-tight text-slate-950">
                  {t.reportHeaderTitle}
                </h1>
              </div>

              <div className="no-print flex items-center gap-2 shrink-0">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={handleDownloadTxt}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-full flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{t.downloadTxtBtn}</span>
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={handlePrintPdf}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-950 hover:bg-slate-800 rounded-full flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{t.printPdfBtn}</span>
                </motion.button>
              </div>
            </motion.section>

            {/* Score Card */}
            <motion.section
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
              className="bg-white rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-8 border border-slate-200/70 shadow-[0_12px_40px_rgba(15,23,42,0.04)]"
            >
              <div className="relative w-32 h-32 shrink-0 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="10" />
                  <motion.circle
                    cx="60"
                    cy="60"
                    r={radius}
                    fill="none"
                    stroke={targetScore >= 80 ? '#16a34a' : targetScore >= 60 ? '#2563eb' : '#d97706'}
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset }}
                    transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-3xl font-bold font-mono tabular-nums ${getScoreTextColor(targetScore)}`}>
                    {displayScore}
                  </span>
                  <span className="text-[11px] text-slate-400">/ 100</span>
                </div>
              </div>

              <div className="flex-1 space-y-2 text-center sm:text-left">
                <p className="text-xs font-medium text-slate-500">{t.overallScoreLabel}</p>
                <h2 className="font-display text-xl font-bold text-slate-950">{report.readinessLabel}</h2>
                <p className="text-sm text-slate-600 leading-relaxed">{report.executiveSummary}</p>
              </div>
            </motion.section>

            {/* 4 Aspects */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {report.aspects.map((aspect, idx) => (
                <motion.div
                  key={aspect.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + idx * 0.06 }}
                  className="print-break-avoid bg-white rounded-3xl p-5 border border-slate-200/70 space-y-3"
                >
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-sm font-semibold text-slate-900">{aspect.name}</h3>
                    <span className={`text-sm font-bold font-mono tabular-nums ${getScoreTextColor(aspect.score)}`}>
                      {aspect.score}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(4, Math.min(100, aspect.score))}%` }}
                      transition={{ duration: 0.7, delay: 0.15 + idx * 0.08, ease: [0.16, 1, 0.3, 1] }}
                      className={`h-full rounded-full ${getScoreBarColor(aspect.score)}`}
                    />
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{aspect.feedback}</p>
                </motion.div>
              ))}
            </section>

            {/* Question Accordion */}
            <section className="space-y-3">
              <h2 className="font-display text-lg font-bold text-slate-950">{t.breakdownSectionTitle}</h2>

              {report.questionBreakdown.map((item, idx) => {
                const isOpen = Boolean(expandedMap[idx]);
                return (
                  <div
                    key={idx}
                    className="print-break-avoid bg-white border border-slate-200/70 rounded-3xl overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => toggleAccordion(idx)}
                      className="w-full px-6 py-4 text-left flex items-start justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                          <span className="font-semibold text-slate-700">Q{idx + 1}</span>
                          <span aria-hidden="true">·</span>
                          <span className={`font-semibold ${getScoreTextColor(item.score)}`}>
                            {item.score}/100
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-slate-900 leading-snug">
                          {item.question}
                        </p>
                      </div>

                      <motion.span
                        animate={{ rotate: isOpen ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                        className="no-print text-slate-400 shrink-0 mt-1"
                      >
                        <ChevronDown className="w-5 h-5" />
                      </motion.span>
                    </button>

                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="px-6 pb-6 pt-2 border-t border-slate-100 space-y-4">
                            <div>
                              <p className="text-xs font-medium text-slate-400 mb-1">{t.yourAnswerLabel}</p>
                              <p className="text-sm text-slate-700 leading-relaxed">{item.candidateAnswer}</p>
                            </div>

                            <div>
                              <p className="text-xs font-medium text-amber-600 mb-1">{t.critiqueLabel}</p>
                              <p className="text-sm text-slate-700 leading-relaxed">{item.critique}</p>
                            </div>

                            <div className="rounded-2xl bg-emerald-50/70 p-4 space-y-2">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-xs font-semibold text-emerald-800">
                                  {t.improvedAnswerLabel}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => handleCopyImproved(item.improvedAnswer, idx)}
                                  className="no-print px-3 py-1 text-xs font-medium text-emerald-800 bg-white rounded-full flex items-center gap-1.5 transition-colors whitespace-nowrap"
                                >
                                  {copiedIndex === idx ? (
                                    <>
                                      <Check className="w-3.5 h-3.5" />
                                      <span>{t.copiedBtn}</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3.5 h-3.5" />
                                      <span>{t.copyAnswerBtn}</span>
                                    </>
                                  )}
                                </button>
                              </div>
                              <p className="text-sm text-slate-800 leading-relaxed">{item.improvedAnswer}</p>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </section>

            {/* Next Steps */}
            <section className="print-break-avoid bg-white border border-slate-200/70 rounded-3xl p-6 space-y-3">
              <h2 className="font-display text-base font-bold text-slate-950">{t.nextStepsTitle}</h2>
              <ol className="space-y-2 text-sm text-slate-700">
                {report.actionableNextSteps.map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="font-mono tabular-nums font-semibold text-slate-400 shrink-0">
                      0{i + 1}
                    </span>
                    <span className="leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
      </main>
    </div>
  );
};
