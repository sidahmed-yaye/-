const API = '/api/public';
const params = new URLSearchParams(location.search);
const slug = params.get('clinic');
let selectedSlot = null;
let clinicData = null;

async function loadClinic() {
  if (!slug) {
    document.getElementById('clinicName').textContent = t('invalidLink');
    document.getElementById('bookingCard').classList.add('hidden');
    return;
  }
  try {
    const res = await fetch(`${API}/${slug}`);
    if (!res.ok) throw new Error('not found');
    clinicData = await res.json();
    document.getElementById('clinicName').textContent = clinicData.name;
    document.getElementById('clinicPhone').textContent = clinicData.phone;

    if (clinicData.requirePaymentProof) {
      document.getElementById('paymentSection').classList.remove('hidden');
      document.getElementById('payServiceName').textContent = clinicData.paymentServiceName || '—';
      document.getElementById('payNumber').textContent = clinicData.paymentNumber || '—';
      document.getElementById('payInstructions').textContent = clinicData.paymentInstructions || '';
    }

    const dateInput = document.getElementById('pDate');
    const today = new Date().toISOString().slice(0, 10);
    dateInput.min = today;
    dateInput.value = today;
    dateInput.addEventListener('change', loadSlots);
    loadSlots();
  } catch (err) {
    document.getElementById('clinicName').textContent = t('clinicNotFound');
    document.getElementById('bookingCard').classList.add('hidden');
  }
}

function displayTime(rawTime) {
  return (rawTime.split('T')[1] || '').slice(0, 5);
}

async function loadSlots() {
  const date = document.getElementById('pDate').value;
  const grid = document.getElementById('slotsGrid');
  grid.innerHTML = `<div class="empty-state">${t('loadingSlots')}</div>`;
  selectedSlot = null;
  document.getElementById('confirmBtn').disabled = true;

  try {
    const res = await fetch(`${API}/${slug}/slots?date=${date}`);
    const data = await res.json();
    if (!data.slots || data.slots.length === 0) {
      grid.innerHTML = `<div class="empty-state">${t('noSlots')}</div>`;
      return;
    }
    grid.innerHTML = '';
    data.slots.forEach(s => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'slot-btn';
      btn.textContent = displayTime(s);
      btn.onclick = () => {
        document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedSlot = s;
        document.getElementById('confirmBtn').disabled = false;
      };
      grid.appendChild(btn);
    });
  } catch (err) {
    grid.innerHTML = `<div class="empty-state">${t('noSlots')}</div>`;
  }
}

async function confirmBooking() {
  const errEl = document.getElementById('bookError');
  errEl.style.display = 'none';
  const name = document.getElementById('pName').value.trim();
  const phone = document.getElementById('pPhone').value.trim();
  const reason = document.getElementById('pReason').value.trim();
  const service = document.getElementById('pService').value.trim();

  if (!name || !phone || !selectedSlot) {
    errEl.textContent = t('fillRequired');
    errEl.style.display = 'block';
    return;
  }

  const requiresPayment = clinicData && clinicData.requirePaymentProof;
  const proofFile = requiresPayment ? document.getElementById('pProofFile').files[0] : null;

  if (requiresPayment && !proofFile) {
    errEl.textContent = t('uploadProofLabel');
    errEl.style.display = 'block';
    return;
  }

  try {
    let res;
    if (requiresPayment) {
      const formData = new FormData();
      formData.append('patientName', name);
      formData.append('patientPhone', phone);
      formData.append('time', selectedSlot);
      formData.append('reason', reason);
      formData.append('service', service);
      formData.append('paymentProof', proofFile);
      res = await fetch(`${API}/${slug}/book-with-payment`, { method: 'POST', body: formData });
    } else {
      res = await fetch(`${API}/${slug}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientName: name, patientPhone: phone, time: selectedSlot, reason, service })
      });
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'error');
    document.getElementById('bookingCard').classList.add('hidden');
    document.getElementById('successCard').classList.remove('hidden');
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
}

function onLangChange() {}

loadClinic();
