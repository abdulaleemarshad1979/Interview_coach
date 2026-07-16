// Custom local MongoDB auth client replacing the online Supabase client.
// This maintains interface compatibility so that the existing UI code continues to work seamlessly.

function getApiUrl(path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  if (typeof window !== "undefined" && window.location.pathname.includes("/proxy/")) {
    const match = window.location.pathname.match(/^(\/user\/[^/]+\/proxy\/\d+)/);
    if (match) {
      return `${match[1]}${cleanPath}`;
    }
  }
  return cleanPath;
}

type AuthChangeEvent = "SIGNED_IN" | "SIGNED_OUT" | "USER_UPDATED" | "INITIAL_SESSION";
type AuthChangeListener = (event: AuthChangeEvent, session: any | null) => void;

class LocalAuthClient {
  private listeners: Set<AuthChangeListener> = new Set();

  constructor() {
    // Attempt to validate session with backend on start if token exists
    const token = localStorage.getItem("auth_token");
    if (token) {
      this.validateSession(token);
    }
  }

  private async validateSession(token: string) {
    try {
      const res = await fetch(getApiUrl("/api/auth/me"), {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem("auth_user", JSON.stringify(data.user));
        const session = { access_token: token, user: data.user };
        this.notify("INITIAL_SESSION", session);
      } else {
        // Token expired or invalid, clear session
        this.clearSession();
      }
    } catch (err) {
      console.warn("Failed to validate session on boot:", err);
    }
  }

  private clearSession() {
    const token = localStorage.getItem("auth_token");
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    if (token) {
      this.notify("SIGNED_OUT", null);
    }
  }

  private notify(event: AuthChangeEvent, session: any | null) {
    this.listeners.forEach((listener) => {
      try {
        listener(event, session);
      } catch (err) {
        console.error("Auth state change listener failed:", err);
      }
    });
  }

  async getSession() {
    const token = localStorage.getItem("auth_token");
    const cachedUser = localStorage.getItem("auth_user");
    if (!token || !cachedUser) {
      return { data: { session: null }, error: null };
    }
    try {
      const user = JSON.parse(cachedUser);
      return { data: { session: { access_token: token, user } }, error: null };
    } catch (e) {
      return { data: { session: null }, error: null };
    }
  }

  async getUser() {
    const token = localStorage.getItem("auth_token");
    const cachedUser = localStorage.getItem("auth_user");
    if (!token || !cachedUser) {
      return { data: { user: null }, error: null };
    }
    try {
      const user = JSON.parse(cachedUser);
      return { data: { user }, error: null };
    } catch (e) {
      return { data: { user: null }, error: null };
    }
  }

  async signInWithPassword({ email, password }: any) {
    try {
      const res = await fetch(getApiUrl("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return {
          data: { session: null, user: null },
          error: { message: errData.error || "Invalid credentials." }
        };
      }

      const data = await res.json();
      localStorage.setItem("auth_token", data.session.access_token);
      localStorage.setItem("auth_user", JSON.stringify(data.user));

      this.notify("SIGNED_IN", data.session);

      return { data, error: null };
    } catch (err: any) {
      return {
        data: { session: null, user: null },
        error: { message: err.message || "Network error. Please try again." }
      };
    }
  }

  async signUp({ email, password, options }: any) {
    try {
      const res = await fetch(getApiUrl("/api/auth/signup"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          user_metadata: options?.data || {}
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return {
          data: { session: null, user: null },
          error: { message: errData.error || "Signup failed." }
        };
      }

      const data = await res.json();
      localStorage.setItem("auth_token", data.session.access_token);
      localStorage.setItem("auth_user", JSON.stringify(data.user));

      this.notify("SIGNED_IN", data.session);

      return { data, error: null };
    } catch (err: any) {
      return {
        data: { session: null, user: null },
        error: { message: err.message || "Network error. Please try again." }
      };
    }
  }

  async signOut() {
    const token = localStorage.getItem("auth_token");
    if (token) {
      fetch(getApiUrl("/api/auth/logout"), {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      }).catch(() => {});
    }
    this.clearSession();
    return { error: null };
  }

  async updateUser({ data }: any) {
    try {
      const token = localStorage.getItem("auth_token");
      if (!token) {
        return { data: { user: null }, error: { message: "No active session." } };
      }

      const res = await fetch(getApiUrl("/api/auth/update-metadata"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ data }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return { data: { user: null }, error: { message: errData.error || "Update failed." } };
      }

      const resData = await res.json();
      localStorage.setItem("auth_user", JSON.stringify(resData.user));

      const session = { access_token: token, user: resData.user };
      this.notify("USER_UPDATED", session);

      return { data: { user: resData.user }, error: null };
    } catch (err: any) {
      return { data: { user: null }, error: { message: err.message } };
    }
  }

  onAuthStateChange(callback: AuthChangeListener) {
    this.listeners.add(callback);

    // Call callback immediately with initial session state
    const token = localStorage.getItem("auth_token");
    const cachedUser = localStorage.getItem("auth_user");
    if (token && cachedUser) {
      try {
        const user = JSON.parse(cachedUser);
        callback("INITIAL_SESSION", { access_token: token, user });
      } catch {
        callback("SIGNED_OUT", null);
      }
    } else {
      callback("SIGNED_OUT", null);
    }

    return {
      data: {
        subscription: {
          unsubscribe: () => {
            this.listeners.delete(callback);
          }
        }
      }
    };
  }
}

class LocalStorageClient {
  from(bucket: string) {
    return {
      upload: async (path: string, file: File, options?: any) => {
        // Return mock success with empty path
        return { data: { path }, error: null };
      },
      createSignedUrl: async (path: string, expiresIn: number) => {
        // Return dummy URL to bypass signed URL downloads on the server
        return { data: { signedUrl: "" }, error: null };
      }
    };
  }
}

export const supabase = {
  auth: new LocalAuthClient(),
  storage: new LocalStorageClient()
};
