export interface Env {
  ASSETS: Fetcher;
  RAILWAY_API_ORIGIN: string;
}

const API_PREFIXES = ["/v1/", "/api/"];

function isApiRequest(pathname: string): boolean {
  return API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestUrl = new URL(request.url);

    if (!isApiRequest(requestUrl.pathname)) {
      return env.ASSETS.fetch(request);
    }

    const upstreamUrl = new URL(
      `${requestUrl.pathname}${requestUrl.search}`,
      env.RAILWAY_API_ORIGIN,
    );

    const headers = new Headers(request.headers);
    headers.set("x-forwarded-host", requestUrl.host);
    headers.set("x-forwarded-proto", requestUrl.protocol.replace(":", ""));

    const init: RequestInit = {
      method: request.method,
      headers,
      redirect: "manual",
    };

    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = request.body;
    }

    return fetch(upstreamUrl, init);
  },
};
