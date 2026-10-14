import crypto from 'node:crypto';
import { load } from 'cheerio';

export type CollegePortal = 'acet' | 'aus';
export class PortalError extends Error {
  constructor(public code: string, message: string, public status = 502) { super(message); }
}

export function validatePortalLogin(body: any) {
  if (typeof body?.rollNo !== 'string' || !/^[A-Z0-9]{4,24}$/i.test(body.rollNo.trim()) ||
      typeof body?.password !== 'string' || !body.password.length || body.password.length > 256 ||
      (body.portal !== 'acet' && body.portal !== 'aus')) {
    throw new PortalError('INVALID_PORTAL_INPUT', 'Select AUS or ACET and enter your roll number and ECAP password.', 400);
  }
  return { rollNo: body.rollNo.trim().toUpperCase(), password: body.password, portal: body.portal as CollegePortal };
}

// Matches the AES-CBC/PKCS7 transform in the official login pages' encryptJSText.
export function encryptPortalPassword(password: string) {
  const key = Buffer.from('8701661282118308');
  const cipher = crypto.createCipheriv('aes-128-cbc', key, key);
  return Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]).toString('base64');
}

export function portalUrl(portal: CollegePortal) { return `https://info.aec.edu.in/${portal}/default.aspx`; }

export function buildPortalLoginForm(html: string, rollNo: string, password: string, portal: CollegePortal) {
  const $ = load(html);
  const form = $('form').filter((_, el) => $(el).find(portal === 'acet' ? '[name="txtId2"]' : '[name="txtUserId"]').length > 0).first();
  if (!form.length) throw new PortalError('PORTAL_FORM_CHANGED', 'The college login page is unavailable or has changed. Please try again later.');
  const fields = new URLSearchParams();
  form.find('input[name]').each((_, el) => {
    const input = $(el), type = (input.attr('type') || 'text').toLowerCase();
    if (input.attr('disabled') !== undefined || ['image', 'submit', 'button', 'file'].includes(type) ||
        (['radio', 'checkbox'].includes(type) && input.attr('checked') === undefined)) return;
    fields.set(input.attr('name')!, input.attr('value') || '');
  });
  const passwordField = portal === 'acet' ? 'txtPwd2' : 'txtPassword';
  const hiddenPassword = portal === 'acet' ? 'hdnpwd2' : 'hdnpwd';
  if (!form.find(`[name="${passwordField}"]`).length || !fields.has(hiddenPassword) || !fields.has('__VIEWSTATE')) {
    throw new PortalError('PORTAL_FORM_CHANGED', 'The college login form has changed. Please try again later.');
  }
  // Turnstile is scoped to the official portal. A widget on our hostname cannot replace it.
  if (form.find('[name="cf-turnstile-response"], .cf-turnstile').length && !fields.get('cf-turnstile-response')) {
    throw new PortalError('PORTAL_VERIFICATION_REQUIRED', `${portal.toUpperCase()} requires browser verification on the official college portal. Automated sign-in is currently unavailable.`, 503);
  }
  const encrypted = encryptPortalPassword(password);
  fields.set(portal === 'acet' ? 'txtId2' : 'txtUserId', rollNo);
  fields.set(passwordField, encrypted);
  fields.set(hiddenPassword, encrypted);
  if (portal === 'acet') { fields.set('imgBtn2.x', '30'); fields.set('imgBtn2.y', '20'); }
  else { fields.set('userType', 'rbtStudent'); fields.set('btnLogin', 'LOGIN'); }
  return { action: new URL(form.attr('action') || portalUrl(portal), portalUrl(portal)).href, body: fields.toString() };
}

function assertPortalUrl(url: string, portal: CollegePortal) {
  const parsed = new URL(url);
  if (parsed.origin !== 'https://info.aec.edu.in' || !parsed.pathname.toLowerCase().startsWith(`/${portal}/`) || parsed.username || parsed.password) {
    throw new PortalError('PORTAL_REDIRECT_REJECTED', 'The college portal returned an unexpected redirect.');
  }
}

