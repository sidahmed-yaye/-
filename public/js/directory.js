const API = '/api/public';
let allFilters = { specialties: [], cities: [] };
let debounceTimer = null;

async function loadFilters() {
  try {
    const res = await fetch(`${API}/directory/filters`);
    allFilters = await res.json();
    const specSelect = document.getElementById('filterSpecialty');
    allFilters.specialties.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      specSelect.appendChild(opt);
    });
    const citySelect = document.getElementById('filterCity');
    allFilters.cities.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      citySelect.appendChild(opt);
    });
  } catch (err) {
    console.error(err);
  }
}

async function search() {
  const list = document.getElementById('resultsList');
  list.innerHTML = `<div class="empty-state">${t('loadingSlots')}</div>`;

  const query = document.getElementById('searchQuery').value.trim();
  const specialty = document.getElementById('filterSpecialty').value;
  const city = document.getElementById('filterCity').value;

  const params = new URLSearchParams();
  if (query) params.set('query', query);
  if (specialty) params.set('specialty', specialty);
  if (city) params.set('city', city);

  try {
    const res = await fetch(`${API}/directory?${params.toString()}`);
    const clinics = await res.json();
    if (clinics.length === 0) {
      list.innerHTML = `<div class="empty-state"><div class="icon">🔍</div>${t('noClinicsFound')}</div>`;
      return;
    }
    list.innerHTML = '';
    clinics.forEach(c => list.appendChild(renderClinicCard(c)));
  } catch (err) {
    list.innerHTML = `<div class="empty-state">${t('clinicNotFound')}</div>`;
  }
}

function renderClinicCard(c) {
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
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(search, 300);
});
document.getElementById('filterSpecialty').addEventListener('change', search);
document.getElementById('filterCity').addEventListener('change', search);

function onLangChange() {
  search();
}

loadFilters();
search();
