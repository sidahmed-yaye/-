const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { validateMauritanianPhone } = require('../utils');
const { sendWhatsAppMessage } = require('../services/whatsapp');

const router = express.Router();
router.use(requireAuth);

const UPLOADS_DIR = path.join(__dirname, '..', 'data', 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const docUpload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 10) || '';
      cb(null, crypto.randomBytes(16).toString('hex') + ext);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (!/^image\//.test(file.mimetype) && file.mimetype !== 'application/pdf') {
      return cb(new Error('يجب أن يكون الملف صورة أو PDF'));
    }
    cb(null, true);
  }
});

router.get('/me', (req, res) => {
  const clinic = db.findClinicById(req.clinicId);
  if (!clinic) return res.status(404).json({ error: 'العيادة غير موجودة' });
  const { passwordHash, ...safe } = db.parseWeeklyHours(clinic);
  safe.requirePaymentProof = !!safe.requirePaymentProof;
  res.json(safe);
});

router.get('/billing', (req, res) => {
  const billing = db.getClinicBilling(req.clinicId);
  if (!billing) return res.status(404).json({ error: 'العيادة غير موجودة' });
  res.json(billing);
});

router.get('/analytics', (req, res) => {
  res.json(db.getClinicAnalytics(req.clinicId));
});

// سجل المريض عبر الشبكة: التحقق من رقم موريتاني صحيح، ثم إرجاع زيارات هذه العيادة كاملة + زيارات العيادات الأخرى المشارَكة فقط
router.get('/patient-history/:phone', (req, res) => {
  const validPhone = validateMauritanianPhone(req.params.phone);
  if (!validPhone) {
    return res.status(400).json({ error: 'رقم الهاتف غير صحيح' });
  }
  res.json(db.getPatientHistory(req.clinicId, validPhone));
});

router.put('/me', (req, res) => {
  const { name, phone, workStart, workEnd, slotMinutes, specialty, city, paymentServiceName, paymentNumber, paymentInstructions, requirePaymentProof, weeklyHours } = req.body;
  const updates = {};

  if (name) updates.name = name;
  if (phone) {
    const validPhone = validateMauritanianPhone(phone);
    if (!validPhone) {
      return res.status(400).json({ error: 'رقم الهاتف يجب أن يكون رقماً موريتانياً صحيحاً (8 أرقام تبدأ بـ 2 أو 3 أو 4)' });
    }
    updates.phone = validPhone;
  }
  if (workStart) updates.workStart = workStart;
  if (workEnd) updates.workEnd = workEnd;
  if (slotMinutes) updates.slotMinutes = Number(slotMinutes);
  if (specialty !== undefined) updates.specialty = specialty;
  if (city !== undefined) updates.city = city;
  if (paymentServiceName !== undefined) updates.paymentServiceName = paymentServiceName;
  if (paymentNumber !== undefined) updates.paymentNumber = paymentNumber;
  if (paymentInstructions !== undefined) updates.paymentInstructions = paymentInstructions;
  if (requirePaymentProof !== undefined) updates.requirePaymentProof = requirePaymentProof;

  if (updates.workStart && updates.workEnd && updates.workStart >= updates.workEnd) {
    return res.status(400).json({ error: 'وقت بداية الدوام يجب أن يكون قبل وقت النهاية' });
  }

  const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  if (weeklyHours !== undefined) {
    if (typeof weeklyHours !== 'object' || weeklyHours === null) {
      return res.status(400).json({ error: 'برنامج العمل الأسبوعي غير صحيح' });
    }
    for (const day of DAY_KEYS) {
      const d = weeklyHours[day];
      if (!d || typeof d.open !== 'boolean') {
        return res.status(400).json({ error: 'برنامج العمل الأسبوعي يجب أن يشمل كل أيام الأسبوع' });
      }
      if (d.open && (!/^\d{2}:\d{2}$/.test(d.start) || !/^\d{2}:\d{2}$/.test(d.end) || d.start >= d.end)) {
        return res.status(400).json({ error: `أوقات يوم غير صحيحة (${day})` });
      }
    }
    updates.weeklyHours = weeklyHours;
  }

  const updated = db.updateClinic(req.clinicId, updates);
  if (!updated) return res.status(404).json({ error: 'العيادة غير موجودة' });
  const { passwordHash, ...safe } = db.parseWeeklyHours(updated);
  safe.requirePaymentProof = !!safe.requirePaymentProof;
  res.json(safe);
});

