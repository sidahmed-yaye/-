const express = require('express');
const path = require('path');
const fs = require('fs');
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
  const { patientName, patientPhone, time, reason, notes, service } = req.body;
  if (!patientName || !patientPhone || !time) {
    return res.status(400).json({ error: 'اسم المريض، الهاتف، والوقت مطلوبة' });
  }
  const validPhone = validateMauritanianPhone(patientPhone);
  if (!validPhone) {
    return res.status(400).json({ error: 'رقم الهاتف يجب أن يكون رقماً موريتانياً صحيحاً (8 أرقام تبدأ بـ 2 أو 3 أو 4)' });
  }
  const patient = db.findOrCreatePatient(req.clinicId, { name: patientName, phone: validPhone });

  let appt;
  try {
    appt = db.createAppointment({
      clinicId: req.clinicId,
      patientId: patient.id,
      time,
      reason: reason || '',
      notes: notes || '',
      service: service || '',
      status: 'confirmed',
      source: 'clinic'
    });
  } catch (e) {
    if (e.code === 'SLOT_TAKEN') return res.status(409).json({ error: e.message });
    throw e;
  }

  const clinic = db.findClinicById(req.clinicId);
  db.chargeIfDue(appt.id);
  sendWhatsAppMessage(
    validPhone,
    `تم تحديد موعدك في ${clinic.name}\nالتاريخ والوقت: ${formatFriendly(time)}` + (reason ? `\nالسبب: ${reason}` : '')
  ).catch(() => {});

  res.json({ ...appt, patient });
});

const STATUS_MESSAGES = {
  confirmed: (clinicName, time) => `تم تأكيد موعدك في ${clinicName}\nالتاريخ والوقت: ${formatFriendly(time)}`,
  rejected: (clinicName, time) => `نعتذر، تعذّر تأكيد موعدك في ${clinicName} المطلوب بتاريخ ${formatFriendly(time)}.\nيرجى التواصل مع العيادة أو اختيار وقت آخر.`,
  cancelled: (clinicName, time) => `تم إلغاء موعدك في ${clinicName} المحدد بتاريخ ${formatFriendly(time)}.\nيرجى التواصل مع العيادة لحجز موعد جديد إذا رغبت.`,
  completed: null,
  no_show: null
};

router.put('/:id', (req, res) => {
  const { status, time, notes, reason, sharedWithNetwork, service } = req.body;
  const updates = {};
  if (status) updates.status = status;
  if (time) updates.time = time;
  if (notes !== undefined) updates.notes = notes;
  if (reason !== undefined) updates.reason = reason;
  if (sharedWithNetwork !== undefined) updates.sharedWithNetwork = sharedWithNetwork;
  if (service !== undefined) updates.service = service;

  const before = db.listAppointments(req.clinicId).find(a => a.id === req.params.id);

  let updated;
  try {
    updated = db.updateAppointment(req.params.id, req.clinicId, updates);
  } catch (e) {
    if (e.code === 'SLOT_TAKEN') return res.status(409).json({ error: e.message });
    throw e;
  }
  if (!updated) return res.status(404).json({ error: 'الموعد غير موجود' });

  const patient = db.findPatientById(updated.patientId);
  const clinic = db.findClinicById(req.clinicId);

  if (status && STATUS_MESSAGES[status] && patient && clinic) {
    sendWhatsAppMessage(patient.phone, STATUS_MESSAGES[status](clinic.name, updated.time)).catch(() => {});
  }
  if (status === 'confirmed') {
    db.chargeIfDue(updated.id);
  }
  // بعد أن تراجع العيادة إثبات الدفع وتتخذ قراراً (تأكيد أو رفض)، نحذف الصورة نهائياً
  // من القرص ومن قاعدة البيانات — لا داعي للاحتفاظ بها بعد اكتمال المراجعة
  if ((status === 'confirmed' || status === 'rejected') && before && before.paymentProofPath) {
    const filePath = path.join(__dirname, '..', 'data', 'uploads', before.paymentProofPath);
    fs.unlink(filePath, () => {});
    db.clearPaymentProof(updated.id);
    updated.paymentProofPath = null;
  }
  if (time && before && before.time !== time && (!status || status === 'confirmed' || status === 'pending') && patient && clinic) {
    sendWhatsAppMessage(
      patient.phone,
      `تم تعديل موعدك في ${clinic.name}\nالموعد الجديد: ${formatFriendly(time)}`
    ).catch(() => {});
  }

  res.json({ ...updated, patient });
});

// إثبات الدفع: يُعرَض فقط للعيادة صاحبة الموعد
router.get('/:id/payment-proof', (req, res) => {
  const appts = db.listAppointments(req.clinicId);
  const appt = appts.find(a => a.id === req.params.id);
  if (!appt || !appt.paymentProofPath) return res.status(404).json({ error: 'لا يوجد إثبات دفع لهذا الموعد' });
  const filePath = path.join(__dirname, '..', 'data', 'uploads', appt.paymentProofPath);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'الملف غير موجود' });
  res.sendFile(filePath);
});

router.delete('/:id', (req, res) => {
  const ok = db.deleteAppointment(req.params.id, req.clinicId);
  if (!ok) return res.status(404).json({ error: 'الموعد غير موجود' });
  res.json({ success: true });
});

module.exports = router;
