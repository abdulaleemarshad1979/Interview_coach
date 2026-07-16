import { supabase } from "./supabaseClient";

export function getApiUrl(path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  if (typeof window !== "undefined" && window.location.pathname.includes("/proxy/")) {
    const match = window.location.pathname.match(/^(\/user\/[^/]+\/proxy\/\d+)/);
    if (match) {
      return `${match[1]}${cleanPath}`;
    }
  }
  return cleanPath;
}

export function getWsUrl(path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const protocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : "ws";
  
  if (typeof window !== "undefined" && window.location.pathname.includes("/proxy/")) {
    const match = window.location.pathname.match(/^(\/user\/[^/]+\/proxy\/\d+)/);
    if (match) {
      return `${protocol}://${window.location.host}${match[1]}${cleanPath}`;
    }
  }
  
  // Local fallback
  const host = typeof window !== "undefined" 
    ? ((window.location.port && window.location.port !== "3000" && window.location.port !== "5173") 
        ? `${window.location.hostname}:3000` 
        : window.location.host) 
    : "localhost:3000";
    
  return `${protocol}://${host}${cleanPath}`;
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  let token = null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    token = session?.access_token;
  } catch (err) {
    console.warn("Failed to retrieve supabase session for API fetch:", err);
  }

  const headers = new Headers(options.headers);
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(getApiUrl(path), {
    ...options,
    headers,
  });
}
