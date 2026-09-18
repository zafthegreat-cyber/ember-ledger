import type { EbayFetch } from "./ebayBrowse.service";

export type MockEbayRoute = {
  method?: string;
  urlIncludes: string;
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
  delayMs?: number;
};

export type MockEbayCall = {
  method: string;
  url: string;
  headers: Headers;
  body: string;
};

export function createMockEbayFetch(routes: MockEbayRoute[]): EbayFetch & { calls: MockEbayCall[] } {
  const calls: MockEbayCall[] = [];
  const mockFetch = async (input: string | URL, init: RequestInit = {}): Promise<Response> => {
    const url = String(input);
    const method = String(init.method || "GET").toUpperCase();
    const route = routes.find((candidate) =>
      url.includes(candidate.urlIncludes) && String(candidate.method || "GET").toUpperCase() === method,
    );
    calls.push({
      method,
      url,
      headers: new Headers(init.headers),
      body: typeof init.body === "string" ? init.body : "",
    });
    if (!route) {
      return new Response(JSON.stringify({ error: "No mock route matched." }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (route.delayMs) await new Promise((resolve) => setTimeout(resolve, route.delayMs));
    return new Response(JSON.stringify(route.body ?? {}), {
      status: route.status ?? 200,
      headers: { "Content-Type": "application/json", ...(route.headers || {}) },
    });
  };
  return Object.assign(mockFetch, { calls });
}
