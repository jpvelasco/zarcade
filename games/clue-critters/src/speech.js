// Optional read-aloud with the Web Speech API. Every call is safe when the
// browser has no speech support: it simply does nothing.

const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

export const speechSupported = !!synth && typeof window.SpeechSynthesisUtterance === 'function';

let voice = null;
function pickVoice() {
  if (!speechSupported || voice) return voice;
  const voices = synth.getVoices();
  voice = voices.find((v) => /^en(-|_)/i.test(v.lang) && /samantha|karen|google us|female|child/i.test(v.name))
    || voices.find((v) => /^en(-|_)/i.test(v.lang)) || null;
  return voice;
}
if (speechSupported) synth.addEventListener?.('voiceschanged', () => { voice = null; pickVoice(); });

// Emoji and symbols read badly, so strip them first.
export function speakable(text) {
  return String(text)
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/[“”]/g, '"')
    .replace(/✓/g, 'yes').replace(/✗/g, 'no')
    .replace(/\s+/g, ' ')
    .trim();
}

export function speak(text, { pitch = 1, rate = 0.92 } = {}) {
  if (!speechSupported) return false;
  try {
    synth.cancel();
    const u = new SpeechSynthesisUtterance(speakable(text));
    const v = pickVoice();
    if (v) u.voice = v;
    u.pitch = pitch;
    u.rate = rate;
    synth.speak(u);
    return true;
  } catch {
    return false;
  }
}

export function stopSpeaking() {
  if (!speechSupported) return;
  try { synth.cancel(); } catch { /* ignore */ }
}
