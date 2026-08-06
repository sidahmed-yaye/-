const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { toUTCDateForMath } = require('./utils');

const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'clinic.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS clinics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  passwordHash TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  workStart TEXT NOT NULL DEFAULT '08:00',
  workEnd TEXT NOT NULL DEFAULT '17:00',
  slotMinutes INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'active',
  trialEndsAt TEXT,
  duesAmount INTEGER NOT NULL DEFAULT 0,
  specialty TEXT DEFAULT '',
  city TEXT DEFAULT '',
  paymentServiceName TEXT DEFAULT '',
  paymentNumber TEXT DEFAULT '',
  paymentInstructions TEXT DEFAULT '',
  requirePaymentProof INTEGER NOT NULL DEFAULT 0,
  weeklyHours TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS global_patients (
  id TEXT PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  clinicId TEXT NOT NULL REFERENCES clinics(id),
  globalPatientId TEXT REFERENCES global_patients(id),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  UNIQUE(clinicId, phone)
);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  clinicId TEXT NOT NULL REFERENCES clinics(id),
  patientId TEXT NOT NULL REFERENCES patients(id),
  time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  source TEXT DEFAULT 'patient',
  reminderSent INTEGER NOT NULL DEFAULT 0,
  reminderSentAt TEXT,
  billed INTEGER NOT NULL DEFAULT 0,
  confirmedAt TEXT,
  statusUpdatedAt TEXT,
  sharedWithNetwork INTEGER NOT NULL DEFAULT 0,
  service TEXT DEFAULT '',
  paymentProofPath TEXT,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_appt_clinic_time ON appointments(clinicId, time);
