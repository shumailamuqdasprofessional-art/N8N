/* global Twilio */
const $ = (id) => document.getElementById(id);

let device = null;
let call = null;
let incoming = null;
let timerId = null;
let password = '';

function log(msg) {
  const li = document.createElement('li');
  li.textContent = `${new Date().toLocaleTimeString()}  ${msg}`;
  $('log').prepend(li);
}

function setStatus(text, state) {
  $('status').textContent = text;
  $('status-dot').className = `dot ${state || ''}`;
}

function startTimer() {
  const start = Date.now();
  timerId = setInterval(() => {
    const s = Math.floor((Date.now() - start) / 1000);
    $('timer').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }, 500);
}

function stopTimer() {
  clearInterval(timerId);
  $('timer').textContent = '';
}

function setInCall(active) {
  const btn = $('call');
  btn.textContent = active ? 'Hang up' : 'Call';
  btn.classList.toggle('call', !active);
  btn.classList.toggle('hangup', active);
  $('mute').disabled = !active;
  $('mute').classList.remove('active');
  $('mute').textContent = 'Mute';
  if (!active) {
    call = null;
    stopTimer();
    setStatus('Ready', 'ready');
  }
}

// Turn what was typed into +E.164 (strips spaces, dashes, brackets; 00 -> +).
function normalize(raw) {
  let n = raw.replace(/[^\d+]/g, '');
  if (n.startsWith('00')) n = '+' + n.slice(2);
  if (!n.startsWith('+')) n = '+' + n;
  return n;
}

async function fetchToken() {
  const res = await fetch('/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not get token');
  return data;
}

function wireCall(c) {
  call = c;
  setInCall(true);
  c.on('accept', () => {
    setStatus('In call', 'busy');
    startTimer();
    log('Connected');
  });
  c.on('disconnect', () => { log('Call ended'); setInCall(false); });
  c.on('cancel', () => { log('Call cancelled'); setInCall(false); });
  c.on('reject', () => { log('Call rejected'); setInCall(false); });
  c.on('error', (e) => { log(`Call error: ${e.message}`); setInCall(false); });
}

async function startDevice() {
  const { token, callerId } = await fetchToken();
  device = new Twilio.Device(token, { codecPreferences: ['opus', 'pcmu'], closeProtection: true });

  device.on('registered', () => {
    setStatus(`Ready · calling from ${callerId}`, 'ready');
    $('call').disabled = false;
  });
  device.on('error', (e) => { setStatus(e.message, 'error'); log(`Device error: ${e.message}`); });
  device.on('tokenWillExpire', async () => {
    try { device.updateToken((await fetchToken()).token); } catch (e) { log(e.message); }
  });
  device.on('incoming', (c) => {
    incoming = c;
    $('incoming-from').textContent = c.parameters.From || 'Unknown';
    $('incoming').hidden = false;
    log(`Incoming call from ${c.parameters.From}`);
    const clear = () => { $('incoming').hidden = true; incoming = null; };
    c.on('cancel', clear);
    c.on('disconnect', clear);
  });

  await device.register();
}

// --- UI -----------------------------------------------------------------

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  password = $('password').value;
  $('login-error').textContent = '';
  try {
    $('login').hidden = true;
    $('dialer').hidden = false;
    await startDevice();
  } catch (err) {
    $('dialer').hidden = true;
    $('login').hidden = false;
    $('login-error').textContent = err.message;
  }
});

function pressKey(key) {
  if (call) {
    call.sendDigits(key); // DTMF during a call (menus, extensions)
  }
  $('number').value += key;
}

$('keypad').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (btn) pressKey(btn.dataset.key);
});

// Long-press 0 for "+"
let zeroTimer;
const zero = document.querySelector('[data-key="0"]');
zero.addEventListener('pointerdown', () => {
  zeroTimer = setTimeout(() => { $('number').value += '+'; zeroTimer = 'fired'; }, 600);
});
zero.addEventListener('click', (e) => {
  if (zeroTimer === 'fired') e.stopPropagation(); // "+" already added, skip the "0"
  clearTimeout(zeroTimer);
  zeroTimer = null;
}, true);

$('back').addEventListener('click', () => {
  $('number').value = $('number').value.slice(0, -1);
});

$('call').addEventListener('click', async () => {
  if (call) {
    call.disconnect();
    return;
  }
  const to = normalize($('number').value);
  if (!/^\+[1-9]\d{6,14}$/.test(to)) {
    log('Enter a full number with country code, e.g. +15551234567');
    return;
  }
  $('number').value = to;
  setStatus(`Calling ${to}…`, 'busy');
  log(`Calling ${to}`);
  try {
    wireCall(await device.connect({ params: { To: to } }));
  } catch (err) {
    log(err.message);
    setInCall(false);
  }
});

$('mute').addEventListener('click', () => {
  if (!call) return;
  const muted = !call.isMuted();
  call.mute(muted);
  $('mute').classList.toggle('active', muted);
  $('mute').textContent = muted ? 'Unmute' : 'Mute';
});

$('accept').addEventListener('click', () => {
  if (!incoming) return;
  const c = incoming;
  $('incoming').hidden = true;
  incoming = null;
  wireCall(c);
  c.accept();
});

$('reject').addEventListener('click', () => {
  if (incoming) incoming.reject();
  $('incoming').hidden = true;
  incoming = null;
});

$('number').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('call').click();
});

// Typing on the keyboard during a call sends DTMF
document.addEventListener('keydown', (e) => {
  if (call && document.activeElement !== $('number') && /^[0-9*#]$/.test(e.key)) {
    call.sendDigits(e.key);
  }
});
