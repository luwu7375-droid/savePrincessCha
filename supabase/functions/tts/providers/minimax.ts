// MiniMax TTS provider — stub (not yet configured)

export interface GenerateSpeechParams {
  text: string;
  voice_id: string;
  model_id: string;
  settings?: Record<string, unknown>;
}

export interface GenerateSpeechResult {
  audioBuffer: ArrayBuffer;
  contentType: string;
  providerStatus: number;
  rawProviderError?: string;
}

export async function generateSpeech(
  _apiKey: string,
  _params: GenerateSpeechParams,
): Promise<GenerateSpeechResult> {
  return {
    audioBuffer: new ArrayBuffer(0),
    contentType: "",
    providerStatus: 501,
    rawProviderError: "MiniMax TTS provider is not yet configured",
  };
}
