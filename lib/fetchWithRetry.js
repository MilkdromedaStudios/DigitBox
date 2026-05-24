const DEFAULT_TIMEOUT_MS = 10000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(url, options = {}, retryOptions = {}) {
  const {
    retries = 2,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retryOnStatuses = [408, 425, 429, 500, 502, 503, 504],
  } = retryOptions;

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: options.signal || controller.signal,
      });

      clearTimeout(timeout);

      if (retryOnStatuses.includes(response.status) && attempt < retries) {
        await sleep(250 * (attempt + 1));
        continue;
      }

      return response;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt < retries) {
        await sleep(250 * (attempt + 1));
        continue;
      }
    }
  }

  throw lastError || new Error("Request failed");
}

export function toFriendlyNetworkError(error) {
  const message = String(error?.message || "");

  if (message.includes("aborted") || message.includes("AbortError")) {
    return "Request timed out. Please check your connection and try again.";
  }

  if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
    return "Network request failed (Failed to fetch). Verify API keys, endpoint URLs, CORS, and internet access.";
  }

  return error?.message || "Request failed";
}
