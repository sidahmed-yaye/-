const API = '/api';
let token = localStorage.getItem('token');
let clinic = JSON.parse(localStorage.getItem('clinic') || 'null');
let currentDate = new Date().toISOString().slice(0, 10);

function statusLabel(status) {
  const map = {
    pending: 'statusPending',
    confirmed: 'statusConfirmed',
    completed: 'statusCompleted',
    cancelled: 'statusCancelled',
    no_show: 'statusNoShow'
  };
  return t(map[status] || status);
}

function showRegister() {
  document.getElementById('loginForm').closest('.card').classList.add('hidden');
  document.getElementById('registerForm').classList.remove('hidden');
}
function showLogin() {
  document.getElementById('registerForm').classList.add('hidden');
  document.getElementById('loginForm').closest('.card').classList.remove('hidden');
}

async function api(path, opts = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(API + path, { ...opts, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'حدث خطأ');
  return data;
}

document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const errEl = document.getElementById('loginError');
  errEl.style.display = 'none';
  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: document.getElementById('loginUsername').value,
        password: document.getElementById('loginPassword').value
      })
    });
    token = data.token; clinic = data.clinic;
    localStorage.setItem('token', token);
    localStorage.setItem('clinic', JSON.stringify(clinic));
    initDashboard();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
});

document.getElementById('registerForm').addEventListener('submit', async e => {
  e.preventDefault();
  const errEl = document.getElementById('regError');
  errEl.style.display = 'none';
  try {
    const data = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('regName').value,
        phone: document.getElementById('regPhone').value,
        username: document.getElementById('regUsername').value,
        password: document.getElementById('regPassword').value,
        workStart: document.getElementById('regStart').value,
        workEnd: document.getElementById('regEnd').value
      })
    });
    token = data.token; clinic = data.clinic;
    localStorage.setItem('token', token);
    localStorage.setItem('clinic', JSON.stringify(clinic));
    initDashboard();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
});

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('clinic');
  location.reload();
}

function shiftDate(delta) {
  const d = new Date(currentDate);
  d.setDate(d.getDate() + delta);
  currentDate = d.toISOString().slice(0, 10);
  document.getElementById('dateInput').value = currentDate;
  loadAppointments();
}

function bookingUrl() {
  return `${location.origin}/book.html?clinic=${encodeURIComponent(clinic.slug)}`;
}

function copyBookingLink() {
  const url = bookingUrl();
  navigator.clipboard.writeText(url);
  alert(t('linkCopied') + url);
}

async function loadAppointments() {
  const list = document.getElementById('apptList');
  list.innerHTML = '<div class="empty-state">...</div>';
  try {
    const appts = await api(`/appointments?date=${currentDate}`);
    renderStats(appts);
    if (appts.length === 0) {
      list.innerHTML = `<div class="empty-state"><div class="icon">📅</div>${t('noAppts')}</div>`;
      return;
    }
    list.innerHTML = '';
    appts.forEach(a => list.appendChild(renderAppt(a)));
  } catch (err) {
    list.innerHTML = `<div class="empty-state">${err.message}</div>`;
  }
}

function renderStats(appts) {
  document.getElementById('statTotal').textContent = appts.length;
  document.getElementById('statConfirmed').textContent = appts.filter(a => a.status === 'confirmed').length;
  document.getElementById('statPending').textContent = appts.filter(a => a.status === 'pending').length;
}

// عرض الوقت مباشرة من النص الخام "YYYY-MM-DDTHH:MM" بدون تحويل عبر Date/المنطقة الزمنية
function displayTime(rawTime) {
  const timePart = rawTime.split('T')[1] || '';
  return timePart.slice(0, 5);
}

