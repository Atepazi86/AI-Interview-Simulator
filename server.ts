import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const MODEL_NAME = 'gemini-4-hydrogen';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured in environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient = msg.includes('429') || msg.includes('503') || msg.includes('RESOURCE_EXHAUSTED');
      if (!isTransient || attempt === maxRetries) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 800 * Math.pow(2, attempt)));
    }
  }
  throw lastError;
}

interface InterviewConfigBody {
  position: string;
  interviewerType: 'hrd' | 'tech' | 'mixed';
  experienceLevel: 'fresh_grad' | 'junior' | 'senior';
  language: 'id' | 'en';
  questionCount: number;
  candidateName?: string;
}

interface HistoryTurn {
  role: 'interviewer' | 'candidate';
  text: string;
  questionNumber: number;
  isFollowUp?: boolean;
}

function buildPersonaContext(config: InterviewConfigBody): string {
  const levelMap = {
    fresh_grad: config.language === 'id' ? 'Fresh Graduate / Magang' : 'Fresh Graduate / Intern',
    junior: config.language === 'id' ? 'Junior (1-2 tahun pengalaman)' : 'Junior (1-2 years experience)',
    senior: config.language === 'id' ? 'Senior (pengalaman mendalam & leadership)' : 'Senior (deep expertise & leadership)',
  };

  const personaMap = {
    hrd:
      config.language === 'id'
        ? 'Kamu adalah Nadia Kusuma, Senior HRD Recruiter yang hangat, empatik, namun tajam membaca konsistensi kandidat. Fokusmu: kepribadian, motivasi melamar, kecocokan budaya kerja, cara menghadapi konflik, dan ekspektasi karier/gaji.'
        : 'You are Nadia Kusuma, a warm, observant Senior HR Recruiter. Your focus: personality, motivation, culture fit, conflict handling, and career/compensation expectations.',
    tech:
      config.language === 'id'
        ? 'Kamu adalah Rama Wijaya, User / Tech Lead yang ramah, praktis, dan kritis. Fokusmu: studi kasus nyata sesuai posisi, problem solving, alasan di balik keputusan kerja/teknis, tantangan proyek, dan hasil terukur.'
        : 'You are Rama Wijaya, a practical, analytical Hiring Lead. Your focus: real role-specific case studies, problem solving, trade-off reasoning, project challenges, and measurable impact.',
    mixed:
      config.language === 'id'
        ? 'Kamu adalah Clara Halim, Hiring Director yang memadukan sudut pandang HRD dan User Lead. Kamu menggali motivasi/budaya kerja sekaligus menguji studi kasus praktis dan kemampuan eksekusi kandidat.'
        : 'You are Clara Halim, a poised Hiring Director blending HR behavioral probes with practical role-specific case questions.',
  };

  const langRule =
    config.language === 'id'
      ? `BAHASA: Gunakan Bahasa Indonesia yang natural, hangat, dan profesional layaknya panggilan video kerja di perusahaan modern (gunakan sapaan "kamu" yang ramah dan sopan, hindari bahasa terjemahan kaku atau terlalu formal seperti surat dinas).`
      : `LANGUAGE: Use natural, warm, professional conversational English suited for a live video interview.`;

  return `${personaMap[config.interviewerType]}
POSISI DILAMAR: ${config.position}
TINGKAT PENGALAMAN: ${levelMap[config.experienceLevel]}
NAMA KANDIDAT: ${config.candidateName?.trim() || (config.language === 'id' ? 'Kandidat' : 'Candidate')}
TOTAL SESI PERTANYAAN UTAMA: ${config.questionCount} pertanyaan.

${langRule}

ATURAN KETAT GAYA BICARA (UNTUK TEXT-TO-SPEECH):
1. Tulis respons seperti ucapan lisan manusiawi—JANGAN pernah memakai markdown, tanda bintang (*), poin-poin bernomor, emoji, atau kurung aksi seperti [tersenyum].
2. Maksimal 3 sampai 4 kalimat pendek per giliran agar enak didengar lewat suara dan tidak melelahkan.
3. Jadilah pewawancara yang realistis dan kritis namun suportif: jangan memuji berlebihan ("Luar biasa sekali!") jika jawaban kandidat masih umum.`;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // 1. Start interview session & generate opening greeting + Question 1
  app.post('/api/interview/start', async (req, res) => {
    try {
      const config = req.body?.config as InterviewConfigBody;
      if (!config?.position) {
        return res.status(400).json({ error: 'Position is required.' });
      }

      const ai = getAiClient();
      const systemInstruction = buildPersonaContext(config);
      const candidateLabel = config.candidateName?.trim() || (config.language === 'id' ? 'kandidat' : 'candidate');

      const prompt =
        config.language === 'id'
          ? `Mulai sesi wawancara video 1-on-1 untuk posisi "${config.position}" bersama ${candidateLabel}. Sapa kandidat dengan singkat dan hangat (1 kalimat), lalu langsung ajukan Pertanyaan ke-1 (pembuka/perkenalan yang relevan dengan posisi tersebut). Total maksimal 3 kalimat lisan tanpa markdown.`
          : `Start the 1-on-1 video interview for "${config.position}" with ${candidateLabel}. Greet them briefly and warmly (1 sentence), then ask Question 1 (an opening prompt tailored to the role). Maximum 3 spoken sentences total, no markdown.`;

      const result = await withRetry(() =>
        ai.models.generateContent({
          model: MODEL_NAME,
          contents: prompt,
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                spokenResponse: {
                  type: Type.STRING,
                  description: 'Natural spoken greeting and Question 1, plain text only, 2-3 sentences.',
                },
                topic: {
                  type: Type.STRING,
                  description: 'Short 2-4 word topic label for this question.',
                },
              },
              required: ['spokenResponse', 'topic'],
            },
          },
        }),
      );

      const parsed = JSON.parse((result.text ?? '{}').trim());
      return res.json({
        spokenResponse: parsed.spokenResponse,
        topic: parsed.topic || (config.language === 'id' ? 'Perkenalan & Motivasi' : 'Introduction & Motivation'),
        questionNumber: 1,
        isFollowUp: false,
        shouldConclude: false,
      });
    } catch (error: unknown) {
      console.error('Error in /api/interview/start:', error);
      const message = error instanceof Error ? error.message : 'Failed to start interview.';
      return res.status(500).json({ error: message });
    }
  });

  // 2. Process candidate answer & generate natural reaction + follow-up or next question
  app.post('/api/interview/turn', async (req, res) => {
    try {
      const {
        config,
        history,
        currentQuestionIndex,
        followUpsOnCurrentTopic,
        userAnswer,
      } = req.body as {
        config: InterviewConfigBody;
        history: HistoryTurn[];
        currentQuestionIndex: number;
        followUpsOnCurrentTopic: number;
        userAnswer: string;
      };

      if (!config || !userAnswer?.trim()) {
        return res.status(400).json({ error: 'Config and userAnswer are required.' });
      }

      const ai = getAiClient();
      const systemInstruction = buildPersonaContext(config);

      const formattedHistory = (history || [])
        .map((h) => `${h.role === 'interviewer' ? 'Interviewer' : 'Candidate'} (Q${h.questionNumber}): ${h.text}`)
        .join('\n');

      const canFollowUp = followUpsOnCurrentTopic < 1 && currentQuestionIndex <= config.questionCount;
      const isLastQuestion = currentQuestionIndex >= config.questionCount;

      const instructionPrompt =
        config.language === 'id'
          ? `RIWAYAT PERCAKAPAN SEJAUH INI:
${formattedHistory}

JAWABAN TERBARU KANDIDAT (untuk Pertanyaan ke-${currentQuestionIndex} dari ${config.questionCount}):
"${userAnswer.trim()}"

STATUS SESI:
- Pertanyaan utama saat ini: ${currentQuestionIndex} dari ${config.questionCount}
- Follow-up yang sudah diajukan pada topik ini: ${followUpsOnCurrentTopic} (maksimal 1 follow-up per topik)

TUGASMU DI GILIRAN INI:
1. Berikan reaksi/tanggapan singkat (1 kalimat) yang SECARA SPESIFIK merujuk pada poin yang baru saja diucapkan kandidat (contoh: "Poin yang bagus soal koordinasi tim tadi...", atau "Hmm, jawabanmu masih agak umum nih...").
2. Tentukan langkah berikutnya:
   - ${canFollowUp ? 'Jika jawaban kandidat masih dangkal, terlalu singkat (< 15 kata), atau belum memberi contoh/dampak konkret, pilih isFollowUp = true dan ajukan 1 pertanyaan lanjutan yang menggali detail tersebut.' : 'Follow-up sudah maksimal untuk topik ini, jadi WAJIB lanjut ke pertanyaan baru atau penutupan (isFollowUp = false).'}
   - ${isLastQuestion ? 'Jika jawaban ini sudah cukup menutup Pertanyaan terakhir (atau follow-up terakhir tidak diperlukan), atur shouldConclude = true dan berikan penutupan hangat bahwa sesi tanya jawab sudah selesai dan kandidat bisa melihat rapor evaluasinya.' : `Jika lanjut topik baru, ajukan Pertanyaan ke-${currentQuestionIndex + 1} yang relevan dengan peran ${config.position} (${config.interviewerType}) dan berbeda dari pertanyaan sebelumnya.`}
3. Gabungkan reaksi + pertanyaan/penutupan dalam "spokenResponse" maksimal 3-4 kalimat lisan yang mengalir alami, tanpa markdown atau simbol aneh.`
          : `CONVERSATION HISTORY SO FAR:
${formattedHistory}

LATEST CANDIDATE ANSWER (for Question ${currentQuestionIndex} of ${config.questionCount}):
"${userAnswer.trim()}"

SESSION STATUS:
- Current main question: ${currentQuestionIndex} of ${config.questionCount}
- Follow-ups already asked on this topic: ${followUpsOnCurrentTopic} (max 1 follow-up per topic)

YOUR TASK THIS TURN:
1. Give a brief 1-sentence reaction SPECIFICALLY referencing something the candidate just said (e.g., "That's an interesting point about stakeholder alignment..." or "Hmm, that felt a bit high-level...").
2. Decide the next move:
   - ${canFollowUp ? 'If the answer is vague, overly brief (< 15 words), or lacks concrete examples/outcomes, set isFollowUp = true and ask one sharp follow-up question probing deeper.' : 'Follow-up limit reached for this topic, so you MUST move forward (isFollowUp = false).'}
   - ${isLastQuestion ? 'If this completes the final question cleanly, set shouldConclude = true and deliver a warm closing remark letting the candidate know the interview is complete and their evaluation report is ready.' : `If advancing to a new topic, ask Question ${currentQuestionIndex + 1} tailored to ${config.position} (${config.interviewerType}) without repeating prior topics.`}
3. Combine your reaction + next question/closing into "spokenResponse" (max 3-4 natural spoken sentences, plain text, no markdown).`;

      const result = await withRetry(() =>
        ai.models.generateContent({
          model: MODEL_NAME,
          contents: instructionPrompt,
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                spokenResponse: {
                  type: Type.STRING,
                  description: 'Combined natural reaction + follow-up/next question or warm closing, plain text, max 4 sentences.',
                },
                topic: {
                  type: Type.STRING,
                  description: 'Short 2-4 word topic label for this turn.',
                },
                isFollowUp: {
                  type: Type.BOOLEAN,
                  description: 'True if probing deeper on the same question topic; false if moving to next question or concluding.',
                },
                shouldConclude: {
                  type: Type.BOOLEAN,
                  description: 'True only when all main questions are done and this is the final closing remark.',
                },
              },
              required: ['spokenResponse', 'topic', 'isFollowUp', 'shouldConclude'],
            },
          },
        }),
      );

      const parsed = JSON.parse((result.text ?? '{}').trim());
      const isFollowUp = Boolean(parsed.isFollowUp) && canFollowUp && !parsed.shouldConclude;
      const shouldConclude = Boolean(parsed.shouldConclude);
      const nextQuestionNumber = shouldConclude
        ? currentQuestionIndex
        : isFollowUp
          ? currentQuestionIndex
          : Math.min(currentQuestionIndex + 1, config.questionCount);

      return res.json({
        spokenResponse: parsed.spokenResponse,
        topic: parsed.topic || (config.language === 'id' ? 'Pendalaman Topik' : 'Topic Discussion'),
        isFollowUp,
        shouldConclude,
        questionNumber: nextQuestionNumber,
      });
    } catch (error: unknown) {
      console.error('Error in /api/interview/turn:', error);
      const message = error instanceof Error ? error.message : 'Failed to process interview turn.';
      return res.status(500).json({ error: message });
    }
  });

  // 3. Generate comprehensive STAR Evaluation Report from transcript
  app.post('/api/interview/evaluate', async (req, res) => {
    try {
      const { config, transcript } = req.body as {
        config: InterviewConfigBody;
        transcript: HistoryTurn[];
      };

      if (!config || !Array.isArray(transcript) || transcript.length === 0) {
        return res.status(400).json({ error: 'Config and non-empty transcript are required.' });
      }

      const ai = getAiClient();
      const transcriptText = transcript
        .map((t, idx) => `[${idx + 1}] ${t.role === 'interviewer' ? 'PEWAWANCARA' : 'KANDIDAT'} (Topik #${t.questionNumber}): ${t.text}`)
        .join('\n');

      const isId = config.language === 'id';
      const evalPrompt = isId
        ? `Kamu adalah Senior Career Coach & Hiring Evaluator profesional. Analisis secara objektif, jujur, dan mendalam transkrip simulasi wawancara kerja berikut.

DETAIL SESI:
- Posisi: ${config.position}
- Tipe Pewawancara: ${config.interviewerType}
- Level Pengalaman: ${config.experienceLevel}
- Bahasa: Indonesia

TRANSKRIP LENGKAP:
${transcriptText}

INSTRUKSI PENILAIAN:
1. Berikan overallScore (0-100) yang realistis sesuai kualitas nyata jawaban kandidat di transkrip (jangan asal memberi nilai tinggi jika jawabannya pendek atau tidak menjawab inti pertanyaan).
2. Tentukan readinessLabel singkat (contoh: "Sangat Siap", "Siap Bersaing", "Cukup Baik - Perlu Pendalaman", atau "Perlu Latihan Intensif").
3. Tulis executiveSummary (2-3 kalimat) yang merangkum kekuatan utama dan celah terbesar kandidat.
4. Nilai tepat 4 aspek berikut dalam array "aspects":
   - id: "communication", name: "Kejelasan Komunikasi"
   - id: "star_structure", name: "Relevansi & Struktur (STAR)"
   - id: "confidence", name: "Kepercayaan Diri"
   - id: "technical_depth", name: "Kedalaman Teknis & Peran"
5. Untuk "questionBreakdown": pasangkan setiap pertanyaan pewawancara yang benar-benar dijawab oleh kandidat (abaikan ucapan penutup yang tidak memiliki jawaban kandidat). Untuk setiap item:
   - Sertakan pertanyaan asli pewawancara, jawaban asli kandidat, skor (0-100), catatan kekurangan spesifik (critique: misal terlalu umum, kurang angka/metrik, belum menjelaskan Action/Result), dan "improvedAnswer" (Contoh Jawaban Versi Lebih Meyakinkan yang ditulis ulang dalam bahasa Indonesia profesional berbasis konteks jawaban kandidat dengan metode STAR).
6. Berikan 3 langkah latihan konkret dalam "actionableNextSteps".`
        : `You are a Senior Career Coach & Hiring Evaluator. Analyze the following mock interview transcript objectively and thoroughly.

SESSION DETAILS:
- Position: ${config.position}
- Interviewer Type: ${config.interviewerType}
- Experience Level: ${config.experienceLevel}
- Language: English

FULL TRANSCRIPT:
${transcriptText}

EVALUATION INSTRUCTIONS:
1. Give a realistic overallScore (0-100) grounded strictly in the candidate's actual transcript responses.
2. Provide a concise readinessLabel (e.g., "Interview Ready", "Competitive", "Developing - Needs Depth", "Needs Intensive Practice").
3. Write a 2-3 sentence executiveSummary highlighting top strengths and highest-leverage gap.
4. Score exactly these 4 aspects in "aspects":
   - id: "communication", name: "Communication Clarity"
   - id: "star_structure", name: "Relevance & Structure (STAR)"
   - id: "confidence", name: "Confidence & Presence"
   - id: "technical_depth", name: "Technical & Role Depth"
5. For "questionBreakdown": pair each interviewer question that received a candidate answer (skip closing remarks without an answer). Include the exact question, candidateAnswer, score (0-100), honest critique (e.g., vague, missing metrics, missing STAR Result), and improvedAnswer (a persuasive rewritten answer tailored to the candidate's context using STAR).
6. Provide 3 concrete actionableNextSteps.`;

      const result = await withRetry(() =>
        ai.models.generateContent({
          model: MODEL_NAME,
          contents: evalPrompt,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                overallScore: { type: Type.INTEGER },
                readinessLabel: { type: Type.STRING },
                executiveSummary: { type: Type.STRING },
                aspects: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      name: { type: Type.STRING },
                      score: { type: Type.INTEGER },
                      feedback: { type: Type.STRING },
                    },
                    required: ['id', 'name', 'score', 'feedback'],
                  },
                },
                questionBreakdown: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      questionNumber: { type: Type.INTEGER },
                      question: { type: Type.STRING },
                      candidateAnswer: { type: Type.STRING },
                      score: { type: Type.INTEGER },
                      critique: { type: Type.STRING },
                      improvedAnswer: { type: Type.STRING },
                    },
                    required: ['questionNumber', 'question', 'candidateAnswer', 'score', 'critique', 'improvedAnswer'],
                  },
                },
                actionableNextSteps: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: [
                'overallScore',
                'readinessLabel',
                'executiveSummary',
                'aspects',
                'questionBreakdown',
                'actionableNextSteps',
              ],
            },
          },
        }),
      );

      const report = JSON.parse((result.text ?? '{}').trim());
      return res.json(report);
    } catch (error: unknown) {
      console.error('Error in /api/interview/evaluate:', error);
      const message = error instanceof Error ? error.message : 'Failed to generate evaluation report.';
      return res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`InterviewMeet AI server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
