// Accepts "user", "@user", or any github.com profile/repo URL; returns "" when no valid login is present.
export function normalizeGitHubUsername(value: unknown): string {
  const raw = String(value || "").trim().replace(/^@/, "");
  const fromUrl = raw.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/?#\s]+)/i)?.[1] ?? raw;
  const login = fromUrl.replace(/\/+$/, "");
  return /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(login) ? login : "";
}