CREATE INDEX IF NOT EXISTS idx_appt_clinic_status ON appointments(clinicId, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_appt_unique_slot
  ON appointments(clinicId, time)
  WHERE status NOT IN ('cancelled', 'rejected');

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  clinicId TEXT NOT NULL REFERENCES clinics(id),
  amount INTEGER NOT NULL,
  note TEXT DEFAULT '',
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_clinic ON payments(clinicId);

CREATE TABLE IF NOT EXISTS patient_documents (
  id TEXT PRIMARY KEY,
  globalPatientId TEXT NOT NULL REFERENCES global_patients(id),
  clinicId TEXT NOT NULL REFERENCES clinics(id),
  fileName TEXT NOT NULL,
  originalName TEXT NOT NULL,
  mimeType TEXT NOT NULL,
  sharingMode TEXT NOT NULL DEFAULT 'private',
  sharedWithClinicId TEXT REFERENCES clinics(id),
  patientShareToken TEXT,
  note TEXT DEFAULT '',
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_docs_patient ON patient_documents(globalPatientId);
CREATE INDEX IF NOT EXISTS idx_docs_share_token ON patient_documents(patientShareToken);
`);

// ترحيل آمن: يضيف الأعمدة الجديدة لقواعد بيانات منشورة سابقاً بدون أن يفشل إن كانت موجودة أصلاً
function tryAlter(sql) {
  try { db.exec(sql); } catch (e) { /* العمود موجود مسبقاً على الأرجح */ }
}
tryAlter("ALTER TABLE clinics ADD COLUMN specialty TEXT DEFAULT ''");
tryAlter("ALTER TABLE clinics ADD COLUMN city TEXT DEFAULT ''");
tryAlter("ALTER TABLE patients ADD COLUMN globalPatientId TEXT REFERENCES global_patients(id)");
tryAlter("ALTER TABLE appointments ADD COLUMN sharedWithNetwork INTEGER NOT NULL DEFAULT 0");
tryAlter("ALTER TABLE appointments ADD COLUMN service TEXT DEFAULT ''");
tryAlter("ALTER TABLE appointments ADD COLUMN paymentProofPath TEXT");
tryAlter("ALTER TABLE clinics ADD COLUMN requirePaymentProof INTEGER NOT NULL DEFAULT 0");
tryAlter("ALTER TABLE clinics ADD COLUMN weeklyHours TEXT");

// ---- الدليل العام للعيادات ----
function searchClinics({ query, specialty, city } = {}) {
  let sql = `SELECT id, name, slug, phone, specialty, city, workStart, workEnd FROM clinics WHERE status = 'active'`;
  const params = [];
  if (query) {
    sql += ` AND name LIKE ?`;
    params.push(`%${query}%`);
  }
  if (specialty) {
    sql += ` AND specialty = ?`;
    params.push(specialty);
  }
  if (city) {
    sql += ` AND city = ?`;
    params.push(city);
  }
  sql += ` ORDER BY name ASC`;
  return db.prepare(sql).all(...params);
}

function listSpecialties() {
  return db.prepare(`
    SELECT DISTINCT specialty FROM clinics
    WHERE status = 'active' AND specialty IS NOT NULL AND specialty != ''
    ORDER BY specialty
  `).all().map(r => r.specialty);
}

function listCities() {
  return db.prepare(`
    SELECT DISTINCT city FROM clinics
    WHERE status = 'active' AND city IS NOT NULL AND city != ''
    ORDER BY city
  `).all().map(r => r.city);
}

function newId() {
  return crypto.randomBytes(8).toString('hex');
}

function rowToAppt(row) {
  if (!row) return row;
  return { ...row, reminderSent: !!row.reminderSent, billed: !!row.billed, sharedWithNetwork: !!row.sharedWithNetwork };
}

// ---- Clinics ----
function findClinicBySlug(slug) {
  return db.prepare('SELECT * FROM clinics WHERE slug = ?').get(slug);
}
function findClinicByUsername(username) {
  return db.prepare('SELECT * FROM clinics WHERE username = ?').get(username);
}
function findClinicById(id) {
  return db.prepare('SELECT * FROM clinics WHERE id = ?').get(id);
}
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function defaultWeeklyHours(workStart, workEnd) {
  const hours = {};
  DAY_KEYS.forEach(d => {
    hours[d] = { open: true, start: workStart, end: workEnd };
  });
  return hours;
}

function parseWeeklyHours(clinic) {
  if (!clinic) return clinic;
  let weeklyHours;
  try {
    weeklyHours = clinic.weeklyHours ? JSON.parse(clinic.weeklyHours) : defaultWeeklyHours(clinic.workStart, clinic.workEnd);
  } catch (e) {
    weeklyHours = defaultWeeklyHours(clinic.workStart, clinic.workEnd);
  }
  return { ...clinic, weeklyHours };
}

function createClinic(clinic) {
  const id = newId();
  const createdAt = new Date().toISOString();
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const workStart = clinic.workStart || '08:00';
  const workEnd = clinic.workEnd || '17:00';
  const weeklyHours = JSON.stringify(defaultWeeklyHours(workStart, workEnd));
  db.prepare(`
    INSERT INTO clinics (id, name, phone, username, passwordHash, slug, workStart, workEnd, slotMinutes, status, trialEndsAt, specialty, city, weeklyHours, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
  `).run(
    id,
    clinic.name,
    clinic.phone,
    clinic.username,
    clinic.passwordHash,
    clinic.slug,
    workStart,
    workEnd,
    clinic.slotMinutes || 30,
    trialEndsAt,
    clinic.specialty || '',
    clinic.city || '',
    weeklyHours,
    createdAt
  );
  return findClinicById(id);
}
function updateClinic(id, updates) {
  const existing = findClinicById(id);
  if (!existing) return null;
  const allowed = ['name', 'phone', 'workStart', 'workEnd', 'slotMinutes', 'status', 'specialty', 'city', 'paymentServiceName', 'paymentNumber', 'paymentInstructions', 'requirePaymentProof'];
  const merged = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      merged[key] = key === 'requirePaymentProof' ? (updates[key] ? 1 : 0) : updates[key];
    } else {
      merged[key] = existing[key];
    }
  }
  let weeklyHoursJson = existing.weeklyHours;
  if (updates.weeklyHours !== undefined) {
    weeklyHoursJson = JSON.stringify(updates.weeklyHours);
  }
  db.prepare(`
    UPDATE clinics SET name=?, phone=?, workStart=?, workEnd=?,
      slotMinutes=?, status=?, specialty=?, city=?, paymentServiceName=?,
      paymentNumber=?, paymentInstructions=?, requirePaymentProof=?, weeklyHours=?
    WHERE id=?
  `).run(
    merged.name, merged.phone, merged.workStart, merged.workEnd,
    merged.slotMinutes, merged.status, merged.specialty, merged.city, merged.paymentServiceName,
    merged.paymentNumber, merged.paymentInstructions, merged.requirePaymentProof, weeklyHoursJson, id
  );
  return findClinicById(id);
}

// ---- الهوية الدائمة للمريض (تُربط بكل عيادات المنصة عبر رقم الهاتف) ----
function findOrCreateGlobalPatient(phone, name) {
  let gp = db.prepare('SELECT * FROM global_patients WHERE phone = ?').get(phone);
  if (!gp) {
    const id = newId();
    db.prepare('INSERT INTO global_patients (id, phone, name, createdAt) VALUES (?, ?, ?, ?)')
      .run(id, phone, name, new Date().toISOString());
    gp = db.prepare('SELECT * FROM global_patients WHERE id = ?').get(id);
  }
  return gp;
}

// ---- Patients ----
function findOrCreatePatient(clinicId, { name, phone }) {
  let patient = db.prepare('SELECT * FROM patients WHERE clinicId = ? AND phone = ?').get(clinicId, phone);
  const globalPatient = findOrCreateGlobalPatient(phone, name);
  if (!patient) {
    const id = newId();
    db.prepare('INSERT INTO patients (id, clinicId, globalPatientId, name, phone, createdAt) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, clinicId, globalPatient.id, name, phone, new Date().toISOString());
    patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(id);
  } else if (name && patient.name !== name) {
    db.prepare('UPDATE patients SET name = ?, globalPatientId = ? WHERE id = ?').run(name, globalPatient.id, patient.id);
    patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(patient.id);
  } else if (!patient.globalPatientId) {
    db.prepare('UPDATE patients SET globalPatientId = ? WHERE id = ?').run(globalPatient.id, patient.id);
    patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(patient.id);
  }
  return patient;
}
function findPatientById(id) {
  return db.prepare('SELECT * FROM patients WHERE id = ?').get(id);
}

// سجل المريض عبر الشبكة: زيارات هذه العيادة كاملة دائماً + زيارات عيادات أخرى فقط إن سمحت هي بمشاركتها
function getPatientHistory(clinicId, phone) {
  const globalPatient = db.prepare('SELECT * FROM global_patients WHERE phone = ?').get(phone);
  if (!globalPatient) return { isReturning: false, ownVisits: [], networkVisits: [] };

  const ownVisits = db.prepare(`
    SELECT a.* FROM appointments a
    JOIN patients p ON p.id = a.patientId
    WHERE p.globalPatientId = ? AND a.clinicId = ?
    ORDER BY a.time DESC
  `).all(globalPatient.id, clinicId).map(rowToAppt);

  const networkVisits = db.prepare(`
    SELECT a.*, c.name AS clinicName FROM appointments a
    JOIN patients p ON p.id = a.patientId
    JOIN clinics c ON c.id = a.clinicId
    WHERE p.globalPatientId = ? AND a.clinicId != ? AND a.sharedWithNetwork = 1
    ORDER BY a.time DESC
  `).all(globalPatient.id, clinicId).map(rowToAppt);

  return {
    isReturning: ownVisits.length > 0 || networkVisits.length > 0,
    patientName: globalPatient.name,
    ownVisits,
    networkVisits
  };
}

// ---- ملفات ووثائق المريض (يرفعها الطبيب، مع تحكم كامل بالمشاركة) ----
function addPatientDocument({ globalPatientId, clinicId, fileName, originalName, mimeType, sharingMode, sharedWithClinicId, note }) {
  const id = newId();
  const patientShareToken = sharingMode === 'patient' ? crypto.randomBytes(24).toString('hex') : null;
  db.prepare(`
    INSERT INTO patient_documents (id, globalPatientId, clinicId, fileName, originalName, mimeType, sharingMode, sharedWithClinicId, patientShareToken, note, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, globalPatientId, clinicId, fileName, originalName, mimeType,
    sharingMode, sharedWithClinicId || null, patientShareToken, note || '',
    new Date().toISOString()
  );
  return db.prepare('SELECT * FROM patient_documents WHERE id = ?').get(id);
}

// المستندات المرئية لهذه العيادة: رفعتها هي بنفسها، أو مشارَكة معها تحديداً، أو مشارَكة مع الجميع
function listPatientDocuments(clinicId, phone) {
  const globalPatient = db.prepare('SELECT * FROM global_patients WHERE phone = ?').get(phone);
  if (!globalPatient) return [];
  return db.prepare(`
    SELECT d.*, c.name AS uploaderClinicName FROM patient_documents d
    JOIN clinics c ON c.id = d.clinicId
    WHERE d.globalPatientId = ?
      AND (
        d.clinicId = ?
        OR d.sharingMode = 'network'
        OR (d.sharingMode = 'clinic' AND d.sharedWithClinicId = ?)
      )
    ORDER BY d.createdAt DESC
  `).all(globalPatient.id, clinicId, clinicId);
}

function findDocumentById(id) {
  return db.prepare('SELECT * FROM patient_documents WHERE id = ?').get(id);
}

function findDocumentByShareToken(token) {
  return db.prepare('SELECT * FROM patient_documents WHERE patientShareToken = ?').get(token);
}

// هل يحق لهذه العيادة رؤية هذا المستند تحديداً؟ (نفس قواعد الرؤية أعلاه لكن لمستند واحد)
function canClinicAccessDocument(clinicId, doc) {
  if (!doc) return false;
  if (doc.clinicId === clinicId) return true;
  if (doc.sharingMode === 'network') return true;
  if (doc.sharingMode === 'clinic' && doc.sharedWithClinicId === clinicId) return true;
  return false;
}

function deletePatientDocument(id, clinicId) {
  const result = db.prepare('DELETE FROM patient_documents WHERE id = ? AND clinicId = ?').run(id, clinicId);
  return result.changes > 0;
}

function listOtherActiveClinics(excludeClinicId) {
  return db.prepare(`
    SELECT id, name, specialty, city FROM clinics
    WHERE status = 'active' AND id != ?
    ORDER BY name ASC
  `).all(excludeClinicId);
}

// ---- Appointments ----
function listAppointments(clinicId, { date } = {}) {
  let rows;
  if (date) {
    rows = db.prepare(`
      SELECT * FROM appointments WHERE clinicId = ? AND time LIKE ? ORDER BY time ASC
    `).all(clinicId, `${date}%`);
  } else {
    rows = db.prepare('SELECT * FROM appointments WHERE clinicId = ? ORDER BY time ASC').all(clinicId);
  }
  return rows.map(rowToAppt);
}

function createAppointment(appt) {
  const id = newId();
  const createdAt = new Date().toISOString();
  const status = appt.status || 'pending';
  const confirmedAt = status === 'confirmed' ? createdAt : null;
  try {
    db.prepare(`
      INSERT INTO appointments (id, clinicId, patientId, time, status, reason, notes, source, reminderSent, confirmedAt, statusUpdatedAt, service, paymentProofPath, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
    `).run(
      id,
      appt.clinicId,
      appt.patientId,
      appt.time,
      status,
      appt.reason || '',
      appt.notes || '',
      appt.source || 'patient',
      confirmedAt,
      createdAt,
      appt.service || '',
      appt.paymentProofPath || null,
      createdAt
    );
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE/.test(e.message)) {
      const err = new Error('هذا الموعد محجوز بالفعل، يرجى اختيار وقت آخر');
      err.code = 'SLOT_TAKEN';
      throw err;
    }
    throw e;
  }
  return rowToAppt(db.prepare('SELECT * FROM appointments WHERE id = ?').get(id));
}

function updateAppointment(id, clinicId, updates) {
  const existing = db.prepare('SELECT * FROM appointments WHERE id = ? AND clinicId = ?').get(id, clinicId);
  if (!existing) return null;
  const allowed = ['status', 'time', 'notes', 'reason', 'reminderSent', 'reminderSentAt', 'sharedWithNetwork', 'service'];
  const merged = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      merged[key] = (key === 'reminderSent' || key === 'sharedWithNetwork') ? (updates[key] ? 1 : 0) : updates[key];
    } else {
      merged[key] = existing[key];
    }
  }
  merged.confirmedAt = existing.confirmedAt;
  merged.statusUpdatedAt = existing.statusUpdatedAt;
  if (updates.status === 'confirmed' && existing.status !== 'confirmed') {
    merged.confirmedAt = new Date().toISOString();
  }
  if (updates.status && updates.status !== existing.status) {
    merged.statusUpdatedAt = new Date().toISOString();
  }
  try {
    db.prepare(`
      UPDATE appointments SET status=?, time=?, notes=?, reason=?,
        reminderSent=?, reminderSentAt=?, confirmedAt=?, statusUpdatedAt=?, sharedWithNetwork=?, service=?
      WHERE id=? AND clinicId=?
    `).run(
      merged.status, merged.time, merged.notes, merged.reason,
      merged.reminderSent, merged.reminderSentAt, merged.confirmedAt, merged.statusUpdatedAt, merged.sharedWithNetwork, merged.service,
      id, clinicId
    );
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE/.test(e.message)) {
      const err = new Error('هذا الموعد الجديد محجوز بالفعل، يرجى اختيار وقت آخر');
      err.code = 'SLOT_TAKEN';
      throw err;
    }
    throw e;
  }
  return rowToAppt(db.prepare('SELECT * FROM appointments WHERE id = ?').get(id));
}

