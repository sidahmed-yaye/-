const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/:slug', (req, res) => {
  const clinic = db.findClinicBySlug(req.params.slug);
  if (!clinic) return res.status(404).json({ error: 'العيادة غير موجودة' });
  res.json({
    name: clinic.name,
    slug: clinic.slug,
    phone: clinic.phone,
    workStart: clinic.workStart,
    workEnd: clinic.workEnd,
    slotMinutes: clinic.slotMinutes
  });
});

function generateSlots(clinic, date) {
  const [sh, sm] = clinic.workStart.split(':').map(Number);
  const [eh, em] = clinic.workEnd.split(':').map(Number);
  const slots = [];
  let cur = new Date(`${date}T${clinic.workStart}:00`);
  const end = new Date(`${date}T${clinic.workEnd}:00`);
  while (cur < end) {
    slots.push(new Date(cur).toISOString());
    cur = new Date(cur.getTime() + clinic.slotMinutes * 60000);
  }
  return slots;
}

router.get('/:slug/slots', (req, res) => {
  const clinic = db.findClinicBySlug(req.params.slug);
  if (!clinic) return res.status(404).json({ error: 'العيادة غير موجودة' });
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'التاريخ مطلوب' });

  const allSlots = generateSlots(clinic, date);
  const existing = db.listAppointments(clinic.id, { date })
    .filter(a => a.status !== 'cancelled')
    .map(a => a.time);

  const available = allSlots.filter(s => !existing.includes(s));
  res.json({ slots: available });
});

router.post('/:slug/book', (req, res) => {
  const clinic = db.findClinicBySlug(req.params.slug);
  if (!clinic) return res.status(404).json({ error: 'العيادة غير موجودة' });

  const { patientName, patientPhone, time, reason } = req.body;
  if (!patientName || !patientPhone || !time) {
    return res.status(400).json({ error: 'الاسم، الهاتف، والوقت مطلوبة' });
  }

  const date = time.split('T')[0];
  const existing = db.listAppointments(clinic.id, { date })
    .filter(a => a.status !== 'cancelled')
    .map(a => a.time);
  if (existing.includes(time)) {
    return res.status(409).json({ error: 'هذا الموعد محجوز بالفعل، يرجى اختيار وقت آخر' });
  }

  const patient = db.findOrCreatePatient(clinic.id, { name: patientName, phone: patientPhone });
  const appt = db.createAppointment({
    clinicId: clinic.id,
    patientId: patient.id,
    time,
    reason: reason || '',
    status: 'pending',
    source: 'patient'
  });
  res.json({ success: true, appointment: appt });
});

module.exports = router;
