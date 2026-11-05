import { stripServerErrorFraming } from "./describe-error";

/** POSTs JSON to an app route; throws an Error carrying the route's human `error` message. */
export async function postJson(url: string, body: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof data.error === "string" ? stripServerErrorFraming(data.error) : "";
    throw new Error(message.length > 0 ? message : "Request failed. Please try again.");
  }
  return data;
}
