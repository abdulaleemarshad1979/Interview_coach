import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGithubContext, diffRepos, type RepoCache, type RepoRecord } from '../backend/github';

const repo = (id: number, name: string, pushedAt = '2026-01-01T00:00:00Z'): RepoRecord => ({ id, name, description: `${name} desc`, language: 'TypeScript', stars: 1, forks: 0, url: `https://github.com/u/${name}`, pushedAt, topics: [] });

test('diffRepos finds new and updated repositories by id', () => {
  const stored = [repo(1, 'a'), repo(2, 'b')];
  const result = diffRepos(stored, [repo(1, 'a'), repo(2, 'b', '2026-02-01T00:00:00Z'), repo(3, 'c')]);
  assert.deepEqual(result.added.map(r => r.id), [3]);
  assert.deepEqual(result.updated.map(r => r.id), [2]);
  assert.equal(result.unchanged, 1);
});

function fakeGithub(repos: any[]): typeof fetch {
  return (async (url: string) => {
    const path = String(url);
    const ok = (body: unknown, text = false) => new Response(text ? String(body) : JSON.stringify(body), { status: 200 });
    if (path.includes('/repos?')) return ok(repos);
    if (path.endsWith('/readme')) return ok('# Chat app\nUses WebSockets and Redis for fan-out.', true);
    if (path.endsWith('/languages')) return ok({ TypeScript: 100, CSS: 5 });
    if (path.includes('/commits')) return ok([{ commit: { message: 'Add redis pub/sub\n\nbody' } }]);
    return new Response('nope', { status: 404 });
  }) as typeof fetch;
}
const raw = (id: number, name: string) => ({ id, name, description: 'd', language: 'TypeScript', stargazers_count: 2, forks_count: 0, html_url: `https://github.com/u/${name}`, pushed_at: '2026-03-01T00:00:00Z', topics: [], fork: false });
function memoryCache(initial: RepoRecord[] = []): RepoCache & { rows: Map<number, RepoRecord> } {
  const rows = new Map(initial.map(r => [r.id, r]));
  return { rows, list: async () => [...rows.values()], upsertMany: async (_o, repos) => { repos.forEach(r => rows.set(r.id, r)); } };
}

test('new repositories are enriched, listed first and cached', async () => {
  const cache = memoryCache([repo(1, 'old', '2026-03-01T00:00:00Z')]);
  const context = await buildGithubContext('owner', 'u', cache, fakeGithub([raw(1, 'old'), raw(2, 'chat')]));
  assert.match(context, /NEW repositories[\s\S]*chat[\s\S]*Redis/);
  assert.match(context, /Previously known[\s\S]*old/);
  assert.ok(cache.rows.get(2)?.readme);
});

test('no new repositories falls back to the stored set; GitHub outage uses the cache', async () => {
  const cache = memoryCache([repo(1, 'old', '2026-03-01T00:00:00Z')]);
  const same = await buildGithubContext('owner', 'u', cache, fakeGithub([raw(1, 'old')]));
  assert.doesNotMatch(same, /NEW repositories/);
  assert.match(same, /Existing repositories[\s\S]*old/);
  const down = await buildGithubContext('owner', 'u', cache, (async () => new Response('x', { status: 403 })) as typeof fetch);
  assert.match(down, /cached; GitHub unreachable[\s\S]*old/);
});
