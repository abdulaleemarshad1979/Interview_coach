import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

const password = 'browser-test-password';
async function createAccount(request: APIRequestContext, name: string) {
  const email = `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now()}@example.com`;
  const response = await request.post('/api/auth/signup', { data: { email, password, user_metadata: { student_name: name } } });
  expect(response.status()).toBe(201);
  return { email, body: await response.json() };
}
async function signIn(page: Page, email: string) {
  await page.goto('/');
  await page.locator('#btn-nav-login').click();
  await page.getByRole('button', { name: 'Sign in with an Interview Coach account' }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Live Interview', exact: true })).toBeVisible();
}

test('real signup/login, saved interview and explicit missing-provider failure', async ({ page, request }) => {
  const account = await createAccount(request, 'Interview candidate');
  await signIn(page, account.email);
  await page.getByRole('button', { name: 'Live Interview', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Prepare for your next conversation' })).toBeVisible();
  await page.getByLabel('Target role', { exact: true }).fill('Backend engineer');
  await page.getByRole('button', { name: 'Start interview', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Groq is not configured');
  await expect(page.getByText('0 answers saved')).toBeVisible();
  await page.getByRole('button', { name: 'Session history', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Backend engineer', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Begin questions' })).toBeVisible();
});

test('responsive configuration has no horizontal overflow at 320, 768, 1024 and 1440px', async ({ page, request }) => {
  const account = await createAccount(request, 'Responsive candidate');
  await signIn(page, account.email);
  await page.getByRole('button', { name: 'Live Interview', exact: true }).click();
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('heading', { name: 'Prepare for your next conversation' })).toBeVisible();
    const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: innerWidth }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport + 1);
    await page.screenshot({ path: `test-results/interview-config-${width}.png`, fullPage: true });
  }
});

test('four real browser clients connect to local SFU, receive video, mute independently and rejoin', async ({ browser, request }) => {
  test.skip(process.env.TEST_LOCAL_SFU !== 'true', 'Start the documented local LiveKit test server to verify real SFU media.');
  test.setTimeout(180000);
  const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext({ permissions: ['camera', 'microphone'] })));
  const pages = await Promise.all(contexts.map(context => context.newPage()));
  try {
    const accounts = [];
    for (let i = 0; i < 4; i++) {
      const account = await createAccount(request, `Participant ${i + 1}`); accounts.push(account);
      await signIn(pages[i], account.email);
      await pages[i].getByRole('button', { name: 'Group Discussion', exact: true }).click();
    }
    const host = pages[0];
    await host.getByLabel('Your display name').fill('Participant 1');
    await host.getByLabel('Meeting title').fill('Four-client transport verification');
    await host.getByLabel('Discussion topic', { exact: true }).fill('How should engineering teams review distributed system designs?');
    await host.getByLabel('Room passcode (optional)').fill('test-room-123');
    await host.getByLabel('AI discussion support').selectOption('OFF');
    const createResponse = host.waitForResponse(response => /\/api\/meetings\/?$/.test(response.url()) && response.request().method() === 'POST');
    await host.getByRole('button', { name: 'Create discussion', exact: true }).click();
    const created = await (await createResponse).json();
    const code = created.room.code;
    for (let i = 1; i < 4; i++) {
      await pages[i].getByRole('tab', { name: 'Join a discussion' }).click();
      await pages[i].getByLabel('Your display name').fill(`Participant ${i + 1}`);
      await pages[i].getByLabel('Meeting ID', { exact: true }).fill(code);
      await pages[i].getByLabel('Room passcode, if required').fill('test-room-123');
      await pages[i].getByRole('button', { name: 'Request to join', exact: true }).click();
      await host.getByRole('button', { name: `Admit Participant ${i + 1}`, exact: true }).click();
    }
    for (const page of pages) {
      await expect(page.locator('header').getByText('Connected', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Unmute microphone', exact: true }).click();
      await page.getByRole('button', { name: 'Turn camera on', exact: true }).click();
    }
    for (const page of pages) {
      await expect.poll(() => page.locator('video').evaluateAll((videos: HTMLVideoElement[]) => videos.filter(video => video.readyState >= 2 && video.videoWidth > 0).length), { timeout: 30000 }).toBeGreaterThanOrEqual(4);
      await expect.poll(() => page.locator('audio').evaluateAll((elements: HTMLAudioElement[]) => elements.filter(element => {
        const stream = element.srcObject as MediaStream | null;
        return stream?.getAudioTracks().some(track => track.readyState === 'live') && !element.paused;
      }).length), { timeout: 30000 }).toBeGreaterThanOrEqual(3);
    }
    await pages[1].getByRole('button', { name: 'Mute microphone', exact: true }).click();
    await expect(pages[1].getByRole('button', { name: 'Unmute microphone', exact: true })).toBeVisible();
    await expect(host.getByRole('button', { name: 'Mute microphone', exact: true })).toBeVisible();
    await contexts[2].setOffline(true);
    await expect(pages[2].getByText(/Reconnecting|Disconnected/, { exact: false }).first()).toBeVisible({ timeout: 30000 });
    await contexts[2].setOffline(false);
    await expect(pages[2].locator('header').getByText('Connected', { exact: true })).toBeVisible({ timeout: 60000 });
    await expect.poll(() => pages[2].locator('video').evaluateAll((videos: HTMLVideoElement[]) => videos.filter(video => video.videoWidth > 0).length), { timeout: 30000 }).toBeGreaterThanOrEqual(4);
    await pages[3].getByRole('button', { name: 'Raise hand', exact: true }).click();
    await expect(pages[3].getByRole('button', { name: 'Lower hand', exact: true })).toBeVisible();
    await host.getByRole('button', { name: 'Chat', exact: true }).click();
    await host.getByLabel('Message the discussion', { exact: true }).fill('Transport test chat from the host.');
    await host.getByRole('button', { name: 'Send message', exact: true }).click();
    await pages[1].getByRole('button', { name: 'Chat', exact: true }).click();
    await expect(pages[1].getByText('Transport test chat from the host.', { exact: true })).toBeVisible();
    await host.screenshot({ path: 'test-results/four-client-sfu.png', fullPage: true });
    await host.getByRole('button', { name: 'End for everyone', exact: true }).click();
    for (const page of pages) await expect(page.getByRole('heading', { name: 'Discussion complete', exact: true })).toBeVisible();
  } finally { await Promise.all(contexts.map(context => context.close().catch(() => {}))); }
});
