// Wrap the global fetch so the debug panel can inject errors, force a
// specific status code for a URL pattern, or add artificial latency.
//
// Each app imports `installDebugFetch()` once during bootstrap and continues
// using the native `fetch` as usual. When no overrides are set the wrapper
// is a passthrough (single extra function call).

import { getOverrides } from "./overrides";

let installed = false;
let originalFetch: typeof fetch | null = null;

export function installDebugFetch() {
  if (installed) return;
  if (typeof fetch !== "function") return;
  installed = true;
  originalFetch = fetch;

  const wrapped: typeof fetch = async (input, init) => {
    const overrides = getOverrides();

    if (overrides.apiLatencyMs && overrides.apiLatencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, overrides.apiLatencyMs));
    }

    if (overrides.apiErrorStatus && matchesPath(input, overrides.apiErrorPath)) {
      const body = JSON.stringify({
        error: `Debug: forced ${overrides.apiErrorStatus}`
      });
      return new Response(body, {
        status: overrides.apiErrorStatus,
        headers: { "Content-Type": "application/json" }
      });
    }

    return originalFetch!(input, init);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = wrapped;
}

function matchesPath(
  input: RequestInfo | URL,
  pattern: string | null | undefined
): boolean {
  if (!pattern) return true;
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  if (pattern.endsWith("*")) {
    return url.includes(pattern.slice(0, -1));
  }
  return url.includes(pattern);
}
