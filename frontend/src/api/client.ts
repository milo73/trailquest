const BASE = import.meta.env.VITE_API_BASE ?? "/api";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  opts?: { timeoutMs?: number },
): Promise<T> {
  const controller = opts?.timeoutMs != null ? new AbortController() : undefined;
  const timer = controller ? setTimeout(() => controller.abort(), opts!.timeoutMs) : undefined;
  const fetchInit: RequestInit = { headers: { "Content-Type": "application/json" }, ...init };
  if (controller) fetchInit.signal = controller.signal;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, fetchInit);
  } catch (err) {
    if (controller?.signal.aborted) throw new ApiError(408, "Verzoek duurde te lang");
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}
