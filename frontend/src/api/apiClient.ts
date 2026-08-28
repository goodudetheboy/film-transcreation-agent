export interface ApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

function resolveBaseUrl(options: ApiClientOptions): string {
  return options.baseUrl ?? (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? '';
}

/** Extracts a human-readable detail from a non-ok response body, if any. */
async function describeError(res: Response): Promise<string> {
  let detail = '';
  try {
    const text = await res.text();
    if (text) {
      try {
        const parsed = JSON.parse(text) as { error?: unknown };
        detail = typeof parsed.error === 'string' ? parsed.error : text;
      } catch {
        detail = text;
      }
    }
  } catch {
    // response body unreadable — fall back to a status-only message
  }
  return detail;
}

export interface VerifyPasscodeResult {
  ok: boolean;
  message?: string;
}

/** Lets the passcode gate confirm correctness before showing the main UI. */
export async function verifyPasscode(
  passcode: string,
  options: ApiClientOptions = {},
): Promise<VerifyPasscodeResult> {
  const baseUrl = resolveBaseUrl(options);
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(`${baseUrl}/api/verify-passcode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode }),
  });

  if (res.ok) {
    return { ok: true };
  }

  const detail = await describeError(res);
  return { ok: false, message: detail || `request failed with status ${res.status}` };
}
