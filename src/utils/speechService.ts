import { InterviewLanguage } from '../types';

function pickBestVoice(lang: InterviewLanguage): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const targetPrefix = lang === 'id' ? 'id' : 'en';
  const matching = voices.filter((v) => v.lang.toLowerCase().startsWith(targetPrefix));
  if (!matching.length) return null;

  // Prefer natural/Google/Microsoft neural voices over basic robotic ones
  const preferredKeywords =
    lang === 'id'
      ? ['google', 'gadis', 'ardi', 'damayanti', 'natural', 'online']
      : ['google us', 'natural', 'samantha', 'daniel', 'jenny', 'aria', 'google uk'];

  for (const kw of preferredKeywords) {
    const found = matching.find((v) => v.name.toLowerCase().includes(kw));
    if (found) return found;
  }

  return matching.find((v) => v.default) || matching[0];
}

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Splits long text into natural sentence chunks so Chrome's speechSynthesis
 * does not silently stall on utterances longer than ~15 seconds.
 */
function splitIntoSentences(text: string): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  const parts = cleaned.match(/[^.!?]+[.!?]*/g) || [cleaned];
  return parts.map((p) => p.trim()).filter(Boolean);
}

export function speakText(
  text: string,
  lang: InterviewLanguage,
  callbacks?: {
    onStart?: () => void;
    onEnd?: () => void;
    onError?: () => void;
  },
): void {
  if (!isSpeechSynthesisSupported()) {
    callbacks?.onEnd?.();
    return;
  }

  window.speechSynthesis.cancel();

  const sentences = splitIntoSentences(text);
  if (sentences.length === 0) {
    callbacks?.onEnd?.();
    return;
  }

  let started = false;
  let cancelled = false;
  const voice = pickBestVoice(lang);

  const speakNext = (index: number) => {
    if (cancelled || index >= sentences.length) {
      callbacks?.onEnd?.();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(sentences[index]);
    utterance.lang = lang === 'id' ? 'id-ID' : 'en-US';
    if (voice) {
      utterance.voice = voice;
    }
    utterance.rate = lang === 'id' ? 1.02 : 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      if (!started) {
        started = true;
        callbacks?.onStart?.();
      }
    };

    utterance.onend = () => {
      speakNext(index + 1);
    };

    utterance.onerror = (event) => {
      if (event.error === 'interrupted' || event.error === 'canceled') {
        cancelled = true;
        return;
      }
      callbacks?.onError?.();
      callbacks?.onEnd?.();
    };

    window.speechSynthesis.speak(utterance);
  };

  // Ensure voices are loaded if browser initializes them lazily
  if (window.speechSynthesis.getVoices().length === 0) {
    const handler = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', handler);
      speakNext(0);
    };
    window.speechSynthesis.addEventListener('voiceschanged', handler);
    setTimeout(() => {
      window.speechSynthesis.removeEventListener('voiceschanged', handler);
      if (!started && !cancelled) speakNext(0);
    }, 250);
  } else {
    speakNext(0);
  }
}

export function playSpeakerTestChime(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 pleasant triad
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.09);
      gain.gain.setValueAtTime(0.001, now + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.08, now + i * 0.09 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.09);
      osc.stop(now + i * 0.09 + 0.3);
    });
  } catch {
    // Ignore audio context restriction if unavailable
  }
}
