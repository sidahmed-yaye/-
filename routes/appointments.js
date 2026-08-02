const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const { date } = req.query;
  const appts = db.listAppointments(req.clinicId, { date });
  const withPatients = appts.map(a => ({
    ...a,
    patient: db.findPatientById(a.patientId)
  }));
  res.json(withPatients);
});

router.post('/', (req, res) => {
  const { patientName, patientPhone, time, reason, notes } = req.body;
  if (!patientName || !patientPhone || !time) {
    return res.status(400).json({ error: 'اسم المريض، الهاتف، والوقت مطلوبة' });
  }
  const patient = db.findOrCreatePatient(req.clinicId, { name: patientName, phone: patientPhone });
  const appt = db.createAppointment({
    clinicId: req.clinicId,
    patientId: patient.id,
    time,
    reason: reason || '',
    notes: notes || '',
    status: 'confirmed',
    source: 'clinic'
  });
  res.json({ ...appt, patient });
});

router.put('/:id', (req, res) => {
  const { status, time, notes, reason } = req.body;
  const updates = {};
  if (status) updates.status = status;
  if (time) updates.time = time;
  if (notes !== undefined) updates.notes = notes;
  if (reason !== undefined) updates.reason = reason;
  const updated = db.updateAppointment(req.params.id, req.clinicId, updates);
  if (!updated) return res.status(404).json({ error: 'الموعد غير موجود' });
  res.json({ ...updated, patient: db.findPatientById(updated.patientId) });
});

router.delete('/:id', (req, res) => {
  const ok = db.deleteAppointment(req.params.id, req.clinicId);
  if (!ok) return res.status(404).json({ error: 'الموعد غير موجود' });
  res.json({ success: true });
});

module.exports = router;
