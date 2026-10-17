// Twilio Function: path /test, visibility "Public" (protected by TEST_PASSWORD below)
// Open: https://YOUR-SERVICE.twil.io/test?key=YOUR_TEST_PASSWORD
//
// Environment variables in the Functions service:
//   TEST_PASSWORD  (required)  password for this page
//   MY_MOBILE      (optional)  your mobile, e.g. +15551234567, for test SMS / call
//   TWILIO_NUMBER  (optional)  which Twilio number to check (default: your first number)

// ===== Your setup (what each setting should be) =====
const EXPECTED = {
  incomingSms: 'https://handler.twilio.com/twiml/EH71773ebfabf3cc004c6e9f64d8a5ffc8',
  outgoingCall: 'https://handler.twilio.com/twiml/EH9255add6d9eab664319ef17209321f08',
  incomingCall: 'https://handler.twilio.com/twiml/EH078a6cd2a8a845ae2a6b9e0aa9eac0bc',
  twimlAppSid: 'AP3eb42761ba65bdc2b4dabab0e4cd5774'
};
// =====================================================

const crypto = require('crypto');

const esc = (s) => String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
const same = (a, b) => String(a || '').replace(/\/$/, '') === String(b || '').replace(/\/$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function passwordOk(given, expected) {
  const a = crypto.createHash('sha256').update(String(given || '')).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

function htmlPage(body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Twilio Setup Test</title>
<style>
:root{--bg:#f4f5f7;--card:#fff;--text:#16181d;--muted:#6b7280;--line:#e5e7eb;--ok:#16a34a;--bad:#dc2626;--warn:#d97706;--accent:#2563eb}
@media (prefers-color-scheme:dark){:root{--bg:#0f1115;--card:#181b21;--text:#f3f4f6;--muted:#9ca3af;--line:#2a2f38;--accent:#60a5fa}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:16px}
main{max-width:760px;margin:0 auto}h1{font-size:22px;margin:4px 0 16px}h2{font-size:16px;margin:0 0 10px}
section{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;margin-bottom:14px}
.row{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-top:1px solid var(--line)}.row:first-of-type{border-top:0}
.icon{width:22px;flex:none;text-align:center}.ok{color:var(--ok)}.bad{color:var(--bad)}.warn{color:var(--warn)}
.label{font-weight:600}.detail{font-size:13px;color:var(--muted);word-break:break-all}
.summary{font-size:18px;font-weight:700}
button{border:0;border-radius:10px;padding:12px 16px;font-size:15px;font-weight:600;color:#fff;background:var(--accent);cursor:pointer;margin:4px 6px 4px 0}
button.fix{background:var(--warn)}input{padding:11px;border-radius:10px;border:1px solid var(--line);font-size:15px;width:220px;max-width:100%;background:transparent;color:var(--text)}
form{display:inline}.msg{padding:12px;border-radius:10px;border:1px solid var(--line);margin-bottom:14px}
</style></head><body><main>${body}</main></body></html>`;
}

function row(state, label, detail) {
  const icon = state === 'ok' ? '✅' : state === 'warn' ? '⚠️' : '❌';
  return `<div class="row"><div class="icon">${icon}</div><div><div class="label">${esc(label)}</div>${detail ? `<div class="detail">${detail}</div>` : ''}</div></div>`;
}

async function runAction(client, action, number, services, mobile) {
  if (action === 'sms') {
    if (!mobile) return '❌ Enter your mobile number first.';
    const msg = await client.messages.create({ from: number.phoneNumber, to: mobile, body: 'Test SMS from your Twilio setup. It works! ✅' });
    await sleep(5000);
    const latest = await client.messages(msg.sid).fetch();
    const failed = ['failed', 'undelivered'].includes(latest.status);
    return `${failed ? '❌' : '✅'} Test SMS to ${esc(mobile)}: status <b>${esc(latest.status)}</b>` +
      (latest.errorCode ? ` · error <b>${esc(latest.errorCode)}</b> (<a href="https://www.twilio.com/docs/api/errors/${esc(latest.errorCode)}" target="_blank">what it means</a>)` : '') +
      (latest.status === 'sent' || latest.status === 'queued' ? ' · check your phone in a few seconds.' : '');
  }

  if (action === 'call') {
    if (!mobile) return '❌ Enter your mobile number first.';
    const call = await client.calls.create({
      from: number.phoneNumber,
      to: mobile,
      twiml: '<Response><Say>Hello. This is a test call from your Twilio setup. Calling works. Goodbye.</Say></Response>'
    });
    return `✅ Calling ${esc(mobile)} now (status <b>${esc(call.status)}</b>). Your phone should ring.`;
  }

  if (action === 'fix') {
    const done = [];
    await client.incomingPhoneNumbers(number.sid).update({
      voiceApplicationSid: '',
      voiceUrl: EXPECTED.incomingCall,
      voiceMethod: 'POST',
      smsApplicationSid: '',
      smsUrl: EXPECTED.incomingSms,
      smsMethod: 'POST'
    });
    done.push(`Phone number ${esc(number.phoneNumber)}: incoming call + SMS URLs`);

    await client.applications(EXPECTED.twimlAppSid).update({ voiceUrl: EXPECTED.outgoingCall, voiceMethod: 'POST' });
    done.push('TwiML App: outgoing call URL');

    for (const s of services.filter((x) => x.hasNumber)) {
      await client.messaging.v1.services(s.sid).update({
        inboundRequestUrl: EXPECTED.incomingSms,
        inboundMethod: 'POST',
        useInboundWebhookOnNumber: false
      });
      done.push(`Messaging Service "${esc(s.friendlyName)}": incoming SMS URL`);
    }
    return '✅ Fixed:<br>• ' + done.join('<br>• ') + '<br>The checks below show the new settings.';
  }
  return '';
}

exports.handler = async function (context, event, callback) {
  const response = new Twilio.Response();
  response.appendHeader('Content-Type', 'text/html; charset=utf-8');
  response.appendHeader('Cache-Control', 'no-store');

  if (!context.TEST_PASSWORD) {
    response.setBody(htmlPage('<h1>Setup needed</h1><section>Add the environment variable <b>TEST_PASSWORD</b> to this Functions service, then deploy again.</section>'));
    return callback(null, response);
  }
  if (!passwordOk(event.key, context.TEST_PASSWORD)) {
    response.setStatusCode(401);
    response.setBody(htmlPage('<h1>Password needed</h1><section>Open this page as <b>/test?key=YOUR_TEST_PASSWORD</b></section>'));
    return callback(null, response);
  }

  const client = context.getTwilioClient();
  const key = esc(event.key);
  const keyUrl = esc(encodeURIComponent(event.key));
  const mobile = String(event.mobile || context.MY_MOBILE || '').trim();
  let body = '<h1>Twilio Setup Test</h1>';
  let problems = 0;

  try {
    // ---- Phone number ----
    const numbers = await client.incomingPhoneNumbers.list({ limit: 50 });
    if (numbers.length === 0) throw new Error('No phone numbers found in this account.');
    const number = numbers.find((n) => n.phoneNumber === context.TWILIO_NUMBER) || numbers[0];

    // ---- Messaging Services that contain this number ----
    const services = [];
    for (const s of await client.messaging.v1.services.list({ limit: 20 })) {
      const pool = await client.messaging.v1.services(s.sid).phoneNumbers.list({ limit: 100 });
      const hasNumber = pool.some((p) => p.phoneNumber === number.phoneNumber);
      let campaigns = [];
      try { campaigns = await client.messaging.v1.services(s.sid).usAppToPerson.list({ limit: 5 }); } catch (e) { /* not a US A2P service */ }
      services.push({ sid: s.sid, friendlyName: s.friendlyName, inboundRequestUrl: s.inboundRequestUrl, useInboundWebhookOnNumber: s.useInboundWebhookOnNumber, hasNumber, campaigns });
    }

    // ---- Run a button action first, so the checks show the result ----
    if (event.action) {
      let note;
      try { note = await runAction(client, event.action, number, services, mobile); } catch (e) { note = '❌ ' + esc(e.message); }
      if (event.action === 'fix') return callback(null, redirectAfterFix(response, event.key, note));
      if (note) body += `<div class="msg">${note}</div>`;
    }
    if (event.fixed) body += `<div class="msg">✅ Settings fixed. The checks below show the new settings.</div>`;

    const freshNumber = await client.incomingPhoneNumbers(number.sid).fetch();
    const app = await client.applications(EXPECTED.twimlAppSid).fetch().catch(() => null);
    const freshServices = [];
    for (const s of services) {
      const fresh = await client.messaging.v1.services(s.sid).fetch();
      freshServices.push({ ...s, inboundRequestUrl: fresh.inboundRequestUrl, useInboundWebhookOnNumber: fresh.useInboundWebhookOnNumber });
    }

    // ---- Calls ----
    let calls = '';
    const callOk = !freshNumber.voiceApplicationSid && same(freshNumber.voiceUrl, EXPECTED.incomingCall);
    calls += row(callOk ? 'ok' : 'bad', `📞 Incoming call (${freshNumber.phoneNumber})`,
      callOk ? 'Uses your Incoming Call bin.' : `Now: ${esc(freshNumber.voiceApplicationSid ? 'TwiML App ' + freshNumber.voiceApplicationSid : freshNumber.voiceUrl || 'empty')}<br>Should be: ${esc(EXPECTED.incomingCall)}`);
    if (!callOk) problems++;

    const appOk = app && same(app.voiceUrl, EXPECTED.outgoingCall);
    calls += row(appOk ? 'ok' : 'bad', '📲 Outgoing call (browser dialer TwiML App)',
      !app ? `TwiML App ${esc(EXPECTED.twimlAppSid)} not found in this account.` :
        appOk ? 'Uses your Outgoing Call bin.' : `Now: ${esc(app.voiceUrl || 'empty')}<br>Should be: ${esc(EXPECTED.outgoingCall)}`);
    if (!appOk) problems++;

    // ---- Messages ----
    let sms = '';
    const myServices = freshServices.filter((s) => s.hasNumber);
    const numberSmsOk = !freshNumber.smsApplicationSid && same(freshNumber.smsUrl, EXPECTED.incomingSms);

    if (myServices.length === 0) {
      sms += row(numberSmsOk ? 'ok' : 'bad', '💬 Incoming SMS (phone number)',
        numberSmsOk ? 'Uses your Incoming SMS bin.' : `Now: ${esc(freshNumber.smsUrl || 'empty')}<br>Should be: ${esc(EXPECTED.incomingSms)}`);
      if (!numberSmsOk) problems++;
      sms += row('bad', 'Messaging Service', 'This number is not in any Messaging Service. For A2P 10DLC it must be in the Sender Pool of the service linked to your campaign.');
      problems++;
    }
    for (const s of myServices) {
      const effectiveUrl = s.useInboundWebhookOnNumber ? freshNumber.smsUrl : s.inboundRequestUrl;
      const ok = same(effectiveUrl, EXPECTED.incomingSms);
      sms += row(ok ? 'ok' : 'bad', `💬 Incoming SMS (Messaging Service "${s.friendlyName}")`,
        ok ? (s.useInboundWebhookOnNumber ? 'Uses the number\'s webhook, which is your Incoming SMS bin.' : 'Uses your Incoming SMS bin.')
          : `Now: ${esc(effectiveUrl || 'empty')}<br>Should be: ${esc(EXPECTED.incomingSms)}`);
      if (!ok) problems++;

      if (s.campaigns.length === 0) {
        sms += row('bad', '📋 A2P 10DLC campaign', `No campaign linked to "${esc(s.friendlyName)}". US SMS will be blocked.`);
        problems++;
      }
      for (const c of s.campaigns) {
        const status = String(c.campaignStatus || '').toUpperCase();
        const state = status === 'VERIFIED' ? 'ok' : ['FAILED', 'SUSPENDED'].includes(status) ? 'bad' : 'warn';
        sms += row(state, `📋 A2P 10DLC campaign: ${status || 'UNKNOWN'}`,
          state === 'ok' ? 'Approved. SMS can be delivered.' : state === 'warn' ? 'Still in review. SMS may not deliver until VERIFIED.' : 'Campaign problem. Open Messaging → Regulatory Compliance to see why.');
        if (state === 'bad') problems++;
      }
    }

    // ---- Recent errors ----
    let errors = '';
    try {
      const alerts = await client.monitor.v1.alerts.list({ limit: 5 });
      errors = alerts.length === 0 ? row('ok', 'No recent errors', '') :
        alerts.map((a) => row('warn', `Error ${a.errorCode}`, `${esc(new Date(a.dateCreated).toLocaleString())} · ${esc((a.alertText || '').slice(0, 160))}` +
          ` · <a href="https://www.twilio.com/docs/api/errors/${esc(a.errorCode)}" target="_blank">what it means</a>`)).join('');
    } catch (e) {
      errors = row('warn', 'Could not read error log', esc(e.message));
    }

    body += `<section><div class="summary ${problems ? 'bad' : 'ok'}">${problems ? `❌ ${problems} problem${problems > 1 ? 's' : ''} found` : '✅ Everything is set up correctly'}</div>
      ${problems ? `<p>Click <b>Fix settings</b> to set all URLs automatically.</p>
      <form method="post"><input type="hidden" name="key" value="${key}"><input type="hidden" name="action" value="fix"><button class="fix">🔧 Fix settings</button></form>` : ''}</section>`;
    body += `<section><h2>Calls</h2>${calls}</section>`;
    body += `<section><h2>Messages</h2>${sms}</section>`;
    body += `<section><h2>Live test (sends to your mobile)</h2>
      <form method="post"><input type="hidden" name="key" value="${key}">
        <input name="mobile" type="tel" placeholder="+15551234567" value="${esc(mobile)}" required><br>
        <button name="action" value="sms">💬 Send test SMS</button>
        <button name="action" value="call">📞 Test call to my mobile</button>
      </form>
      <p class="detail">To test incoming: from your mobile, text and call ${esc(freshNumber.phoneNumber)}. You should get the auto-reply, and your dialer/mobile should ring.</p></section>`;
    body += `<section><h2>Recent errors</h2>${errors}</section>`;
    body += `<p class="detail"><a href="?key=${keyUrl}">↻ Check again</a></p>`;
  } catch (e) {
    body += `<section>${row('bad', 'Something went wrong', esc(e.message))}</section>`;
  }

  response.setBody(htmlPage(body));
  return callback(null, response);
};

// After a fix, reload the page so refreshing does not repeat the fix
function redirectAfterFix(response, key, note) {
  if (note.startsWith('❌')) {
    response.setBody(htmlPage(`<h1>Twilio Setup Test</h1><div class="msg">${note}</div><p><a href="?key=${esc(encodeURIComponent(key))}">← Back</a></p>`));
    return response;
  }
  response.setStatusCode(303);
  response.appendHeader('Location', `?key=${encodeURIComponent(key)}&fixed=1`);
  response.setBody('');
  return response;
}
