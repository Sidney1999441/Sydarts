const DEFAULT_SUPABASE_TIMEOUT_MS = 10000;

export function createTimedSupabaseFetch(timeoutMs = DEFAULT_SUPABASE_TIMEOUT_MS): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const signal = init?.signal;

    if (signal) {
      if (signal.aborted) {
        controller.abort();
      } else {
        signal.addEventListener("abort", () => controller.abort(), { once: true });
      }
    }

    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal
      });
    } catch {
      return new Response(JSON.stringify({ error: "Supabase request failed" }), {
        status: 503,
        headers: {
          "Content-Type": "application/json"
        }
      });
    } finally {
      clearTimeout(timeout);
    }
  };
}
