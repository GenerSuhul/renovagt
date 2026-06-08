/**
 * Thin HTTP client for the SAP middleware.
 *
 * Calls fail fast with `SapNotConfiguredError` when the server runtime
 * has no SAP_MIDDLEWARE_* environment variables configured.
 *
 * Use this client ONLY inside `createServerFn` handlers — never from
 * the browser. The API key must never reach the client bundle.
 */

import { loadSapConfig } from "./config";
import type { SapApiError } from "./dtos";

export class SapNotConfiguredError extends Error {
  constructor() {
    super("SAP middleware is not configured. Set SAP_MIDDLEWARE_URL and SAP_MIDDLEWARE_API_KEY.");
    this.name = "SapNotConfiguredError";
  }
}

export class SapApiException extends Error {
  constructor(public readonly error: SapApiError) {
    super(error.message);
    this.name = "SapApiException";
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
};

export async function sapFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const cfg = loadSapConfig();
  if (!cfg.baseUrl || !cfg.apiKey) throw new SapNotConfiguredError();

  const url = new URL(path.replace(/^\//, ""), cfg.baseUrl.endsWith("/") ? cfg.baseUrl : cfg.baseUrl + "/");
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  let lastErr: unknown;
  for (let attempt = 1; attempt <= cfg.retry.attempts; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        method: opts.method ?? "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": cfg.apiKey,
          "X-Company-DB": cfg.companyDb,
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: opts.signal ?? AbortSignal.timeout(cfg.timeoutMs),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new SapApiException({
          code: `HTTP_${res.status}`,
          message: text || res.statusText,
        });
      }

      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      if (attempt < cfg.retry.attempts) {
        await new Promise((r) => setTimeout(r, cfg.retry.backoffMs * attempt));
      }
    }
  }
  throw lastErr;
}
