import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGitHubUsername, matchClaimsToGitHub } from '../backend/github';

test('GitHub usernames are extracted from handles and profile URLs', () => {
  for (const input of ['octo-cat', '@octo-cat', 'https://github.com/octo-cat', 'github.com/octo-cat/', 'https://www.github.com/octo-cat/repo?tab=x', ' http://github.com/octo-cat ']) {
    assert.equal(normalizeGitHubUsername(input), 'octo-cat', input);
  }
  for (const input of ['', 'https://gitlab.com/x', 'bad name', '-lead', 'a--b', '../etc', 'x'.repeat(40), undefined]) {
    assert.equal(normalizeGitHubUsername(input), '', String(input));
  }
});

test('resume skills are matched to GitHub evidence on word boundaries', () => {
  const repos = [{ name: 'shop-api', description: 'A good REST service', languages: ['TypeScript'], topics: ['docker'], readme: 'Built with Node.js and C++ bindings' }];
  const result = matchClaimsToGitHub(['typescript', 'Docker', 'Node.js', 'C++', 'Go', 'Rust', 'Go'], repos);
  assert.deepEqual(result.provenClaims.map((c) => c.split(' — ')[0]), ['typescript', 'Docker', 'Node.js', 'C++']);
  assert.deepEqual(result.unprovenClaims.map((c) => c.split(' — ')[0]), ['Go', 'Rust']);
  assert.equal(result.alignmentScore, 67);
  assert.deepEqual(matchClaimsToGitHub([], repos), { provenClaims: [], unprovenClaims: [], alignmentScore: 0 });
});
