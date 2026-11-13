// Accepts "user", "@user", or any github.com profile/repo URL; returns "" when no valid login is present.
export function normalizeGitHubUsername(value: unknown): string {
  const raw = String(value || "").trim().replace(/^@/, "");
  const fromUrl = raw.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/?#\s]+)/i)?.[1] ?? raw;
  const login = fromUrl.replace(/\/+$/, "");
  return /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(login) ? login : "";
}


// Deterministic resume-skill vs GitHub evidence check, used when the model skips the audit.
export function matchClaimsToGitHub(skills: string[], repos: Array<{ name: string; description: string; languages: string[]; topics: string[]; readme: string }>) {
  const provenClaims: string[] = [], unprovenClaims: string[] = [];
  for (const skill of [...new Set(skills.map((s) => s.trim()).filter(Boolean))].slice(0, 25)) {
    const needle = skill.toLowerCase();
    const word = new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9+#])`);
    const hit = repos.find((r) => r.languages.some((l) => l.toLowerCase() === needle) || r.topics.some((t) => t.toLowerCase() === needle)
      || word.test(`${r.name} ${r.description} ${r.readme}`.toLowerCase()));
    if (hit) provenClaims.push(`${skill} — evidence in repo "${hit.name}"`); else unprovenClaims.push(`${skill} — no public repository shows it`);
  }
  const total = provenClaims.length + unprovenClaims.length;
  return { provenClaims, unprovenClaims, alignmentScore: total ? Math.round((provenClaims.length / total) * 100) : 0 };
}
