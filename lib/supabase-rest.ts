function getSupabaseConfig() {
  const baseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl) throw new Error("Supabase is not configured. Set SUPABASE_URL.");
  return { baseUrl: baseUrl.replace(/\/$/, "") };
}

export class SupabaseRequestError extends Error {
  status: number;
  details: unknown;

  constructor(status: number, message: string, details: unknown) {
    super(message);
    this.name = "SupabaseRequestError";
    this.status = status;
    this.details = details;
  }
}

export function getSupabaseServiceRoleKey() {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is required for server-side database access.");
  return key;
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/**
 * Not exported on purpose. Callers that need database access go through
 * supabaseServerRestRequest, which supplies the credential itself, so no
 * module outside this file can choose which identity a query runs as.
 * Authorization for these tables lives in lib/care-repository.ts.
 */
async function supabaseRestRequest<T>(
  path: string,
  options: { method?: "GET" | "POST" | "PATCH"; body?: unknown; accessToken: string; prefer?: string },
): Promise<T> {
  const { baseUrl } = getSupabaseConfig();
  const response = await fetch(`${baseUrl}/rest/v1${path}`, {
    method: options.method ?? "GET",
    headers: {
      apikey: getSupabaseServiceRoleKey(),
      Authorization: `Bearer ${options.accessToken}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    const message = typeof payload === "object" && payload && "message" in payload && typeof payload.message === "string"
      ? payload.message
      : "Supabase data request failed.";
    throw new SupabaseRequestError(response.status, message, payload);
  }
  return payload as T;
}

export function supabaseServerRestRequest<T>(
  path: string,
  options: { method?: "GET" | "POST" | "PATCH"; body?: unknown; prefer?: string } = {},
) {
  return supabaseRestRequest<T>(path, { ...options, accessToken: getSupabaseServiceRoleKey() });
}

export function supabaseServerStorageUpload(
  bucket: string,
  path: string,
  data: ArrayBuffer,
  options: { contentType: string },
) {
  return supabaseStorageUpload(bucket, path, data, {
    ...options,
    accessToken: getSupabaseServiceRoleKey(),
  });
}

/** Not exported on purpose — see supabaseRestRequest above. */
async function supabaseStorageUpload(
  bucket: string,
  path: string,
  data: ArrayBuffer,
  options: { accessToken: string; contentType: string },
): Promise<void> {
  const { baseUrl } = getSupabaseConfig();
  const response = await fetch(`${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`, {
    method: "POST",
    headers: {
      apikey: getSupabaseServiceRoleKey(),
      Authorization: `Bearer ${options.accessToken}`,
      "Content-Type": options.contentType,
      "x-upsert": "false",
    },
    body: data,
    cache: "no-store",
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    const message = typeof payload === "object" && payload && "message" in payload && typeof payload.message === "string"
      ? payload.message
      : "Supabase audio upload failed.";
    throw new SupabaseRequestError(response.status, message, payload);
  }
}
