const express = require('express');
const db = require('../db');
const { requireAdmin, signAdminToken } = require('../middleware/auth');

const router = express.Router();

// بيانات دخول الأدمن تُقرأ من متغيرات البيئة فقط (ليست في قاعدة البيانات) لأمان أعلى
router.post('/login', (req, res) => {
    // قراءة المتغيرات مباشرة عند الطلب
    const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

    if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
        return res.status(500).json({ 
            error: 'حساب الأدمن غير مُهيّأ على الخادم (ADMIN_USERNAME/ADMIN_PASSWORD)' 
        });
    }

    const { username, password } = req.body;
    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }

    res.json({ token: signAdminToken() });
});
router.post('/login', (req, res) => {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    return res.status(500).json({ error: 'حساب الأدمن غير مُهيَّأ على الخادم (ADMIN_USERNAME/ADMIN_PASSWORD)' });
  }
  const { username, password } = req.body;
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  }
  res.json({ token: signAdminToken() });
});

router.use(requireAdmin);

router.get('/clinics', (req, res) => {
  res.json(db.listAllClinics());
});

router.put('/clinics/:id/status', (req, res) => {
  const { status } = req.body;
  if (!['active', 'disabled'].includes(status)) {
    return res.status(400).json({ error: 'حالة غير صحيحة' });
  }
  const updated = db.setClinicStatus(req.params.id, status);
  if (!updated) return res.status(404).json({ error: 'العيادة غير موجودة' });
  const { passwordHash, ...safe } = updated;
  res.json(safe);
});

router.put('/clinics/:id/dues', (req, res) => {
  const { amount } = req.body;
  const num = Number(amount);
  if (isNaN(num) || num < 0) {
    return res.status(400).json({ error: 'مبلغ غير صحيح' });
  }
  const updated = db.setClinicDues(req.params.id, num);
  if (!updated) return res.status(404).json({ error: 'العيادة غير موجودة' });
  const { passwordHash, ...safe } = updated;
  res.json(safe);
});

module.exports = router;
