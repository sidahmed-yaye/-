const express = require('express');
const db = require('../db');
const { validateMauritanianPhone, formatFriendly } = require('../utils');
const { sendWhatsAppMessage } = require('../services/whatsapp');

const router = express.Router();

router.get('/:slug', (req, res) => {
  const clinic = db.findClinicBySlug(req.params.slug);
  if (!clinic || clinic.status === 'disabled') return res.status(404).json({ error: 'العيادة غير موجودة' });
  res.json({
    name: clinic.name,
    slug: clinic.slug,
    phone: clinic.phone,
    workStart: clinic.workStart,
    workEnd: clinic.workEnd,
    slotMinutes: clinic.slotMinutes
  });
});

// توليد الأوقات المتاحة بحساب نصي بحت (بدون كائنات Date) لتفادي أي انزياح
// بسبب اختلاف المنطقة الزمنية بين خادم الاستضافة والمستخدم — موريتانيا توقيتها ثابت UTC+0 دائماً
function generateSlots(clinic, date) {
  const [sh, sm] = clinic.workStart.split(':').map(Number);
  const [eh, em] = clinic.workEnd.split(':').map(Number);
  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;
  const slots = [];
  for (let t = startMinutes; t < endMinutes; t += clinic.slotMinutes) {
    const hh = String(Math.floor(t / 60)).padStart(2, '0');
    const mm = String(t % 60).padStart(2, '0');
    slots.push(`${date}T${hh}:${mm}`);
  }
  return slots;
}

router.get('/:slug/slots', (req, res) => {
  const clinic = db.findClinicBySlug(req.params.slug);
  if (!clinic || clinic.status === 'disabled') return res.status(404).json({ error: 'العيادة غير موجودة' });
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'التاريخ مطلوب' });

  const allSlots = generateSlots(clinic, date);
  const existing = db.listAppointments(clinic.id, { date })
    .filter(a => a.status !== 'cancelled' && a.status !== 'rejected')
    .map(a => a.time);

  const available = allSlots.filter(s => !existing.includes(s));
  res.json({ slots: available });
});

router.post('/:slug/book', (req, res) => {
  const clinic = db.findClinicBySlug(req.params.slug);
  if (!clinic || clinic.status === 'disabled') return res.status(404).json({ error: 'العيادة غير موجودة' });

  const { patientName, patientPhone, time, reason } = req.body;
  if (!patientName || !patientPhone || !time) {
    return res.status(400).json({ error: 'الاسم، الهاتف، والوقت مطلوبة' });
  }
  const validPhone = validateMauritanianPhone(patientPhone);
  if (!validPhone) {
    return res.status(400).json({ error: 'رقم الهاتف يجب أن يكون رقماً موريتانياً صحيحاً (8 أرقام تبدأ بـ 2 أو 3 أو 4)' });
  }

  const date = time.split('T')[0];
  const existing = db.listAppointments(clinic.id, { date })
    .filter(a => a.status !== 'cancelled' && a.status !== 'rejected')
    .map(a => a.time);
  if (existing.includes(time)) {
    return res.status(409).json({ error: 'هذا الموعد محجوز بالفعل، يرجى اختيار وقت آخر' });
  }

  const patient = db.findOrCreatePatient(clinic.id, { name: patientName, phone: validPhone });
  let appt;
  try {
    appt = db.createAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      time,
      reason: reason || '',
      status: 'pending',
      source: 'patient'
    });
  } catch (e) {
    // شخص آخر حجز نفس الوقت في اللحظة نفسها (تزامن حقيقي) — قاعدة البيانات تمنع هذا نهائياً
    if (e.code === 'SLOT_TAKEN') {
      return res.status(409).json({ error: e.message });
    }
    throw e;
  }

  sendWhatsAppMessage(
    validPhone,
    `تم استلام طلب حجزك في ${clinic.name}\nالتاريخ والوقت: ${formatFriendly(time)}\nسيصلك تأكيد من العيادة قريباً.`
  ).catch(() => {});

  res.json({ success: true, appointment: appt });
});

module.exports = router;
