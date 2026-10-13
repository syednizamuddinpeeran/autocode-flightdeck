export const GENERIC_ERROR = "Could not reach the server.";

export async function readDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
  } catch {
    // fall through to generic message
  }
  return `Request failed (${res.status}).`;
}