// قائمة عيادات أخرى نشطة (لاختيار عيادة محدَّدة عند المشاركة)
router.get('/other-clinics', (req, res) => {
  res.json(db.listOtherActiveClinics(req.clinicId));
});

const VALID_SHARING_MODES = ['private', 'clinic', 'network', 'patient'];

// رفع ملف/صورة إلى ملف المريض
router.post('/patients/:phone/documents', (req, res, next) => {
  docUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'خطأ في رفع الملف' });
    next();
  });
}, (req, res) => {
  const validPhone = validateMauritanianPhone(req.params.phone);
  if (!validPhone) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'رقم الهاتف غير صحيح' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'يرجى اختيار ملف' });
  }
  const { sharingMode, sharedWithClinicId, note, patientName } = req.body;
  if (!VALID_SHARING_MODES.includes(sharingMode)) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'طريقة مشاركة غير صحيحة' });
  }
  if (sharingMode === 'clinic' && !sharedWithClinicId) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'يرجى اختيار العيادة التي تريد مشاركة الملف معها' });
  }

  const globalPatient = db.findOrCreateGlobalPatient(validPhone, patientName || validPhone);
  const doc = db.addPatientDocument({
    globalPatientId: globalPatient.id,
    clinicId: req.clinicId,
    fileName: req.file.filename,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    sharingMode,
    sharedWithClinicId: sharingMode === 'clinic' ? sharedWithClinicId : null,
    note
  });

  if (sharingMode === 'patient' && doc.patientShareToken) {
    const clinic = db.findClinicById(req.clinicId);
    const link = `${req.protocol}://${req.get('host')}/document.html?token=${doc.patientShareToken}`;
    sendWhatsAppMessage(
      validPhone,
      `أرسلت لك ${clinic.name} ملفاً طبياً جديداً.\nيمكنك الاطلاع عليه من هذا الرابط:\n${link}`
    ).catch(() => {});
  }

  res.json(doc);
});

// قائمة ملفات المريض المرئية لهذه العيادة تحديداً (حسب صلاحيات المشاركة)
router.get('/patients/:phone/documents', (req, res) => {
  const validPhone = validateMauritanianPhone(req.params.phone);
  if (!validPhone) {
    return res.status(400).json({ error: 'رقم الهاتف غير صحيح' });
  }
  res.json(db.listPatientDocuments(req.clinicId, validPhone));
});

// عرض/تحميل ملف — يتحقق من صلاحية العيادة الحالية للوصول إليه
router.get('/documents/:id/file', (req, res) => {
  const doc = db.findDocumentById(req.params.id);
  if (!db.canClinicAccessDocument(req.clinicId, doc)) {
    return res.status(404).json({ error: 'الملف غير موجود أو لا تملك صلاحية الوصول إليه' });
  }
  const filePath = path.join(UPLOADS_DIR, doc.fileName);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'الملف غير موجود' });
  res.sendFile(filePath);
});

// حذف ملف — فقط العيادة التي رفعته
router.delete('/documents/:id', (req, res) => {
  const doc = db.findDocumentById(req.params.id);
  if (!doc || doc.clinicId !== req.clinicId) {
    return res.status(404).json({ error: 'الملف غير موجود أو لا تملك صلاحية حذفه' });
  }
  const filePath = path.join(UPLOADS_DIR, doc.fileName);
  fs.unlink(filePath, () => {});
  db.deletePatientDocument(req.params.id, req.clinicId);
  res.json({ success: true });
});

module.exports = router;
