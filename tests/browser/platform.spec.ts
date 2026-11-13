import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';

const password = 'browser-test-password';
let nextRollNumber = 8000;
async function createAccount(_request: APIRequestContext, _name: string) {
  return { rollNo: `24P31A${++nextRollNumber}` };
}
async function signIn(page: Page, rollNo: string, path = '/') {
  await page.goto(path);
  if (path === '/') await page.locator('#btn-nav-login').click();
  await expect(page.getByRole('heading', { name: 'Student sign in' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in with an Interview Coach account' })).toHaveCount(0);
  await page.getByRole('button', { name: /^acet$/i }).click();
  await page.getByLabel('Student roll number').fill(rollNo);
  await page.getByLabel('ECAP password').fill(password);
  await page.getByRole('button', { name: 'Sign in with college portal' }).click();
  await expect(page.getByRole('button', { name: 'Live Interview', exact: true })).toBeVisible();
}

test('college portal login, saved interview and explicit missing-provider failure', async ({ page, request }) => {
  const account = await createAccount(request, 'Interview candidate');
  await signIn(page, account.rollNo);
  await expect.poll(() => page.getByAltText('Aditya University Logo').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Live Interview', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Prepare for your next conversation' })).toBeVisible();
  await page.getByLabel('Target role', { exact: true }).fill('Backend engineer');
  await page.getByRole('button', { name: 'Start interview', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Groq is not configured');
  await expect(page.getByText('0 answers saved')).toBeVisible();
  await page.getByRole('button', { name: 'Start camera' }).click();
  await expect.poll(() => page.getByLabel('Your live camera preview').evaluate((video: HTMLVideoElement) => video.videoWidth)).toBeGreaterThan(0);
  await expect(page.getByText('Camera on · no face in frame')).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Turn camera off' }).click();
  await expect(page.getByText('Camera is off')).toBeVisible();
  await page.getByRole('button', { name: 'Session history', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Backend engineer', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Begin questions' })).toBeVisible();
});

test('camera observer tracks a visible face using local model assets', async ({ page, request }) => {
  const account = await createAccount(request, 'Camera candidate');
  await signIn(page, account.rollNo);
  await page.getByRole('button', { name: 'Live Interview', exact: true }).click();
  await page.getByRole('button', { name: 'Start interview', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start camera' })).toBeVisible();
  const image = `data:image/png;base64,${readFileSync('assets/abdul_profile.png').toString('base64')}`;
  await page.evaluate(async (source) => {
    const portrait = await createImageBitmap(await (await fetch(source)).blob());
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 480;
    const context = canvas.getContext('2d')!;
    const paint = () => context.drawImage(portrait, 0, -80, 640, 640);
    paint(); window.setInterval(paint, 100);
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => canvas.captureStream(10) });
  }, image);
  await page.getByRole('button', { name: 'Start camera' }).click();
  await expect(page.getByText('Face tracked · centered in frame')).toBeVisible({ timeout: 30000 });
  await expect.poll(() => page.locator('.coach-camera-preview canvas').evaluate((canvas: HTMLCanvasElement) => canvas.width)).toBeGreaterThan(0);
});

test('invitation routes a signed-in participant directly to the join lobby', async ({ page, request }) => {
  const account = await createAccount(request, 'Invited candidate');
  await signIn(page, account.rollNo, '/?meeting=ABCDEF123456');
  await expect(page.getByRole('tab', { name: 'Join a discussion' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Meeting ID', { exact: true })).toHaveValue('ABCDEF123456');
});

test('responsive configuration has no horizontal overflow at 320, 768, 1024 and 1440px', async ({ page, request }) => {
  const account = await createAccount(request, 'Responsive candidate');
  await signIn(page, account.rollNo);
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
      await signIn(pages[i], account.rollNo);
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
