const API = '/api';
let token = localStorage.getItem('token');
let clinic = JSON.parse(localStorage.getItem('clinic') || 'null');
let currentDate = new Date().toISOString().slice(0, 10);

function statusLabel(status) {
  const map = {
    pending: 'statusPending',
    confirmed: 'statusConfirmed',
    rejected: 'statusRejected',
    completed: 'statusCompleted',
    cancelled: 'statusCancelled',
    no_show: 'statusNoShow'
  };
  return t(map[status] || status);
}

// ---- تبديل التبويب: بحث عن عيادة / دخول العيادة ----
function switchLandingTab(tabName) {
  document.querySelectorAll('.landing-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.getElementById('searchTabContent').classList.toggle('hidden', tabName !== 'search');
  document.getElementById('clinicTabContent').classList.toggle('hidden', tabName !== 'clinic');
}

// ---- دليل بحث العيادات (مدمج في نفس الصفحة) ----
let directoryFilters = { specialties: [], cities: [] };
let searchDebounceTimer = null;

async function loadDirectoryFilters() {
  try {
    const res = await fetch('/api/public/directory/filters');
    directoryFilters = await res.json();
    const specSelect = document.getElementById('filterSpecialty');
    directoryFilters.specialties.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      specSelect.appendChild(opt);
    });
    const citySelect = document.getElementById('filterCity');
    directoryFilters.cities.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      citySelect.appendChild(opt);
    });
  } catch (err) {
    console.error(err);
  }
}

async function searchDirectory() {
  const list = document.getElementById('resultsList');
  list.innerHTML = `<div class="empty-state">...</div>`;

  const query = document.getElementById('searchQuery').value.trim();
  const specialty = document.getElementById('filterSpecialty').value;
  const city = document.getElementById('filterCity').value;

  const urlParams = new URLSearchParams();
  if (query) urlParams.set('query', query);
  if (specialty) urlParams.set('specialty', specialty);
  if (city) urlParams.set('city', city);

  try {
    const res = await fetch(`/api/public/directory?${urlParams.toString()}`);
    const clinics = await res.json();
    if (clinics.length === 0) {
      list.innerHTML = `<div class="empty-state"><div class="icon">🔍</div>${t('noClinicsFound')}</div>`;
      return;
    }
    list.innerHTML = '';
    clinics.forEach(c => list.appendChild(renderDirectoryCard(c)));
  } catch (err) {
    list.innerHTML = `<div class="empty-state">${t('clinicNotFound')}</div>`;
  }
}

function renderDirectoryCard(c) {
  const card = document.createElement('div');
  card.className = 'clinic-card';
  const metaParts = [];
  if (c.specialty) metaParts.push(`<span>🩺 ${c.specialty}</span>`);
  if (c.city) metaParts.push(`<span>📍 ${c.city}</span>`);
  metaParts.push(`<span>🕐 ${c.workStart} - ${c.workEnd}</span>`);

  card.innerHTML = `
    <div>
      <div class="name">${c.name}</div>
      <div class="meta">${metaParts.join('')}</div>
    </div>
  `;
  const btn = document.createElement('button');
  btn.className = 'btn btn-primary btn-small';
  btn.textContent = t('bookNow');
  btn.onclick = () => {
    location.href = `book.html?clinic=${encodeURIComponent(c.slug)}`;
  };
  card.appendChild(btn);
  return card;
}