export function createPortalClient(portal: CollegePortal, fetcher: typeof fetch = fetch) {
  const cookies = new Map<string, string>();
  const signal = AbortSignal.timeout(25000);
  return async (initialUrl: string, init: RequestInit = {}) => {
    let url = initialUrl, method = init.method || 'GET', body = init.body;
    const headers = new Headers(init.headers);
    headers.set('User-Agent', 'InterviewCoach/1.0');
    headers.set('Accept', 'text/html,application/json;q=0.9,*/*;q=0.8');
    for (let redirects = 0; redirects <= 8; redirects++) {
      assertPortalUrl(url, portal);
      headers.delete('Cookie');
      if (cookies.size) headers.set('Cookie', [...cookies].map(([key, value]) => `${key}=${value}`).join('; '));
      try {
        const response = await fetcher(url, { ...init, method, body, headers, redirect: 'manual', signal });
        for (const cookie of response.headers.getSetCookie()) {
          const pair = cookie.split(';')[0], at = pair.indexOf('=');
          if (at > 0) {
            const name = pair.slice(0, at).trim(), value = pair.slice(at + 1);
            if (!value || /max-age\s*=\s*0(?:;|$)/i.test(cookie)) cookies.delete(name); else cookies.set(name, value);
          }
        }
        const location = response.headers.get('location');
        if ([301, 302, 303, 307, 308].includes(response.status) && location) {
          await response.body?.cancel();
          url = new URL(location, url).href;
          if (response.status === 303 || ([301, 302].includes(response.status) && method === 'POST')) {
            method = 'GET'; body = undefined; headers.delete('Content-Type');
          }
          continue;
        }
        // fetch decodes gzip/deflate/br; cap the decoded response as well.
        const reader = response.body?.getReader();
        const chunks: Uint8Array[] = []; let length = 0;
        if (reader) while (true) {
          const next = await reader.read(); if (next.done) break;
          length += next.value.length;
          if (length > 2 * 1024 * 1024) { await reader.cancel(); throw new PortalError('PORTAL_RESPONSE_TOO_LARGE', 'The college portal returned an oversized response.'); }
          chunks.push(next.value);
        }
        return { status: response.status, url, body: Buffer.concat(chunks).toString('utf8') };
      } catch (error) {
        if (error instanceof PortalError) throw error;
        throw new PortalError(signal.aborted ? 'PORTAL_TIMEOUT' : 'PORTAL_UNAVAILABLE', signal.aborted
          ? 'The college portal took too long to respond. Please try again.' : 'Unable to reach the college portal. Please try again later.', 503);
      }
    }
    throw new PortalError('PORTAL_REDIRECT_LIMIT', 'The college portal could not establish a login session. Please try again later.', 503);
  };
}

function checkPortalResponse(response: { status: number; body: string }, portal: CollegePortal) {
  if (/just a moment|cf-browser-verification|enable javascript and cookies/i.test(response.body) || response.status === 403) {
    throw new PortalError('PORTAL_VERIFICATION_REQUIRED', `${portal.toUpperCase()} requires browser verification on the official college portal. Automated sign-in is currently unavailable.`, 503);
  }
  if (response.status >= 500 || /Server Error in .* Application|Runtime Error/i.test(response.body)) {
    throw new PortalError('PORTAL_UNAVAILABLE', 'The college portal reported a server error. Please try again later.', 503);
  }
  if (response.status !== 200) throw new PortalError('PORTAL_UNAVAILABLE', 'The college portal is temporarily unavailable.', 503);
}

