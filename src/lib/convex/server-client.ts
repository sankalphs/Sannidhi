import { ConvexHttpClient } from "convex/browser";
import { cache } from "react";

function createConvexClient(): ConvexHttpClient {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL must be set");
  }
  return new ConvexHttpClient(url);
}

export const getCachedConvexClient = cache(createConvexClient);

export function getConvexClient(): ConvexHttpClient {
  return createConvexClient();
}
