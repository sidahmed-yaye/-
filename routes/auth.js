const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken } = require('../middleware/auth');
const { validateMauritanianPhone } = require('../utils');

const router = express.Router();

function slugify(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'clinic';
}

router.post('/register', async (req, res) => {
  const { name, phone, username, password, workStart, workEnd, slotMinutes } = req.body;
  if (!name || !username || !password || !phone) {
    return res.status(400).json({ error: 'الاسم، الهاتف، اسم المستخدم وكلمة المرور مطلوبة' });
  }
  if (db.findClinicByUsername(username)) {
    return res.status(409).json({ error: 'اسم المستخدم مستخدم بالفعل' });
  }
  const validPhone = validateMauritanianPhone(phone);
  if (!validPhone) {
    return res.status(400).json({ error: 'رقم الهاتف يجب أن يكون رقماً موريتانياً صحيحاً (8 أرقام تبدأ بـ 2 أو 3 أو 4)' });
  }
  let baseSlug = slugify(name);
  let slug = baseSlug;
  let n = 1;
  while (db.findClinicBySlug(slug)) {
    slug = `${baseSlug}-${n++}`;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const clinic = db.createClinic({
    name, phone: validPhone, username, passwordHash, slug,
    workStart: workStart || '08:00',
    workEnd: workEnd || '17:00',
    slotMinutes: slotMinutes || 30
  });
  const token = signToken(clinic.id);
  res.json({
    token,
    clinic: { id: clinic.id, name: clinic.name, slug: clinic.slug, phone: clinic.phone }
  });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const clinic = db.findClinicByUsername(username);
  if (!clinic) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  const ok = await bcrypt.compare(password, clinic.passwordHash);
  if (!ok) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  if (clinic.status === 'disabled') {
    return res.status(403).json({ error: 'تم تعطيل هذا الحساب من قبل الإدارة. يرجى التواصل معنا.' });
  }
  const token = signToken(clinic.id);
  res.json({
    token,
    clinic: { id: clinic.id, name: clinic.name, slug: clinic.slug, phone: clinic.phone }
  });
});

module.exports = router;
