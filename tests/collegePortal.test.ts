import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { gzipSync } from 'node:zlib';
import { buildPortalLoginForm, createPortalClient, encryptPortalPassword, parsePortalProfileHtml, validatePortalLogin, verifyCollegePortal } from '../backend/collegePortal';
import { loginHtml, officialPortalFixture, profileHtml } from './fixtures/collegePortal';

test('ACET submission preserves decoded ASP.NET state and selects only the student button', () => {
  const form = buildPortalLoginForm(loginHtml, '24P31A9999', 'test & password', 'acet');
  const fields = new URLSearchParams(form.body);
  assert.equal(form.action, 'https://info.aec.edu.in/acet/default.aspx');
  assert.equal(fields.get('__VIEWSTATE'), 'state&value');
  assert.equal(fields.get('hdnDPToken'), 'dynamic-token');
  assert.equal(fields.get('txtId2'), '24P31A9999');
  assert.equal(fields.get('txtPwd2'), encryptPortalPassword('test & password'));
  assert.equal(fields.get('hdnpwd2'), fields.get('txtPwd2'));
  assert.equal(fields.get('imgBtn2.x'), '30');
  assert.equal(fields.has('imgBtn1'), false);
  assert.equal(form.body.includes('test & password'), false);
});

test('AUS uses its actual fields and reports required Turnstile instead of bad credentials', () => {
  const aus = `<form><input name="__VIEWSTATE" type="hidden"><input name="txtUserId"><input name="txtPassword" type="password">
  <input name="hdnpwd" type="hidden"><input name="userType" type="radio" value="rbtParent" checked>
  <input name="userType" type="radio" value="rbtEmployee"><div class="cf-turnstile"></div></form>`;
  assert.throws(() => buildPortalLoginForm(aus, 'AUS9999', 'test-password', 'aus'), { code: 'PORTAL_VERIFICATION_REQUIRED', status: 503 });
  const fields = new URLSearchParams(buildPortalLoginForm(aus.replace('<div class="cf-turnstile"></div>', ''), 'AUS9999', 'test-password', 'aus').body);
  assert.equal(fields.get('userType'), 'rbtStudent');
  assert.equal(fields.get('txtUserId'), 'AUS9999');
  assert.equal(fields.get('btnLogin'), 'LOGIN');
  assert.equal(fields.has('txtId2'), false);
});

test('verification follows authenticated redirects and discovers the current profile handler', async () => {
  const fixture = officialPortalFixture('current-password');
  const profile = await verifyCollegePortal('24P31A9999', 'current-password', 'acet', fixture.fetcher);
  assert.equal(profile.name, 'Example Student'); assert.equal(profile.attendance, 78.4);
  assert.equal(profile.profileImage, 'https://info.aec.edu.in/acet/StudentPhotos/example.jpg');
  const ajax = fixture.calls.at(-1)!;
  assert.match(ajax.url, /changed-hash\.ashx\?_method=ShowStudentProfileNew/);
  assert.equal(new Headers(ajax.init.headers).get('Content-Type'), 'text/plain; charset=utf-8');
  assert.match(new Headers(ajax.init.headers).get('Cookie')!, /ASP.NET_SessionId=fixture-session/);
  assert.equal(fixture.calls[2].init.method, 'GET');
  assert.equal(fixture.calls[2].init.body, undefined);
});

test('wrong credentials and server errors have distinct codes and never fetch the profile', async () => {
  const fixture = officialPortalFixture('current-password');
  await assert.rejects(verifyCollegePortal('24P31A9999', 'wrong-password', 'acet', fixture.fetcher), { code: 'INVALID_PORTAL_CREDENTIALS', status: 401 });
  assert.equal(fixture.calls.length, 2);
  await assert.rejects(verifyCollegePortal('24P31A9999', 'current-password', 'acet', officialPortalFixture('current-password', { unavailable: true }).fetcher), { code: 'PORTAL_UNAVAILABLE', status: 503 });
});