export function parsePortalProfileHtml(rawHtml: string, rollNo: string, portal: CollegePortal) {
  let html = rawHtml;
  try { const parsed = JSON.parse(rawHtml); html = typeof parsed === 'string' ? parsed : parsed.value; } catch { /* AjaxPro may return raw HTML. */ }
  if (typeof html !== 'string') throw new PortalError('PORTAL_PROFILE_INVALID', 'The college portal did not return a valid student profile.');
  const $ = load(html);
  const values: Record<string, string> = {};
  $('tr').each((_, el) => {
    const cells = $(el).children('td');
    // The bio-data rows use a separate ':' cell. Other tables contain column
    // headings such as 'Name | Address', which must not overwrite the student.
    if (cells.length < 3 || cells.eq(1).text().trim() !== ':') return;
    const label = cells.first().text().replace(/[:\s]+/g, ' ').trim().toLowerCase();
    const data = cells.slice(1).toArray().map(cell => $(cell).text().trim()).filter(text => text && text !== ':').join(' ');
    if (label && data && !values[label]) values[label] = data;
  });
  const name = values.name || values['student name'];
  const returnedRoll = values['roll no'] || values['roll number'] || values['rollno'];
  if (!name || (returnedRoll && returnedRoll.toUpperCase() !== rollNo)) throw new PortalError('PORTAL_PROFILE_INVALID', 'The college portal did not return the requested student profile.');
  const image = $('img[src]').toArray().map(el => $(el).attr('src')!).find(src => /StudentPhotos\//i.test(src));
  const imageUrl = image ? new URL(image, `https://info.aec.edu.in/${portal}/Academics/StudentProfile.aspx`).href : '';
  const totalCells = $('tr').filter((_, el) => $(el).children('td').first().text().trim().toUpperCase() === 'TOTAL').first().children('td');
  const attendanceValue = totalCells.length >= 4 ? parseFloat(totalCells.last().text()) : NaN;
  return { studentId: rollNo, portal, name, department: values.branch || values.department || '',
    classSection: values.section || values['class section'] || '', academicYear: values['academic year'] || '',
    ...(Number.isFinite(attendanceValue) && attendanceValue >= 0 && attendanceValue <= 100 ? { attendance: attendanceValue } : {}),
    profileImage: imageUrl.startsWith('https://info.aec.edu.in/') ? imageUrl : '', isSynced: true };
}

export async function verifyCollegePortal(rollNo: string, password: string, portal: CollegePortal, fetcher: typeof fetch = fetch) {
  const request = createPortalClient(portal, fetcher);
  const loginUrl = portalUrl(portal);
  const initial = await request(loginUrl);
  checkPortalResponse(initial, portal);
  const form = buildPortalLoginForm(initial.body, rollNo, password, portal);
  const dashboard = await request(form.action, { method: 'POST', body: form.body, headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: loginUrl, Origin: 'https://info.aec.edu.in' } });
  checkPortalResponse(dashboard, portal);
  const $ = load(dashboard.body);
  if (!/\/StudentMaster\.aspx$/i.test(new URL(dashboard.url).pathname) || !$('#lnkLogOut').length) {
    throw new PortalError('INVALID_PORTAL_CREDENTIALS', `Login failed on ${portal.toUpperCase()}. Check your roll number, ECAP password, and selected college.`, 401);
  }
  const profileLink = $('a[href]').toArray().map(el => $(el).attr('href')!).find(href => /\/StudentProfile\.aspx/i.test(href));
  const profileUrl = new URL(profileLink || `/${portal}/Academics/StudentProfile.aspx?scrid=17`, dashboard.url).href;
  const profilePage = await request(profileUrl); checkPortalResponse(profilePage, portal);
  const page = load(profilePage.body);
  const ajaxSource = page('script[src]').toArray().map(el => page(el).attr('src')!).find(src => /\/ajax\/StudentProfile,.*\.ashx/i.test(src));
  if (!ajaxSource) return parsePortalProfileHtml(profilePage.body, rollNo, portal);
  const ajaxUrl = new URL(ajaxSource, profileUrl); ajaxUrl.search = '?_method=ShowStudentProfileNew&_session=rw';
  const response = await request(ajaxUrl.href, { method: 'POST', headers: { 'X-AjaxPro-Method': 'ShowStudentProfileNew', 'Content-Type': 'text/plain; charset=utf-8', Referer: profileUrl },
    body: `RollNo=${encodeURIComponent(rollNo)}\r\nisImageDisplay=true` });
  checkPortalResponse(response, portal);
  return parsePortalProfileHtml(response.body, rollNo, portal);
}
