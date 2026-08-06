const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../db');
const { validateMauritanianPhone, formatFriendly } = require('../utils');
const { sendWhatsAppMessage } = require('../services/whatsapp');

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, '..', 'data', 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 10) || '.jpg';
      cb(null, crypto.randomBytes(16).toString('hex') + ext);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (!/^image\//.test(file.mimetype)) {
      return cb(new Error('يجب أن يكون الملف صورة (jpg, png, إلخ)'));
    }
    cb(null, true);
  }
});

// ---- دليل العيادات العام (بحث وتصفية) ----
router.get('/directory', (req, res) => {
  const { query, specialty, city } = req.query;
  res.json(db.searchClinics({ query, specialty, city }));
});

router.get('/directory/filters', (req, res) => {
  res.json({
    specialties: db.listSpecialties(),
    cities: db.listCities()
  });
});

router.get('/:slug', (req, res) => {
  const clinic = db.findClinicBySlug(req.params.slug);
  if (!clinic || clinic.status === 'disabled') return res.status(404).json({ error: 'العيادة غير موجودة' });
  res.json({
    name: clinic.name,
    slug: clinic.slug,
    phone: clinic.phone,
    specialty: clinic.specialty,
    city: clinic.city,
    workStart: clinic.workStart,
    workEnd: clinic.workEnd,
    slotMinutes: clinic.slotMinutes,
    requirePaymentProof: !!clinic.requirePaymentProof,
    paymentServiceName: clinic.paymentServiceName,
    paymentNumber: clinic.paymentNumber,
    paymentInstructions: clinic.paymentInstructions
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

function checkSlotFree(clinic, time) {
  const date = time.split('T')[0];
  const existing = db.listAppointments(clinic.id, { date })
    .filter(a => a.status !== 'cancelled' && a.status !== 'rejected')
    .map(a => a.time);
  return !existing.includes(time);
}

// ---- الحجز البسيط (بدون إثبات دفع) — يبقى كما هو للعيادات التي لم تفعّل الدفع المسبق ----
router.post('/:slug/book', (req, res) => {
  const clinic = db.findClinicBySlug(req.params.slug);
  if (!clinic || clinic.status === 'disabled') return res.status(404).json({ error: 'العيادة غير موجودة' });
  if (clinic.requirePaymentProof) {
    return res.status(400).json({ error: 'هذه العيادة تتطلب إثبات دفع قبل الحجز، يرجى استخدام صفحة الحجز الكاملة' });
  }

  const { patientName, patientPhone, time, reason, service } = req.body;
  if (!patientName || !patientPhone || !time) {
    return res.status(400).json({ error: 'الاسم، الهاتف، والوقت مطلوبة' });
  }
  const validPhone = validateMauritanianPhone(patientPhone);
  if (!validPhone) {
    return res.status(400).json({ error: 'رقم الهاتف يجب أن يكون رقماً موريتانياً صحيحاً (8 أرقام تبدأ بـ 2 أو 3 أو 4)' });
  }
  if (!checkSlotFree(clinic, time)) {
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
      service: service || '',
      status: 'pending',
      source: 'patient'
    });
  } catch (e) {
    if (e.code === 'SLOT_TAKEN') return res.status(409).json({ error: e.message });
    throw e;
  }

  sendWhatsAppMessage(
    validPhone,
    `تم استلام طلب حجزك في ${clinic.name}\nالتاريخ والوقت: ${formatFriendly(time)}\nسيصلك تأكيد من العيادة قريباً.`
  ).catch(() => {});

  res.json({ success: true, appointment: appt });
});

// ---- الحجز مع إثبات الدفع (للعيادات التي فعّلت الدفع المسبق) ----
router.post('/:slug/book-with-payment', (req, res, next) => {
  upload.single('paymentProof')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'خطأ في رفع الملف' });
    next();
  });
}, (req, res) => {
  const clinic = db.findClinicBySlug(req.params.slug);
  if (!clinic || clinic.status === 'disabled') {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(404).json({ error: 'العيادة غير موجودة' });
  }

  const { patientName, patientPhone, time, reason, service } = req.body;
  if (!patientName || !patientPhone || !time) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'الاسم، الهاتف، والوقت مطلوبة' });
  }
  const validPhone = validateMauritanianPhone(patientPhone);
  if (!validPhone) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'رقم الهاتف يجب أن يكون رقماً موريتانياً صحيحاً (8 أرقام تبدأ بـ 2 أو 3 أو 4)' });
  }
  if (clinic.requirePaymentProof && !req.file) {
    return res.status(400).json({ error: 'يرجى رفع صورة إثبات الدفع' });
  }
  if (!checkSlotFree(clinic, time)) {
    if (req.file) fs.unlink(req.file.path, () => {});
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
      service: service || '',
      status: 'pending',
      source: 'patient',
      paymentProofPath: req.file ? req.file.filename : null
    });
  } catch (e) {
    if (req.file) fs.unlink(req.file.path, () => {});
    if (e.code === 'SLOT_TAKEN') return res.status(409).json({ error: e.message });
    throw e;
  }

  sendWhatsAppMessage(
    validPhone,
    `تم استلام طلب حجزك وإثبات الدفع في ${clinic.name}\nالتاريخ والوقت: ${formatFriendly(time)}\nستتم مراجعة الدفع وتأكيد الحجز من قبل العيادة قريباً.`
  ).catch(() => {});

  res.json({ success: true, appointment: appt });
});

module.exports = router;