document.getElementById('searchQuery').addEventListener('input', () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(searchDirectory, 300);
});
document.getElementById('filterSpecialty').addEventListener('change', searchDirectory);
document.getElementById('filterCity').addEventListener('change', searchDirectory);

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
        workEnd: document.getElementById('regEnd').value,
        specialty: document.getElementById('regSpecialty').value,
        city: document.getElementById('regCity').value
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
      <div class="p-meta">${a.patient ? a.patient.phone : ''} ${a.reason ? '· ' + a.reason : ''} ${a.service ? '· ' + a.service : ''}</div>
    </div>
    <span class="badge ${a.status}">${statusLabel(a.status)}</span>
    <div class="appt-actions"></div>
  `;
  const actions = row.querySelector('.appt-actions');

  if (a.paymentProofPath) {
    const proofBtn = makeBtn(t('viewPaymentProof'), 'btn-ghost', () => viewPaymentProof(a.id));
    actions.appendChild(proofBtn);
  }

  if (a.status === 'pending') {
    actions.appendChild(makeBtn(t('confirm'), 'btn-accent', () => updateStatus(a.id, 'confirmed')));
    actions.appendChild(makeBtn(t('reject'), 'btn-ghost', () => updateStatus(a.id, 'rejected')));
  }
  if (a.status === 'confirmed') {
    actions.appendChild(makeBtn(t('visited'), 'btn-primary', () => updateStatus(a.id, 'completed')));
    actions.appendChild(makeBtn(t('noShow'), 'btn-ghost', () => updateStatus(a.id, 'no_show')));
    actions.appendChild(makeBtn(t('cancel'), 'btn-ghost', () => updateStatus(a.id, 'cancelled')));
    actions.appendChild(makeBtn(
      a.sharedWithNetwork ? t('unshareNote') : t('shareNote'),
      a.sharedWithNetwork ? 'btn-accent' : 'btn-ghost',
      () => toggleShare(a.id, !a.sharedWithNetwork)
    ));
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

async function viewPaymentProof(apptId) {
  try {
    const res = await fetch(`${API}/appointments/${apptId}/payment-proof`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('تعذر تحميل الصورة');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  } catch (err) {
    alert(err.message);
  }
}

async function toggleShare(id, share) {
  try {
    await api(`/appointments/${id}`, { method: 'PUT', body: JSON.stringify({ sharedWithNetwork: share }) });
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
        reason: document.getElementById('apReason').value,
        service: document.getElementById('apService').value
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

async function loadBilling() {
  try {
    const b = await api('/clinic/billing');
    document.getElementById('billingTodayConfirmed').textContent = b.todayConfirmedCount;
    document.getElementById('billingTodayDue').textContent = b.todayAmountDue;
    document.getElementById('billingTotalDue').textContent = b.totalDues;

    const banner = document.getElementById('trialBanner');
    banner.classList.remove('hidden');
    if (b.trialActive) {
      const daysLeft = Math.ceil((new Date(b.trialEndsAt).getTime() - Date.now()) / 86400000);
      banner.style.background = 'var(--pending-bg)';
      banner.style.color = 'var(--pending)';
      banner.textContent = t('trialActiveMsg').replace('{days}', daysLeft);
    } else {
      banner.style.background = 'var(--indigo-soft)';
      banner.style.color = 'var(--indigo-deep)';
      banner.textContent = t('trialEndedMsg');
    }
  } catch (err) {
    console.error(err);
  }
}

let currentAnalyticsPeriod = 'day';
let analyticsCache = null;

async function loadAnalytics() {
  try {
    analyticsCache = await api('/clinic/analytics');
    renderAnalyticsPeriod();
    renderTrendChart();
  } catch (err) {
    console.error(err);
  }
}

function switchAnalyticsPeriod(period) {
  currentAnalyticsPeriod = period;
  document.querySelectorAll('.analytics-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.period === period);
  });
  renderAnalyticsPeriod();
}

function renderAnalyticsPeriod() {
  if (!analyticsCache) return;
  const data = analyticsCache[currentAnalyticsPeriod];
  document.getElementById('anConfirmed').textContent = data.confirmed;
  document.getElementById('anRejected').textContent = data.rejected;
  document.getElementById('anVisits').textContent = data.completed;
  document.getElementById('anNewPatients').textContent = data.newPatients;
  document.getElementById('anEarnings').textContent = data.earnings;
}

function renderTrendChart() {
  if (!analyticsCache) return;
  const trend = analyticsCache.trend;
  const max = Math.max(1, ...trend.map(d => d.confirmed));
  const chart = document.getElementById('trendChart');
  chart.innerHTML = '';
  trend.forEach(d => {
    const col = document.createElement('div');
    col.className = 'trend-bar-col';
    const dayLabel = new Date(d.date + 'T00:00:00Z').toLocaleDateString(
      getLang() === 'ar' ? 'ar-MA' : 'fr-FR', { day: '2-digit', month: '2-digit' }
    );
    const heightPct = Math.max(4, (d.confirmed / max) * 100);
    col.innerHTML = `
      <div class="trend-bar-value">${d.confirmed}</div>
      <div class="trend-bar" style="height:${heightPct}%;"></div>
      <div class="trend-bar-label">${dayLabel}</div>
    `;
    chart.appendChild(col);
  });
}

async function lookupPatientHistory() {
  const phone = document.getElementById('historyPhone').value.trim();
  const box = document.getElementById('historyResults');
  box.innerHTML = `<div class="empty-state">...</div>`;
  try {
    const hist = await api(`/clinic/patient-history/${phone}`);
    if (!hist.isReturning) {
      box.innerHTML = `<div class="empty-state">${t('noHistoryFound')}</div>`;
    } else {
      let html = `<div style="font-weight:700;margin-bottom:8px;">${hist.patientName || ''}</div>`;

      if (hist.ownVisits.length > 0) {
        html += `<div style="font-size:0.82rem;color:var(--ink-muted);margin-bottom:6px;">${t('ownVisitsLabel')} (${hist.ownVisits.length})</div>`;
        hist.ownVisits.forEach(v => {
          html += renderHistoryVisit(v, null);
        });
      }
      if (hist.networkVisits.length > 0) {
        html += `<div style="font-size:0.82rem;color:var(--ink-muted);margin:12px 0 6px;">${t('networkVisitsLabel')} (${hist.networkVisits.length})</div>`;
        hist.networkVisits.forEach(v => {
          html += renderHistoryVisit(v, v.clinicName);
        });
      }
      box.innerHTML = html;
    }
    currentHistoryPhone = phone;
    document.getElementById('documentsSection').classList.remove('hidden');
    await loadTargetClinicsList();
    await loadPatientDocuments(phone);
  } catch (err) {
    box.innerHTML = `<div class="empty-state">${err.message}</div>`;
    document.getElementById('documentsSection').classList.add('hidden');
  }
}

let currentHistoryPhone = null;

function onSharingModeChange() {
  const mode = document.getElementById('docSharingMode').value;
  document.getElementById('docTargetClinic').classList.toggle('hidden', mode !== 'clinic');
}

async function loadTargetClinicsList() {
  const select = document.getElementById('docTargetClinic');
  if (select.dataset.loaded) return;
  try {
    const clinics = await api('/clinic/other-clinics');
    select.innerHTML = clinics.map(c => `<option value="${c.id}">${c.name}${c.city ? ' - ' + c.city : ''}</option>`).join('');
    select.dataset.loaded = '1';
  } catch (err) {
    console.error(err);
  }
}

async function loadPatientDocuments(phone) {
  const list = document.getElementById('documentsList');
  list.innerHTML = `<div class="empty-state">...</div>`;
  try {
    const docs = await api(`/clinic/patients/${phone}/documents`);
    if (docs.length === 0) {
      list.innerHTML = `<div class="empty-state">${t('noDocumentsFound')}</div>`;
      return;
    }
    list.innerHTML = '';
    docs.forEach(d => list.appendChild(renderDocumentRow(d)));
  } catch (err) {
    list.innerHTML = `<div class="empty-state">${err.message}</div>`;
  }
}

const SHARE_MODE_LABELS = {
  private: 'shareModePrivate',
  clinic: 'shareModeClinic',
  network: 'shareModeNetwork',
  patient: 'shareModePatient'
};

function renderDocumentRow(d) {
  const row = document.createElement('div');
  row.style.cssText = 'border:1.5px solid #EFEADE;border-radius:10px;padding:10px 12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;';
  const isMine = d.clinicId === clinic.id;
  row.innerHTML = `
    <div>
      <div style="font-weight:700;font-size:0.88rem;">${d.originalName}</div>
      <div style="font-size:0.78rem;color:var(--ink-muted);">
        ${isMine ? t('uploadedByYou') : d.uploaderClinicName} · ${t(SHARE_MODE_LABELS[d.sharingMode])}
        ${d.note ? ' · ' + d.note : ''}
      </div>
    </div>
    <div style="display:flex;gap:6px;"></div>
  `;
  const actions = row.querySelector('div:last-child');
  actions.appendChild(makeBtn(t('viewDoc'), 'btn-ghost', () => viewDocument(d.id)));
  if (isMine) {
    actions.appendChild(makeBtn(t('deleteDoc'), 'btn-ghost', () => deleteDocument(d.id)));
  }
  return row;
}

async function viewDocument(id) {
  try {
    const res = await fetch(`${API}/clinic/documents/${id}/file`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('تعذر تحميل الملف');
    const blob = await res.blob();
    window.open(URL.createObjectURL(blob), '_blank');
  } catch (err) {
    alert(err.message);
  }
}

async function deleteDocument(id) {
  if (!confirm(t('confirmDeleteDoc'))) return;
  try {
    await api(`/clinic/documents/${id}`, { method: 'DELETE' });
    loadPatientDocuments(currentHistoryPhone);
  } catch (err) {
    alert(err.message);
  }
}

async function uploadDocument() {
  const errEl = document.getElementById('docError');
  const successEl = document.getElementById('docSuccess');
  errEl.style.display = 'none';
  successEl.style.display = 'none';

  const file = document.getElementById('docFile').files[0];
  const sharingMode = document.getElementById('docSharingMode').value;
  const sharedWithClinicId = document.getElementById('docTargetClinic').value;
  const note = document.getElementById('docNote').value;

  if (!file) {
    errEl.textContent = t('chooseFileFirst');
    errEl.style.display = 'block';
    return;
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('sharingMode', sharingMode);
  if (sharingMode === 'clinic') formData.append('sharedWithClinicId', sharedWithClinicId);
  formData.append('note', note);

  try {
    const res = await fetch(`${API}/clinic/patients/${currentHistoryPhone}/documents`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'خطأ');
    successEl.style.display = 'block';
    document.getElementById('docFile').value = '';
    document.getElementById('docNote').value = '';
    setTimeout(() => successEl.style.display = 'none', 2500);
    loadPatientDocuments(currentHistoryPhone);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
}

function renderHistoryVisit(v, clinicName) {
  return `
    <div style="border:1.5px solid #EFEADE;border-radius:10px;padding:10px 12px;margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;">
        <span style="font-weight:700;">${formatDateTime(v.time)}</span>
        <span class="badge ${v.status}">${statusLabel(v.status)}</span>
      </div>
      ${clinicName ? `<div style="font-size:0.8rem;color:var(--indigo-deep);margin-top:4px;">🏥 ${clinicName}</div>` : ''}
      ${v.reason ? `<div style="font-size:0.82rem;margin-top:4px;">${t('reasonLabel')}: ${v.reason}</div>` : ''}
      ${v.notes ? `<div style="font-size:0.82rem;color:var(--ink-muted);margin-top:4px;">${t('notesLabel')}: ${v.notes}</div>` : ''}
    </div>
  `;
}

function formatDateTime(rawTime) {
  const [datePart, timePart] = rawTime.split('T');
  return `${datePart} ${(timePart || '').slice(0, 5)}`;
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
function dayLabel(key) {
  const map = {
    sun: 'daySun', mon: 'dayMon', tue: 'dayTue', wed: 'dayWed',
    thu: 'dayThu', fri: 'dayFri', sat: 'daySat'
  };
  return t(map[key]);
}

function renderWeeklySchedule(weeklyHours) {
  const container = document.getElementById('weeklyScheduleEditor');
  container.innerHTML = '';
  DAY_KEYS.forEach(key => {
    const day = weeklyHours[key] || { open: true, start: '08:00', end: '17:00' };
    const row = document.createElement('div');
    row.className = 'weekly-day-row' + (day.open ? '' : ' closed');
    row.dataset.day = key;
    row.innerHTML = `
      <span class="day-name">${dayLabel(key)}</span>
      <label class="open-toggle">
        <input type="checkbox" class="day-open" ${day.open ? 'checked' : ''}>
        <span data-i18n="dayOpen">مفتوح</span>
      </label>
      <input type="time" class="day-start" value="${day.start || '08:00'}" ${day.open ? '' : 'disabled'}>
      <span>—</span>
      <input type="time" class="day-end" value="${day.end || '17:00'}" ${day.open ? '' : 'disabled'}>
    `;
    const checkbox = row.querySelector('.day-open');
    const startInput = row.querySelector('.day-start');
    const endInput = row.querySelector('.day-end');
    checkbox.addEventListener('change', () => {
      const open = checkbox.checked;
      row.classList.toggle('closed', !open);
      startInput.disabled = !open;
      endInput.disabled = !open;
    });
    container.appendChild(row);
  });
}

function collectWeeklySchedule() {
  const weeklyHours = {};
  document.querySelectorAll('.weekly-day-row').forEach(row => {
    const key = row.dataset.day;
    const open = row.querySelector('.day-open').checked;
    if (open) {
      weeklyHours[key] = {
        open: true,
        start: row.querySelector('.day-start').value,
        end: row.querySelector('.day-end').value
      };
    } else {
      weeklyHours[key] = { open: false };
    }
  });
  return weeklyHours;
}

async function loadSettings() {
  try {
    const c = await api('/clinic/me');
    document.getElementById('setName').value = c.name;
    document.getElementById('setPhone').value = c.phone;
    document.getElementById('setSlotMinutes').value = c.slotMinutes;
    renderWeeklySchedule(c.weeklyHours);
    document.getElementById('setSpecialty').value = c.specialty || '';
    document.getElementById('setCity').value = c.city || '';
    document.getElementById('setRequirePayment').checked = !!c.requirePaymentProof;
    document.getElementById('setPaymentService').value = c.paymentServiceName || '';
    document.getElementById('setPaymentNumber').value = c.paymentNumber || '';
    document.getElementById('setPaymentInstructions').value = c.paymentInstructions || '';
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
        weeklyHours: collectWeeklySchedule(),
        slotMinutes: document.getElementById('setSlotMinutes').value,
        specialty: document.getElementById('setSpecialty').value,
        city: document.getElementById('setCity').value,
        requirePaymentProof: document.getElementById('setRequirePayment').checked,
        paymentServiceName: document.getElementById('setPaymentService').value,
        paymentNumber: document.getElementById('setPaymentNumber').value,
        paymentInstructions: document.getElementById('setPaymentInstructions').value
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
  if (token && clinic) {
    loadAppointments();
    loadBilling();
    loadAnalytics();
    loadSettings();
  } else {
    searchDirectory();
  }
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
  loadBilling();
  loadAnalytics();
}

if (token && clinic) {
  initDashboard();
} else {
  loadDirectoryFilters();
  searchDirectory();
}
