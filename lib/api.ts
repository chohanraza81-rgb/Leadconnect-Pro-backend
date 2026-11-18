// lib/api.ts
"use client";
import { useAuth } from "@clerk/nextjs";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://leadconnect-pro-backend-production-4f7711e5.up.railway.app/api";

/**
 * Hook: returns a fetch wrapper that auto-attaches Clerk auth token.
 *
 * Usage (inside a React component):
 *   const apiFetch = useApiFetch();
 *   const res = await apiFetch("/finder", { method: "POST", body: JSON.stringify(...) });
 *
 * The wrapper:
 *   - Prepends the base API URL (if endpoint starts with "/")
 *   - Attaches `Authorization: Bearer <clerk_token>` automatically
 *   - Sets `Content-Type: application/json` when body exists
 */
export function useApiFetch() {
  const { getToken } = useAuth();

  return async (endpoint: string, options: RequestInit = {}): Promise<Response> => {
    const token = await getToken();

    const headers = new Headers(options.headers || {});
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    if (!headers.has("Content-Type") && options.body) {
      headers.set("Content-Type", "application/json");
    }

    const url = endpoint.startsWith("http") ? endpoint : `${BASE_URL}${endpoint}`;

    return fetch(url, {
      ...options,
      headers,
    });
  };
}

/**
 * Non-hook version for use outside React components (e.g., utilities).
 * NOTE: Without a token, protected endpoints will return 401.
 */
export async function apiFetch(
  endpoint: string,
  options: RequestInit = {},
  token?: string
): Promise<Response> {
  const headers = new Headers(options.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  const url = endpoint.startsWith("http") ? endpoint : `${BASE_URL}${endpoint}`;

  return fetch(url, {
    ...options,
    headers,
  });
}

export const API_BASE = BASE_URL;
