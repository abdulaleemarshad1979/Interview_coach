import type { RepoCache, RepoRecord } from '../github';
import { supabase } from './client';

export const supabaseRepoCache: RepoCache = {
  async list(ownerId) {
    const { data, error } = await supabase().from('github_repos').select('data').eq('owner_id', ownerId);
    if (error) throw error;
    return (data || []).map(row => row.data as RepoRecord);
  },
  async upsertMany(ownerId, repos) {
    if (!repos.length) return;
    // One batched upsert instead of a write per repository.
    const { error } = await supabase().from('github_repos').upsert(repos.map(repo => ({ owner_id: ownerId, repo_id: repo.id, data: repo, pushed_at: repo.pushedAt, synced_at: new Date().toISOString() })), { onConflict: 'owner_id,repo_id' });
    if (error) throw error;
  },
};
