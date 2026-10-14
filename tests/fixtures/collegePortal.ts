import { encryptPortalPassword } from '../../backend/collegePortal';

export const loginHtml = `<form action="./default.aspx" method="post">
<input type="hidden" name="__VIEWSTATE" value="state&amp;value">
<input type="hidden" name="__EVENTVALIDATION" value="event">
<input type="hidden" name="hdnDPToken" value="dynamic-token">
<input name="txtId1"><input name="txtPwd1" type="password"><input name="imgBtn1" type="image">
<input name="txtId2"><input name="txtPwd2" type="password"><input name="imgBtn2" type="image">
<input name="txtId3"><input name="imgBtn3" type="image"><input name="hdnpwd2" type="hidden">
</form>`;

export function profileHtml(roll = '24P31A9999') {
  return `<table><tr><td>Roll No</td><td>:</td><td>${roll}</td></tr>
    <tr><td>Name</td><td>:</td><td><span>Example Student</span></td></tr>
    <tr><td>Branch</td><td>:</td><td>Information Technology</td></tr>
    <tr><td>TOTAL</td><td>392</td><td>500</td><td>78.40</td></tr></table>
    <img src="../StudentPhotos/example.jpg">`;
}

// Models official ASP.NET redirects, per-login cookies, and a changing AjaxPro build hash.
export function officialPortalFixture(password: string, options: { unavailable?: boolean; invalidProfile?: boolean } = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher: typeof fetch = async (input, init: RequestInit = {}) => {
    const url = String(input); calls.push({ url, init });
    if (options.unavailable) return new Response('Runtime Error', { status: 500 });
    const path = new URL(url).pathname;
    if (path.endsWith('/default.aspx') && init.method !== 'POST') return new Response(loginHtml, { headers: { 'Set-Cookie': 'ASP.NET_SessionId=fixture-session; Path=/; HttpOnly' } });
    if (path.endsWith('/default.aspx')) {
      const fields = new URLSearchParams(String(init.body));
      if (fields.get('txtPwd2') !== encryptPortalPassword(password)) return new Response(loginHtml);
      return new Response(null, { status: 302, headers: { Location: 'StudentMaster.aspx' } });
    }
    if (path.endsWith('/StudentMaster.aspx')) return new Response('<a id="lnkLogOut">Logout</a><a href="Academics/StudentProfile.aspx?scrid=17">PROFILE</a>');
    if (path.endsWith('/StudentProfile.aspx')) return new Response('<script src="../ajax/StudentProfile,App_Web_studentprofile.aspx.changed-hash.ashx"></script>');
    if (path.includes('/ajax/StudentProfile,')) {
      const roll = new URLSearchParams(String(init.body).split('\r\n')[0]).get('RollNo')!;
      return new Response(JSON.stringify(options.invalidProfile ? '<h1>Error</h1>' : profileHtml(roll)));
    }
    throw new Error('Unexpected fixture URL');
  };
  return { fetcher, calls };
}
