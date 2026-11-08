// Enkel wrapper rundt nettleserens innebygde tale-syntese, satt opp for norsk.
// Brukes på barnas gøy-modus slik at små barn kan få lest opp oppgaver og
// belønninger uten å måtte kunne lese selv.

let preferredVoice = null;

function pickNorwegianVoice() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang?.toLowerCase().startsWith('nb')) ||
    voices.find((v) => v.lang?.toLowerCase().startsWith('no')) ||
    voices.find((v) => v.lang?.toLowerCase().startsWith('nn')) ||
    null
  );
}

if (typeof window !== 'undefined' && window.speechSynthesis) {
  preferredVoice = pickNorwegianVoice();
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    preferredVoice = pickNorwegianVoice();
  });
}

export function speak(text) {
  if (typeof window === 'undefined' || !window.speechSynthesis || !text) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'nb-NO';
  utterance.rate = 0.92;
  utterance.pitch = 1.1;
  if (preferredVoice) utterance.voice = preferredVoice;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}