function renderAppt(a) {
  const row = document.createElement('div');
  row.className = 'appt-row';
  row.innerHTML = `
    <div class="appt-time">${displayTime(a.time)}</div>
    <div class="appt-info">
      <div class="p-name">${a.patient ? a.patient.name : '—'}</div>
      <div class="p-meta">${a.patient ? a.patient.phone : ''} ${a.reason ? '· ' + a.reason : ''}</div>
    </div>
    <span class="badge ${a.status}">${statusLabel(a.status)}</span>
    <div class="appt-actions"></div>
  `;
  const actions = row.querySelector('.appt-actions');

  if (a.status === 'pending') {
    actions.appendChild(makeBtn(t('confirm'), 'btn-accent', () => updateStatus(a.id, 'confirmed')));
  }
  if (a.status === 'pending' || a.status === 'confirmed') {
    actions.appendChild(makeBtn(t('visited'), 'btn-primary', () => updateStatus(a.id, 'completed')));
    actions.appendChild(makeBtn(t('noShow'), 'btn-ghost', () => updateStatus(a.id, 'no_show')));
    actions.appendChild(makeBtn(t('cancel'), 'btn-ghost', () => updateStatus(a.id, 'cancelled')));
  }
  return row;
}

function makeBtn(label, cls, onclick) {
  const b = document.createElement('button');
  b.textContent = label;
  b.className = 'btn btn-small ' + cls;
  b.type = 'button';
  b.onclick = onclick;
  return b;
}

async function updateStatus(id, status) {
  try {
    await api(`/appointments/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
    loadAppointments();
  } catch (err) {
    alert(err.message);
  }
}

document.getElementById('addApptForm').addEventListener('submit', async e => {
  e.preventDefault();
  const successEl = document.getElementById('addSuccess');
  const errEl = document.getElementById('addError');
  errEl.style.display = 'none';
  try {
    // نرسل قيمة datetime-local كما هي (YYYY-MM-DDTHH:MM) دون أي تحويل عبر Date/ISO
    // لتفادي انزياح التاريخ الناتج عن اختلاف المنطقة الزمنية بين المتصفح والخادم
    const rawTime = document.getElementById('apTime').value;
    await api('/appointments', {
      method: 'POST',
      body: JSON.stringify({
        patientName: document.getElementById('apName').value,
        patientPhone: document.getElementById('apPhone').value,
        time: rawTime,
        reason: document.getElementById('apReason').value
      })
    });
    e.target.reset();
    successEl.style.display = 'block';
    setTimeout(() => successEl.style.display = 'none', 2500);
    // إن كان الموعد المضاف في نفس اليوم المعروض، حدّث القائمة مباشرة
    if (rawTime.startsWith(currentDate)) loadAppointments();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
});

async function loadSettings() {
  try {
    const c = await api('/clinic/me');
    document.getElementById('setName').value = c.name;
    document.getElementById('setPhone').value = c.phone;
    document.getElementById('setStart').value = c.workStart;
    document.getElementById('setEnd').value = c.workEnd;
    document.getElementById('setSlotMinutes').value = c.slotMinutes;
  } catch (err) {
    console.error(err);
  }
}

document.getElementById('settingsForm').addEventListener('submit', async e => {
  e.preventDefault();
  const successEl = document.getElementById('settingsSuccess');
  const errEl = document.getElementById('settingsError');
  errEl.style.display = 'none';
  try {
    const updated = await api('/clinic/me', {
      method: 'PUT',
      body: JSON.stringify({
        name: document.getElementById('setName').value,
        phone: document.getElementById('setPhone').value,
        workStart: document.getElementById('setStart').value,
        workEnd: document.getElementById('setEnd').value,
        slotMinutes: document.getElementById('setSlotMinutes').value
      })
    });
    clinic = { ...clinic, name: updated.name, phone: updated.phone };
    localStorage.setItem('clinic', JSON.stringify(clinic));
    document.getElementById('clinicNameLabel').textContent = clinic.name;
    successEl.style.display = 'block';
    setTimeout(() => successEl.style.display = 'none', 2500);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
});

function onLangChange() {
  loadAppointments();
}

function initDashboard() {
  document.getElementById('authView').classList.add('hidden');
  document.getElementById('dashView').classList.remove('hidden');
  document.getElementById('clinicNameLabel').textContent = clinic.name;
  document.getElementById('bookingLink').textContent = bookingUrl();
  document.getElementById('dateInput').value = currentDate;
  document.getElementById('dateInput').addEventListener('change', e => {
    currentDate = e.target.value;
    loadAppointments();
  });
  loadAppointments();
  loadSettings();
}

if (token && clinic) initDashboard();
