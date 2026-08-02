const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { validateMauritanianPhone, formatFriendly } = require('../utils');
const { sendWhatsAppMessage } = require('../services/whatsapp');

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
  const validPhone = validateMauritanianPhone(patientPhone);
  if (!validPhone) {
    return res.status(400).json({ error: 'رقم الهاتف يجب أن يكون رقماً موريتانياً صحيحاً (8 أرقام تبدأ بـ 2 أو 3 أو 4)' });
  }
  const patient = db.findOrCreatePatient(req.clinicId, { name: patientName, phone: validPhone });
  const appt = db.createAppointment({
    clinicId: req.clinicId,
    patientId: patient.id,
    time,
    reason: reason || '',
    notes: notes || '',
    status: 'confirmed',
    source: 'clinic'
  });

  const clinic = db.findClinicById(req.clinicId);
  sendWhatsAppMessage(
    validPhone,
    `تم تحديد موعدك في ${clinic.name}\nالتاريخ والوقت: ${formatFriendly(time)}` + (reason ? `\nالسبب: ${reason}` : '')
  ).catch(() => {});

  res.json({ ...appt, patient });
});

const STATUS_MESSAGES = {
  confirmed: (clinicName, time) => `تم تأكيد موعدك في ${clinicName}\nالتاريخ والوقت: ${formatFriendly(time)}`,
  cancelled: (clinicName, time) => `تم إلغاء موعدك في ${clinicName} المحدد بتاريخ ${formatFriendly(time)}.\nيرجى التواصل مع العيادة لحجز موعد جديد إذا رغبت.`,
  completed: null,
  no_show: null
};

router.put('/:id', (req, res) => {
  const { status, time, notes, reason } = req.body;
  const updates = {};
  if (status) updates.status = status;
  if (time) updates.time = time;
  if (notes !== undefined) updates.notes = notes;
  if (reason !== undefined) updates.reason = reason;

  const before = db.listAppointments(req.clinicId).find(a => a.id === req.params.id);
  const updated = db.updateAppointment(req.params.id, req.clinicId, updates);
  if (!updated) return res.status(404).json({ error: 'الموعد غير موجود' });

  const patient = db.findPatientById(updated.patientId);
  const clinic = db.findClinicById(req.clinicId);

  if (status && STATUS_MESSAGES[status] && patient && clinic) {
    sendWhatsAppMessage(patient.phone, STATUS_MESSAGES[status](clinic.name, updated.time)).catch(() => {});
  }
  if (time && before && before.time !== time && patient && clinic) {
    sendWhatsAppMessage(
      patient.phone,
      `تم تعديل موعدك في ${clinic.name}\nالموعد الجديد: ${formatFriendly(time)}`
    ).catch(() => {});
  }

  res.json({ ...updated, patient });
});

router.delete('/:id', (req, res) => {
  const ok = db.deleteAppointment(req.params.id, req.clinicId);
  if (!ok) return res.status(404).json({ error: 'الموعد غير موجود' });
  res.json({ success: true });
});

module.exports = router;