function clearPaymentProof(id) {
  db.prepare('UPDATE appointments SET paymentProofPath = NULL WHERE id = ?').run(id);
}

function deleteAppointment(id, clinicId) {
  const result = db.prepare('DELETE FROM appointments WHERE id = ? AND clinicId = ?').run(id, clinicId);
  return result.changes > 0;
}

// ---- الفوترة: 10 أوقية لكل حجز مؤكد بعد انتهاء الفترة المجانية ----
const CHARGE_PER_CONFIRMED_BOOKING = 10;

function chargeIfDue(appointmentId) {
  const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(appointmentId);
  if (!appt || appt.billed) return;
  const clinic = findClinicById(appt.clinicId);
  if (!clinic) return;
  const trialEnded = clinic.trialEndsAt && new Date(clinic.trialEndsAt).getTime() < Date.now();
  if (!trialEnded) return;
  db.prepare('UPDATE clinics SET duesAmount = duesAmount + ? WHERE id = ?')
    .run(CHARGE_PER_CONFIRMED_BOOKING, clinic.id);
  db.prepare('UPDATE appointments SET billed = 1 WHERE id = ?').run(appointmentId);
}

function getClinicBilling(clinicId) {
  const clinic = findClinicById(clinicId);
  if (!clinic) return null;
  const today = new Date().toISOString().slice(0, 10);

  const todayConfirmed = db.prepare(`
    SELECT COUNT(*) AS n FROM appointments
    WHERE clinicId = ? AND confirmedAt IS NOT NULL AND confirmedAt LIKE ?
  `).get(clinicId, `${today}%`).n;

  const todayBilled = db.prepare(`
    SELECT COUNT(*) AS n FROM appointments
    WHERE clinicId = ? AND billed = 1 AND confirmedAt LIKE ?
  `).get(clinicId, `${today}%`).n;

  const trialActive = clinic.trialEndsAt && new Date(clinic.trialEndsAt).getTime() > Date.now();

  return {
    trialEndsAt: clinic.trialEndsAt,
    trialActive,
    todayConfirmedCount: todayConfirmed,
    todayAmountDue: todayBilled * CHARGE_PER_CONFIRMED_BOOKING,
    totalDues: clinic.duesAmount,
    chargePerBooking: CHARGE_PER_CONFIRMED_BOOKING
  };
}

