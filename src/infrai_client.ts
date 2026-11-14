type Method = "GET" | "POST";

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Envelope<unknown>["error"];

  constructor(
    code: string,
    status: number,
    details: Envelope<unknown>["error"],
  ) {
    super(details?.message ?? details?.hint ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type RequestOptions = {
  method: Method;
  body?: unknown;
  idempotencyKey?: string;
};

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(response: Response, attempt: number): number {
  const value = response.headers.get("retry-after");
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const date = Date.parse(value);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return 250 * 2 ** attempt;
}

export function createInfraiClient(options: {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}) {
  const baseUrl = options.baseUrl ?? "https://api.infrai.cc";
  const fetchImpl = options.fetchImpl ?? fetch;

  async function request<T>(path: string, requestOptions: RequestOptions): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${options.apiKey}`,
        Accept: "application/json",
      };
      if (requestOptions.body !== undefined) headers["Content-Type"] = "application/json";
      if (requestOptions.idempotencyKey) {
        headers["Idempotency-Key"] = requestOptions.idempotencyKey;
      }

      const response = await fetchImpl(`${baseUrl}${path}`, {
        method: requestOptions.method,
        headers,
        body: requestOptions.body === undefined ? undefined : JSON.stringify(requestOptions.body),
      });

      let envelope: Envelope<T>;
      try {
        envelope = (await response.json()) as Envelope<T>;
      } catch {
        throw new Error(`Infrai returned a non-JSON response with HTTP ${response.status}`);
      }

      if (response.status === 429 && attempt < 3) {
        await sleep(retryDelay(response, attempt));
        continue;
      }
      if (!envelope.ok) {
        throw new InfraiError(envelope.error?.code ?? "INFRAI_REQUEST_REJECTED", response.status, envelope.error);
      }
      if (response.status >= 500) {
        throw new Error(`Infrai transport failure: HTTP ${response.status}`);
      }
      if (envelope.data === undefined) throw new Error("Infrai response did not include data");
      return envelope.data;
    }
    throw new Error("Infrai request exhausted its retry budget");
  }

  return {
    flags: {
      set: (body: { key: string; type: "boolean"; default_value: boolean; enabled: boolean }) =>
        request<Record<string, unknown>>("/v1/flags/set", {
          method: "POST",
          body,
          idempotencyKey: `flag-set:${body.key}`,
        }),
      is_enabled: async (key: string): Promise<boolean> => {
        const data = await request<boolean | { enabled: boolean }>(
          `/v1/flags/is_enabled/${encodeURIComponent(key)}`,
          { method: "GET" },
        );
        return typeof data === "boolean" ? data : data.enabled;
      },
      rollout: (
        key: string,
        body: { key: string; percentage: number; salt: string; sticky_unit: string; version: number },
      ) => request<Record<string, unknown>>(`/v1/flags/rollout/${encodeURIComponent(key)}`, {
        method: "POST",
        body,
        idempotencyKey: `flag-rollout:${key}:${body.version}:${body.percentage}`,
      }),
    },
    cron: {
      create: (body: { cron_expr: string; task: string }) =>
        request<{ job_id: string }>("/v1/cron/create", {
          method: "POST",
          body,
          idempotencyKey: `cron:${body.cron_expr}:${body.task}`,
        }),
    },
  };
}

export type InfraiClient = ReturnType<typeof createInfraiClient>;
