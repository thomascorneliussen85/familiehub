import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

// Flash v2.5 er ElevenLabs sin lavest-latency-modell (< 75ms), anbefalt for
// taleassistenter fremfor v3/Multilingual v2 (som er laget for uttrykksfull
// fortelling, ikke responstid) – og støtter norsk.
const MODEL_ID = 'eleven_flash_v2_5';

export async function synthesizeSpeech(text, apiKey, voiceId) {
  const client = new ElevenLabsClient({ apiKey });
  const audio = await client.textToSpeech.convert(voiceId, {
    text,
    modelId: MODEL_ID,
    outputFormat: 'mp3_44100_128',
  });
  return Buffer.from(audio);
}

export async function listVoices(apiKey) {
  const client = new ElevenLabsClient({ apiKey });
  const result = await client.voices.search();
  const voices = Array.isArray(result) ? result : result.voices || [];
  return voices.map((v) => ({ id: v.voice_id, name: v.name }));
}