function getClinicAnalytics(clinicId) {
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const startOfMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  function summaryFor(since) {
    const confirmed = db.prepare(`
      SELECT COUNT(*) AS n FROM appointments WHERE clinicId = ? AND confirmedAt IS NOT NULL AND confirmedAt >= ?
    `).get(clinicId, since).n;
    const rejected = db.prepare(`
      SELECT COUNT(*) AS n FROM appointments WHERE clinicId = ? AND status = 'rejected' AND statusUpdatedAt >= ?
    `).get(clinicId, since).n;
    const completed = db.prepare(`
      SELECT COUNT(*) AS n FROM appointments WHERE clinicId = ? AND status = 'completed' AND statusUpdatedAt >= ?
    `).get(clinicId, since).n;
    const newPatients = db.prepare(`
      SELECT COUNT(*) AS n FROM patients WHERE clinicId = ? AND createdAt >= ?
    `).get(clinicId, since).n;
    const earnings = db.prepare(`
      SELECT COUNT(*) AS n FROM appointments WHERE clinicId = ? AND billed = 1 AND confirmedAt >= ?
    `).get(clinicId, since).n * CHARGE_PER_CONFIRMED_BOOKING;
    return { confirmed, rejected, completed, newPatients, earnings };
  }

  // اتجاه آخر 7 أيام (لرسم بياني بسيط) — عدد الحجوزات المؤكدة يومياً
  const trend = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const count = db.prepare(`
      SELECT COUNT(*) AS n FROM appointments
      WHERE clinicId = ? AND confirmedAt IS NOT NULL AND confirmedAt >= ? AND confirmedAt < ?
    `).get(clinicId, dayStart.toISOString(), dayEnd.toISOString()).n;
    trend.push({ date: dayStart.toISOString().slice(0, 10), confirmed: count });
  }

  return {
    day: summaryFor(startOfDay),
    week: summaryFor(startOfWeek),
    month: summaryFor(startOfMonth),
    trend
  };
}

