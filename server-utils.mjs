const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "accept-encoding",
  "accept-language",
  "content-length",
  "content-type",
  "if-modified-since",
  "if-none-match",
  "range",
];

export function createUpstreamHeaders(requestHeaders, host) {
  const headers = {
    host,
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  };

  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = requestHeaders[name];
    if (value !== undefined) headers[name] = value;
  }

  return headers;
}

export function resolvePublicPathname(pathname) {
  if (pathname === "/privacy" || pathname === "/legal") return `${pathname}/index.html`;
  return pathname;
}
