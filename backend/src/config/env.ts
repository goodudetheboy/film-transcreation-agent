export interface Config {
  port: number;
  sharedPasscode: string;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  googleCloudProject: string;
  geminiLocation: string;
  geminiModel: string;
  parallelApiKey?: string;
  videoClipsBucket: string;
  maxVideoUploadBytes: number;
  filmsDataFile: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 8787),
    sharedPasscode: env.SHARED_PASSCODE ?? 'dev-passcode',
    rateLimitWindowMs: Number(env.RATE_LIMIT_WINDOW_MS ?? 60_000),
    rateLimitMax: Number(env.RATE_LIMIT_MAX ?? 1000),
    googleCloudProject: env.GOOGLE_CLOUD_PROJECT ?? 'silent-scholar-505618-u6',
    geminiLocation: env.GEMINI_LOCATION ?? 'us-central1',
    geminiModel: env.GEMINI_MODEL ?? 'gemini-2.5-flash',
    parallelApiKey: env.PARALLEL_API_KEY,
    videoClipsBucket: env.VIDEO_CLIPS_BUCKET ?? 'silent-scholar-505618-u6-clips',
    maxVideoUploadBytes: Number(env.MAX_VIDEO_UPLOAD_BYTES ?? 500_000_000),
    filmsDataFile: env.FILMS_DATA_FILE ?? '.data/films.json',
  };
}
