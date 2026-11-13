import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGitHubUsername } from '../backend/github';

test('GitHub usernames are extracted from handles and profile URLs', () => {
  for (const input of ['octo-cat', '@octo-cat', 'https://github.com/octo-cat', 'github.com/octo-cat/', 'https://www.github.com/octo-cat/repo?tab=x', ' http://github.com/octo-cat ']) {
    assert.equal(normalizeGitHubUsername(input), 'octo-cat', input);
  }
  for (const input of ['', 'https://gitlab.com/x', 'bad name', '-lead', 'a--b', '../etc', 'x'.repeat(40), undefined]) {
    assert.equal(normalizeGitHubUsername(input), '', String(input));
  }
});
