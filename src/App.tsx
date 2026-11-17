import { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AppStage,
  EvaluationReportData,
  InterviewConfig,
  TranscriptMessage,
} from './types';
import { LobbyView } from './components/LobbyView';
import { InterviewRoom } from './components/InterviewRoom';
import { EvaluationReport } from './components/EvaluationReport';

const DEFAULT_CONFIG: InterviewConfig = {
  position: 'Web Developer',
  interviewerType: 'mixed',
  experienceLevel: 'junior',
  language: 'id',
  questionCount: 5,
  candidateName: '',
};

export default function App() {
  const [stage, setStage] = useState<AppStage>('lobby');
  const [config, setConfig] = useState<InterviewConfig>(DEFAULT_CONFIG);

  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [initialMessage, setInitialMessage] = useState<{
    spokenResponse: string;
    topic: string;
    questionNumber: number;
  } | null>(null);

  const [sessionTranscript, setSessionTranscript] = useState<TranscriptMessage[]>([]);
  const [sessionDuration, setSessionDuration] = useState(0);

  const [report, setReport] = useState<EvaluationReportData | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);

  const handleStartInterview = async () => {
    setIsStarting(true);
    setStartError(null);
    setReport(null);

    try {
      const res = await fetch('/api/interview/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to start interview session.');
      }

      setInitialMessage({
        spokenResponse: data.spokenResponse,
        topic: data.topic,
        questionNumber: data.questionNumber || 1,
      });
      setStage('room');
    } catch (err: unknown) {
      setStartError(err instanceof Error ? err.message : 'Unable to connect to server.');
    } finally {
      setIsStarting(false);
    }
  };

  const runEvaluation = useCallback(
    async (transcriptToEval: TranscriptMessage[]) => {
      setIsEvaluating(true);
      setEvalError(null);

      try {
        const res = await fetch('/api/interview/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            config,
            transcript: transcriptToEval.map((m) => ({
              role: m.role,
              text: m.text,
              questionNumber: m.questionNumber,
              isFollowUp: m.isFollowUp,
            })),
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to evaluate interview transcript.');
        }

        setReport(data as EvaluationReportData);
      } catch (err: unknown) {
        setEvalError(err instanceof Error ? err.message : 'Evaluation request failed.');
      } finally {
        setIsEvaluating(false);
      }
    },
    [config],
  );

  const handleCompleteInterview = (transcript: TranscriptMessage[], durationSeconds: number) => {
    setSessionTranscript(transcript);
    setSessionDuration(durationSeconds);
    setStage('report');
    runEvaluation(transcript);
  };

  return (
    <AnimatePresence mode="wait">
      {stage === 'room' && initialMessage ? (
        <motion.div
          key="stage-room"
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.985 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          <InterviewRoom
            config={config}
            initialMessage={initialMessage}
            onCompleteInterview={handleCompleteInterview}
            onAbortToLobby={() => setStage('lobby')}
          />
        </motion.div>
      ) : stage === 'report' ? (
        <motion.div
          key="stage-report"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -14 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          <EvaluationReport
            config={config}
            durationSeconds={sessionDuration}
            transcript={sessionTranscript}
            report={report}
            isLoading={isEvaluating}
            error={evalError}
            onRetryEvaluate={() => runEvaluation(sessionTranscript)}
            onPracticeAgain={() => {
              setReport(null);
              setEvalError(null);
              setStage('lobby');
            }}
          />
        </motion.div>
      ) : (
        <motion.div
          key="stage-lobby"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <LobbyView
            config={config}
            onChangeConfig={setConfig}
            onStartInterview={handleStartInterview}
            isStarting={isStarting}
            startError={startError}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