// ---- Payments (سجل تدقيق لعمليات تسوية المستحقات) ----
function recordPayment(clinicId, amount, note) {
  db.prepare('INSERT INTO payments (id, clinicId, amount, note, createdAt) VALUES (?, ?, ?, ?, ?)')
    .run(newId(), clinicId, amount, note || '', new Date().toISOString());
}

function listPayments(limit = 100) {
  return db.prepare(`
    SELECT payments.*, clinics.name AS clinicName
    FROM payments JOIN clinics ON clinics.id = payments.clinicId
    ORDER BY payments.createdAt DESC
    LIMIT ?
  `).all(limit);
}

// ---- Admin ----
function listAllClinics() {
  const clinics = db.prepare('SELECT * FROM clinics ORDER BY createdAt DESC').all();
  const countStmt = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending
    FROM appointments WHERE clinicId = ?
  `);
  return clinics.map(c => {
    const { passwordHash, ...safe } = c;
    const stats = countStmt.get(c.id);
    return {
      ...safe,
      appointmentStats: {
        total: stats.total || 0,
        confirmed: stats.confirmed || 0,
        pending: stats.pending || 0
      }
    };
  });
}

function setClinicStatus(id, status) {
  const existing = findClinicById(id);
  if (!existing) return null;
  db.prepare('UPDATE clinics SET status = ? WHERE id = ?').run(status, id);
  return findClinicById(id);
}

function setClinicDues(id, amount, note) {
  const existing = findClinicById(id);
  if (!existing) return null;
  const delta = existing.duesAmount - amount;
  db.prepare('UPDATE clinics SET duesAmount = ? WHERE id = ?').run(amount, id);
  if (delta > 0) {
    recordPayment(id, delta, note || 'دفعة مستلمة');
  } else if (delta < 0) {
    recordPayment(id, delta, note || 'تعديل يدوي من الإدارة');
  }
  return findClinicById(id);
}

function allDueReminders() {
  const now = Date.now();
  const from = new Date(now + 23 * 60 * 60 * 1000);
  const to = new Date(now + 25 * 60 * 60 * 1000);
  // نجلب المواعيد غير الملغاة/المرفوضة التي لم يُرسَل لها تذكير بعد، ونُصفّي بدقة بالحساب الزمني الآمن
  const candidates = db.prepare(`
    SELECT * FROM appointments
    WHERE reminderSent = 0 AND status NOT IN ('cancelled', 'rejected')
  `).all();
  return candidates
    .map(rowToAppt)
    .filter(a => {
      const t = toUTCDateForMath(a.time).getTime();
      return t >= from.getTime() && t <= to.getTime();
    });
}

module.exports = {
  newId,
  findClinicBySlug, findClinicByUsername, findClinicById, createClinic, updateClinic,
  findOrCreatePatient, findPatientById, getPatientHistory, findOrCreateGlobalPatient,
  addPatientDocument, listPatientDocuments, findDocumentById, findDocumentByShareToken,
  canClinicAccessDocument, deletePatientDocument, listOtherActiveClinics,
  listAppointments, createAppointment, updateAppointment, deleteAppointment, clearPaymentProof,
  allDueReminders, chargeIfDue, getClinicBilling, getClinicAnalytics,
  listAllClinics, setClinicStatus, setClinicDues,
  recordPayment, listPayments,
  searchClinics, listSpecialties, listCities,
  parseWeeklyHours
};
