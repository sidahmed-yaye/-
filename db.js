const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { toUTCDateForMath } = require('./utils');

const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'clinic.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

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
  paymentServiceName TEXT DEFAULT '',
  paymentNumber TEXT DEFAULT '',
  paymentInstructions TEXT DEFAULT '',
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  clinicId TEXT NOT NULL REFERENCES clinics(id),
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
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_appt_clinic_time ON appointments(clinicId, time);
CREATE INDEX IF NOT EXISTS idx_appt_clinic_status ON appointments(clinicId, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_appt_unique_slot
  ON appointments(clinicId, time)
  WHERE status NOT IN ('cancelled', 'rejected');
`);

function newId() {
  return crypto.randomBytes(8).toString('hex');
}

function rowToAppt(row) {
  if (!row) return row;
  return { ...row, reminderSent: !!row.reminderSent, billed: !!row.billed };
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
function createClinic(clinic) {
  const id = newId();
  const createdAt = new Date().toISOString();
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT INTO clinics (id, name, phone, username, passwordHash, slug, workStart, workEnd, slotMinutes, status, trialEndsAt, createdAt)
    VALUES (@id, @name, @phone, @username, @passwordHash, @slug, @workStart, @workEnd, @slotMinutes, 'active', @trialEndsAt, @createdAt)
  `).run({
    id,
    name: clinic.name,
    phone: clinic.phone,
    username: clinic.username,
    passwordHash: clinic.passwordHash,
    slug: clinic.slug,
    workStart: clinic.workStart || '08:00',
    workEnd: clinic.workEnd || '17:00',
    slotMinutes: clinic.slotMinutes || 30,
    trialEndsAt,
    createdAt
  });
  return findClinicById(id);
}
function updateClinic(id, updates) {
  const existing = findClinicById(id);
  if (!existing) return null;
  const allowed = ['name', 'phone', 'workStart', 'workEnd', 'slotMinutes', 'status', 'paymentServiceName', 'paymentNumber', 'paymentInstructions'];
  const merged = { ...existing };
  for (const key of allowed) {
    if (updates[key] !== undefined) merged[key] = updates[key];
  }
  db.prepare(`
    UPDATE clinics SET name=@name, phone=@phone, workStart=@workStart, workEnd=@workEnd,
      slotMinutes=@slotMinutes, status=@status, paymentServiceName=@paymentServiceName,
      paymentNumber=@paymentNumber, paymentInstructions=@paymentInstructions
    WHERE id=@id
  `).run(merged);
  return findClinicById(id);
}

// ---- Patients ----
function findOrCreatePatient(clinicId, { name, phone }) {
  let patient = db.prepare('SELECT * FROM patients WHERE clinicId = ? AND phone = ?').get(clinicId, phone);
  if (!patient) {
    const id = newId();
    db.prepare('INSERT INTO patients (id, clinicId, name, phone, createdAt) VALUES (?, ?, ?, ?, ?)')
      .run(id, clinicId, name, phone, new Date().toISOString());
    patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(id);
  } else if (name && patient.name !== name) {
    db.prepare('UPDATE patients SET name = ? WHERE id = ?').run(name, patient.id);
    patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(patient.id);
  }
  return patient;
}
function findPatientById(id) {
  return db.prepare('SELECT * FROM patients WHERE id = ?').get(id);
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
  try {
    db.prepare(`
      INSERT INTO appointments (id, clinicId, patientId, time, status, reason, notes, source, reminderSent, createdAt)
      VALUES (@id, @clinicId, @patientId, @time, @status, @reason, @notes, @source, 0, @createdAt)
    `).run({
      id,
      clinicId: appt.clinicId,
      patientId: appt.patientId,
      time: appt.time,
      status: appt.status || 'pending',
      reason: appt.reason || '',
      notes: appt.notes || '',
      source: appt.source || 'patient',
      createdAt
    });
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
  const allowed = ['status', 'time', 'notes', 'reason', 'reminderSent', 'reminderSentAt'];
  const merged = { ...existing };
  for (const key of allowed) {
    if (updates[key] !== undefined) merged[key] = key === 'reminderSent' ? (updates[key] ? 1 : 0) : updates[key];
  }
  try {
    db.prepare(`
      UPDATE appointments SET status=@status, time=@time, notes=@notes, reason=@reason,
        reminderSent=@reminderSent, reminderSentAt=@reminderSentAt
      WHERE id=@id AND clinicId=@clinicId
    `).run(merged);
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

function setClinicDues(id, amount) {
  const existing = findClinicById(id);
  if (!existing) return null;
  db.prepare('UPDATE clinics SET duesAmount = ? WHERE id = ?').run(amount, id);
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
  findOrCreatePatient, findPatientById,
  listAppointments, createAppointment, updateAppointment, deleteAppointment,
  allDueReminders, chargeIfDue,
  listAllClinics, setClinicStatus, setClinicDues
};
