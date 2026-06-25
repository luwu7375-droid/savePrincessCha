// ElevenLabs TTS provider

export interface VoiceSettings {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  use_speaker_boost?: boolean;
  speed?: number;
}

export interface GenerateSpeechParams {
  text: string;
  voice_id: string;
  model_id: string;
  settings?: VoiceSettings;
}

export interface GenerateSpeechResult {
  audioBuffer: ArrayBuffer;
  contentType: string;
  providerStatus: number;
  rawProviderError?: string;
}

const DEFAULT_SETTINGS: VoiceSettings = {
  stability: 0.44,
  similarity_boost: 0.78,
  style: 0.30,
  use_speaker_boost: true,
  speed: 1.0,
};

export async function generateSpeech(
  apiKey: string,
  params: GenerateSpeechParams,
): Promise<GenerateSpeechResult> {
  const settings = { ...DEFAULT_SETTINGS, ...params.settings };

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${params.voice_id}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: params.text,
        model_id: params.model_id,
        voice_settings: settings,
      }),
    },
  );

  const providerStatus = res.status;

  if (!res.ok) {
    const rawProviderError = (await res.text()).slice(0, 500);
    return { audioBuffer: new ArrayBuffer(0), contentType: "", providerStatus, rawProviderError };
  }

  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("audio")) {
    const rawProviderError = `bad content-type: ${ct}; body: ${(await res.text()).slice(0, 200)}`;
    return { audioBuffer: new ArrayBuffer(0), contentType: ct, providerStatus: 502, rawProviderError };
  }

  const audioBuffer = await res.arrayBuffer();
  return { audioBuffer, contentType: ct, providerStatus };
}
