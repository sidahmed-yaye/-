const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_FILE = path.join(__dirname, 'data', 'db.json');

function defaultData() {
  return { clinics: [], patients: [], appointments: [] };
}

function readDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData(), null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function newId() {
  return crypto.randomBytes(8).toString('hex');
}

// ---- Clinics ----
function findClinicBySlug(slug) {
  return readDB().clinics.find(c => c.slug === slug);
}
function findClinicByUsername(username) {
  return readDB().clinics.find(c => c.username === username);
}
function createClinic(clinic) {
  const db = readDB();
  const record = { id: newId(), createdAt: new Date().toISOString(), ...clinic };
  db.clinics.push(record);
  writeDB(db);
  return record;
}

// ---- Patients ----
function findOrCreatePatient(clinicId, { name, phone }) {
  const db = readDB();
  let patient = db.patients.find(p => p.clinicId === clinicId && p.phone === phone);
  if (!patient) {
    patient = { id: newId(), clinicId, name, phone, createdAt: new Date().toISOString() };
    db.patients.push(patient);
    writeDB(db);
  } else if (name && patient.name !== name) {
    patient.name = name;
    writeDB(db);
  }
  return patient;
}

// ---- Appointments ----
function listAppointments(clinicId, { date } = {}) {
  const db = readDB();
  return db.appointments
    .filter(a => a.clinicId === clinicId && (!date || a.time.startsWith(date)))
    .sort((a, b) => a.time.localeCompare(b.time));
}

function createAppointment(appt) {
  const db = readDB();
  const record = {
    id: newId(),
    status: 'pending',
    reminderSent: false,
    createdAt: new Date().toISOString(),
    ...appt
  };
  db.appointments.push(record);
  writeDB(db);
  return record;
}

function updateAppointment(id, clinicId, updates) {
  const db = readDB();
  const idx = db.appointments.findIndex(a => a.id === id && a.clinicId === clinicId);
  if (idx === -1) return null;
  db.appointments[idx] = { ...db.appointments[idx], ...updates };
  writeDB(db);
  return db.appointments[idx];
}

function deleteAppointment(id, clinicId) {
  const db = readDB();
  const before = db.appointments.length;
  db.appointments = db.appointments.filter(a => !(a.id === id && a.clinicId === clinicId));
  writeDB(db);
  return db.appointments.length < before;
}

function findPatientById(id) {
  return readDB().patients.find(p => p.id === id);
}

function allDueReminders() {
  // appointments 23-25 hours away, not yet reminded, not cancelled
  const db = readDB();
  const now = Date.now();
  const from = now + 23 * 60 * 60 * 1000;
  const to = now + 25 * 60 * 60 * 1000;
  return db.appointments.filter(a => {
    const t = new Date(a.time).getTime();
    return !a.reminderSent && a.status !== 'cancelled' && t >= from && t <= to;
  });
}

module.exports = {
  readDB, writeDB, newId,
  findClinicBySlug, findClinicByUsername, createClinic,
  findOrCreatePatient, findPatientById,
  listAppointments, createAppointment, updateAppointment, deleteAppointment,
  allDueReminders
};
