const API = '/api/admin';
let adminToken = localStorage.getItem('adminToken');

async function adminApi(path, opts = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (adminToken) headers['Authorization'] = 'Bearer ' + adminToken;
  const res = await fetch(API + path, { ...opts, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'حدث خطأ');
  return data;
}

document.getElementById('adminLoginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const errEl = document.getElementById('adminLoginError');
  errEl.style.display = 'none';
  try {
    const data = await adminApi('/login', {
      method: 'POST',
      body: JSON.stringify({
        username: document.getElementById('adminUsername').value,
        password: document.getElementById('adminPassword').value
      })
    });
    adminToken = data.token;
    localStorage.setItem('adminToken', adminToken);
    initAdminDash();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
});

function adminLogout() {
  localStorage.removeItem('adminToken');
  location.reload();
}

function daysLeft(trialEndsAt) {
  if (!trialEndsAt) return null;
  const diff = new Date(trialEndsAt).getTime() - Date.now();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

async function loadClinics() {
  const tbody = document.getElementById('clinicsTableBody');
  tbody.innerHTML = '<tr><td colspan="6">جارِ التحميل...</td></tr>';
  try {
    const clinics = await adminApi('/clinics');
    document.getElementById('statClinicsTotal').textContent = clinics.length;
    document.getElementById('statClinicsActive').textContent = clinics.filter(c => c.status === 'active').length;
    document.getElementById('statDuesTotal').textContent = clinics.reduce((sum, c) => sum + (c.duesAmount || 0), 0);

    if (clinics.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6">لا توجد عيادات مسجّلة بعد</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    clinics.forEach(c => tbody.appendChild(renderClinicRow(c)));
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6">${err.message}</td></tr>`;
  }
}

function renderClinicRow(c) {
  const tr = document.createElement('tr');
  const left = daysLeft(c.trialEndsAt);
  const trialText = left === null ? '—' : (left > 0 ? `${left} يوم متبقي` : 'انتهت');

  tr.innerHTML = `
    <td>
      <div style="font-weight:700;">${c.name}</div>
      <div style="font-size:0.78rem;color:var(--ink-muted);">${c.phone} · @${c.username}</div>
    </td>
    <td><span class="status-pill ${c.status}">${c.status === 'active' ? 'نشطة' : 'معطّلة'}</span></td>
    <td>${trialText}</td>
    <td>${c.appointmentStats.confirmed} مؤكد / ${c.appointmentStats.pending} قيد الانتظار</td>
    <td><input type="number" class="dues-input" value="${c.duesAmount}" min="0" data-clinic-id="${c.id}"></td>
    <td class="row-actions"></td>
  `;

  const actionsCell = tr.querySelector('.row-actions');

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'btn btn-small ' + (c.status === 'active' ? 'btn-ghost' : 'btn-accent');
  toggleBtn.textContent = c.status === 'active' ? 'تعطيل' : 'تفعيل';
  toggleBtn.onclick = () => toggleClinicStatus(c.id, c.status === 'active' ? 'disabled' : 'active');
  actionsCell.appendChild(toggleBtn);

  const saveDuesBtn = document.createElement('button');
  saveDuesBtn.className = 'btn btn-small btn-primary';
  saveDuesBtn.style.marginRight = '6px';
  saveDuesBtn.textContent = 'حفظ المبلغ';
  saveDuesBtn.onclick = () => {
    const input = tr.querySelector('.dues-input');
    saveDues(c.id, input.value);
  };
  actionsCell.appendChild(saveDuesBtn);

  const resetDuesBtn = document.createElement('button');
  resetDuesBtn.className = 'btn btn-small btn-ghost';
  resetDuesBtn.style.marginRight = '6px';
  resetDuesBtn.textContent = 'تصفير (تم الدفع)';
  resetDuesBtn.onclick = () => {
    if (confirm(`تأكيد استلام الدفع وتصفير مستحقات "${c.name}"؟`)) {
      saveDues(c.id, 0);
    }
  };
  actionsCell.appendChild(resetDuesBtn);

  return tr;
}

async function toggleClinicStatus(id, newStatus) {
  try {
    await adminApi(`/clinics/${id}/status`, { method: 'PUT', body: JSON.stringify({ status: newStatus }) });
    loadClinics();
  } catch (err) {
    alert(err.message);
  }
}

async function saveDues(id, amount) {
  try {
    await adminApi(`/clinics/${id}/dues`, { method: 'PUT', body: JSON.stringify({ amount }) });
    loadClinics();
  } catch (err) {
    alert(err.message);
  }
}

function initAdminDash() {
  document.getElementById('adminAuthView').classList.add('hidden');
  document.getElementById('adminDashView').classList.remove('hidden');
  loadClinics();
}

if (adminToken) initAdminDash();
