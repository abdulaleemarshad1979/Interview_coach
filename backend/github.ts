import mongoose from 'mongoose';
import { supabaseConfigured } from './supabase/client';
import { supabaseRepoCache } from './supabase/repoCache';

export interface RepoRecord {
  id: number; name: string; description: string; language: string; stars: number; forks: number;
  url: string; pushedAt: string; topics: string[]; readme?: string; languages?: string[]; commits?: string[];
}
export interface RepoCache {
  list(ownerId: string): Promise<RepoRecord[]>;
  upsertMany(ownerId: string, repos: RepoRecord[]): Promise<void>;
}

/** O(N + M) delta using a Map keyed by repo id (no nested loops). A repo is "updated" when its pushedAt moved. */
export function diffRepos(stored: Array<Pick<RepoRecord, 'id' | 'pushedAt'>>, fetched: RepoRecord[]) {
  const known = new Map(stored.map(repo => [repo.id, repo.pushedAt]));
  const added: RepoRecord[] = [], updated: RepoRecord[] = [];
  for (const repo of fetched) {
    const pushedAt = known.get(repo.id);
    if (pushedAt === undefined) added.push(repo);
    else if (pushedAt !== repo.pushedAt) updated.push(repo);
  }
  return { added, updated, unchanged: fetched.length - added.length - updated.length };
}

const schema = new mongoose.Schema({
  ownerId: { type: String, required: true }, repoId: { type: Number, required: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true }, pushedAt: String, syncedAt: { type: Date, default: Date.now },
}, { versionKey: false, collection: 'github_repos' });
schema.index({ ownerId: 1, repoId: 1 }, { unique: true });
const GithubRepo: mongoose.Model<any> = mongoose.models.GithubRepoCache || mongoose.model('GithubRepoCache', schema);

export const mongoRepoCache: RepoCache = {
  async list(ownerId) { return (await GithubRepo.find({ ownerId }).select({ data: 1, _id: 0 }).lean()).map((row: any) => row.data); },
  async upsertMany(ownerId, repos) {
    if (!repos.length) return;
    await GithubRepo.bulkWrite(repos.map(repo => ({ updateOne: { filter: { ownerId, repoId: repo.id }, update: { $set: { data: repo, pushedAt: repo.pushedAt, syncedAt: new Date() } }, upsert: true } })));
  },
};

const headers = () => ({ 'User-Agent': 'interview-coach-app', Accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) });
const api = async (fetcher: typeof fetch, path: string, accept?: string) => {
  const response = await fetcher(`https://api.github.com${path}`, { headers: { ...headers(), ...(accept ? { Accept: accept } : {}) }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) { await response.body?.cancel(); throw Object.assign(new Error('GitHub request failed'), { status: response.status }); }
  return response;
};

export async function fetchRepos(username: string, fetcher: typeof fetch = fetch): Promise<RepoRecord[]> {
  const raw: any[] = await (await api(fetcher, `/users/${encodeURIComponent(username)}/repos?sort=pushed&per_page=100&type=owner`)).json();
  return raw.filter(repo => !repo.fork).map(repo => ({
    id: repo.id, name: repo.name, description: repo.description || '', language: repo.language || '', stars: repo.stargazers_count || 0,
    forks: repo.forks_count || 0, url: repo.html_url, pushedAt: repo.pushed_at || '', topics: repo.topics || [],
  }));
}

/** README, language mix and recent commit messages: the context that makes project questions specific. */
export async function enrichRepo(username: string, repo: RepoRecord, fetcher: typeof fetch = fetch): Promise<RepoRecord> {
  const base = `/repos/${encodeURIComponent(username)}/${encodeURIComponent(repo.name)}`;
  const [readme, languages, commits] = await Promise.allSettled([
    api(fetcher, `${base}/readme`, 'application/vnd.github.raw+json').then(r => r.text()),
    api(fetcher, `${base}/languages`).then(r => r.json()),
    api(fetcher, `${base}/commits?per_page=5`).then(r => r.json()),
  ]);
  return { ...repo,
    ...(readme.status === 'fulfilled' ? { readme: readme.value.replace(/!\[[^\]]*\]\([^)]*\)/g, '').slice(0, 2500) } : {}),
    ...(languages.status === 'fulfilled' ? { languages: Object.keys(languages.value).slice(0, 6) } : {}),
    ...(commits.status === 'fulfilled' ? { commits: (commits.value as any[]).map(c => String(c.commit?.message || '').split('\n')[0].slice(0, 120)).filter(Boolean) } : {}),
  };
}

const MAX_ENRICH = 5;
const describe = (repo: RepoRecord) => [`- ${repo.name} (${[repo.language, ...(repo.languages || [])].filter((v, i, a) => v && a.indexOf(v) === i).join(', ') || 'unknown'}; ★${repo.stars})`,
  repo.description && `  ${repo.description}`, repo.topics.length && `  topics: ${repo.topics.join(', ')}`,
  repo.commits?.length && `  recent commits: ${repo.commits.join(' | ')}`, repo.readme && `  README: ${repo.readme.replace(/\s+/g, ' ').slice(0, 900)}`].filter(Boolean).join('\n');

/**
 * Pre-interview GitHub context. New repositories (unseen in the cache) are enriched and listed first so the
 * interviewer prioritises them; with none, or if GitHub is unreachable, the cached repositories are used.
 */
export async function buildGithubContext(ownerId: string, username: string, cache: RepoCache = supabaseConfigured() ? supabaseRepoCache : mongoRepoCache, fetcher: typeof fetch = fetch): Promise<string> {
  const stored = await cache.list(ownerId);
  let fetched: RepoRecord[] | null = null;
  try { fetched = await fetchRepos(username, fetcher); } catch { /* rate limit or outage: fall back to the cache */ }
  if (!fetched) return stored.length ? `GitHub @${username} (cached; GitHub unreachable):\n${stored.slice(0, 8).map(describe).join('\n')}`.slice(0, 8000) : '';
  const { added, updated } = diffRepos(stored, fetched);
  const byRecency = (a: RepoRecord, b: RepoRecord) => b.pushedAt.localeCompare(a.pushedAt);
  const toEnrich = [...added].sort(byRecency).slice(0, MAX_ENRICH);
  const enriched = await Promise.all(toEnrich.map(repo => enrichRepo(username, repo, fetcher)));
  const richById = new Map(enriched.map(repo => [repo.id, repo]));
  // Keep earlier enrichment for repos whose metadata merely changed.
  const storedById = new Map(stored.map(repo => [repo.id, repo]));
  const persisted = [...added.map(repo => richById.get(repo.id) || repo), ...updated.map(repo => ({ ...storedById.get(repo.id), ...repo }))];
  await cache.upsertMany(ownerId, persisted).catch(() => {});
  const current = new Map([...stored, ...persisted].map(repo => [repo.id, repo]));
  const addedIds = new Set(added.map(repo => repo.id));
  const known = fetched.filter(repo => !addedIds.has(repo.id)).map(repo => current.get(repo.id) || repo).sort(byRecency).slice(0, 6);
  const parts = [`GitHub @${username}`];
  if (added.length) parts.push(`NEW repositories since the last interview (prioritise these for project questions):\n${[...enriched, ...added.filter(a => !richById.has(a.id))].map(describe).join('\n')}`);
  if (known.length) parts.push(`${added.length ? 'Previously known' : 'Existing'} repositories:\n${known.map(describe).join('\n')}`);
  return parts.join('\n\n').slice(0, 8000);
}
