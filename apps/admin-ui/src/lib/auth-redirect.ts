export interface LoginSearchParams {
  redirect?: string;
}

export function validateLoginSearch(
  search: Record<string, unknown>,
): LoginSearchParams {
  return {
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  };
}

export function getSafeRedirectHref(
  redirect: string | undefined,
  currentOrigin: string,
): string {
  if (!redirect) return "/";

  try {
    const url = new URL(redirect, currentOrigin);
    if (url.origin !== currentOrigin) return "/";
    if (url.pathname === "/login") return "/";
    const href = `${url.pathname}${url.search}${url.hash}`;
    return href || "/";
  } catch {
    return "/";
  }
}
