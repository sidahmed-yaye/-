const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { validateMauritanianPhone } = require('../utils');

const router = express.Router();
router.use(requireAuth);

router.get('/me', (req, res) => {
  const clinic = db.findClinicById(req.clinicId);
  if (!clinic) return res.status(404).json({ error: 'العيادة غير موجودة' });
  const { passwordHash, ...safe } = clinic;
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

router.put('/me', (req, res) => {
  const { name, phone, workStart, workEnd, slotMinutes, specialty, city } = req.body;
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

  if (updates.workStart && updates.workEnd && updates.workStart >= updates.workEnd) {
    return res.status(400).json({ error: 'وقت بداية الدوام يجب أن يكون قبل وقت النهاية' });
  }

  const updated = db.updateClinic(req.clinicId, updates);
  if (!updated) return res.status(404).json({ error: 'العيادة غير موجودة' });
  const { passwordHash, ...safe } = updated;
  res.json(safe);
});

module.exports = router;
