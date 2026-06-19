const BRAPI_BASE_URL = "https://brapi.dev/api/v2";
const BRAPI_FETCH_TIMEOUT_MS = Number(
  process.env.BRAPI_FETCH_TIMEOUT_MS ??
    process.env.OPTIONS_SCRAPER_TIMEOUT_MS ??
    8000
);

export function getBrapiHeaders(): Record<string, string> {
  const token = process.env.BRAPI_API_TOKEN ?? process.env.BRAPI_TOKEN;

  return {
    Accept: "application/json",
    "User-Agent": "options-market-api/1.0",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function buildBrapiUrl(path: string, params: Record<string, string>) {
  const url = new URL(`${BRAPI_BASE_URL}${path}`);

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  return url;
}

export async function fetchBrapiJson<T>(
  path: string,
  params: Record<string, string>
): Promise<T> {
  const url = buildBrapiUrl(path, params);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BRAPI_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: getBrapiHeaders(),
    });

    if (!response.ok) {
      throw new Error(`brapi.dev respondeu ${response.status} em ${url.pathname}.`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}