test('portal selection is mandatory and malformed profiles cannot verify another student', () => {
  assert.throws(() => validatePortalLogin({ rollNo: '24P31A9999', password: 'test-password' }), { status: 400 });
  assert.throws(() => validatePortalLogin({ rollNo: ['24P31A9999'], password: {}, portal: 'acet' }), { status: 400 });
  assert.throws(() => parsePortalProfileHtml('<h1>Runtime Error</h1>', '24P31A9999', 'acet'), { code: 'PORTAL_PROFILE_INVALID' });
  assert.throws(() => parsePortalProfileHtml(profileHtml('OTHER'), '24P31A9999', 'acet'), { code: 'PORTAL_PROFILE_INVALID' });
  const profile = parsePortalProfileHtml('<table><tr><td>Name</td><td>:</td><td>Example Student</td></tr></table>', '24P31A9999', 'acet');
  assert.equal(profile.attendance, undefined); assert.equal(profile.department, ''); assert.equal(profile.academicYear, '');
  const withContactTable = parsePortalProfileHtml(profileHtml() + '<table><tr><td>Name</td><td>Address</td></tr></table>', '24P31A9999', 'acet');
  assert.equal(withContactTable.name, 'Example Student');
});

test('redirects cannot forward credentials or session cookies to another origin or college', async () => {
  for (const location of ['https://example.com/steal', 'http://info.aec.edu.in/acet/default.aspx', 'https://info.aec.edu.in/aus/default.aspx']) {
    let calls = 0;
    const client = createPortalClient('acet', async () => { calls++; return new Response(null, { status: 307, headers: { Location: location, 'Set-Cookie': 'session=private' } }); });
    await assert.rejects(client('https://info.aec.edu.in/acet/default.aspx', { method: 'POST', body: 'encrypted-secret' }), { code: 'PORTAL_REDIRECT_REJECTED' });
    assert.equal(calls, 1);
  }
});

test('307 keeps POST body and cookie jars are isolated per login', async () => {
  let calls = 0;
  const client = createPortalClient('acet', async (_url, init) => {
    if (!calls++) return new Response(null, { status: 307, headers: { Location: 'next.aspx', 'Set-Cookie': 'session=private; Path=/' } });
    assert.equal(init?.method, 'POST'); assert.equal(init?.body, 'payload');
    assert.equal(new Headers(init?.headers).get('Cookie'), 'session=private');
    return new Response('ok');
  });
  await client('https://info.aec.edu.in/acet/default.aspx', { method: 'POST', body: 'payload' });
  await createPortalClient('acet', async (_url, init) => { assert.equal(new Headers(init?.headers).get('Cookie'), null); return new Response('ok'); })('https://info.aec.edu.in/acet/default.aspx');
});

test('expiring the last cookie clears it from the next redirect request', async () => {
  let calls = 0;
  const client = createPortalClient('acet', async (_url, init) => {
    calls++;
    if (calls === 1) return new Response(null, { status: 302, headers: { Location: 'authcheck.aspx', 'Set-Cookie': 'sid=one' } });
    if (calls === 2) return new Response(null, { status: 302, headers: { Location: 'next.aspx', 'Set-Cookie': 'sid=; Max-Age=0' } });
    assert.equal(new Headers(init?.headers).get('Cookie'), null);
    return new Response('ok');
  });
  await client('https://info.aec.edu.in/acet/default.aspx');
});

test('HTTP responses are decompressed before parsing and decoded size is bounded', async () => {
  const server = http.createServer((_req, res) => { res.setHeader('Content-Encoding', 'gzip'); res.end(gzipSync(loginHtml)); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  try {
    const client = createPortalClient('acet', (_url, init) => fetch(`http://127.0.0.1:${address.port}`, init));
    assert.equal((await client('https://info.aec.edu.in/acet/default.aspx')).body, loginHtml);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  const oversized = createPortalClient('acet', async () => new Response('x'.repeat(2 * 1024 * 1024 + 1)));
  await assert.rejects(oversized('https://info.aec.edu.in/acet/default.aspx'), { code: 'PORTAL_RESPONSE_TOO_LARGE' });
});
