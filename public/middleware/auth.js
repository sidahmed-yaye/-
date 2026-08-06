const jwt = require('jsonwebtoken');
const db = require('../db');
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
  try {
    const payload = jwt.verify(token, SECRET);
    const clinic = db.findClinicById(payload.clinicId);
    if (!clinic) return res.status(401).json({ error: 'الحساب غير موجود' });
    if (clinic.status === 'disabled') {
      return res.status(403).json({ error: 'تم تعطيل هذا الحساب من قبل الإدارة. يرجى التواصل معنا.' });
    }
    req.clinicId = payload.clinicId;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'الجلسة منتهية، سجل الدخول مجدداً' });
  }
}

function signToken(clinicId) {
  return jwt.sign({ clinicId }, SECRET, { expiresIn: '30d' });
}

// ---- Admin ----
function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
  try {
    const payload = jwt.verify(token, SECRET);
    if (!payload.isAdmin) return res.status(403).json({ error: 'صلاحية غير كافية' });
    next();
  } catch (e) {
    return res.status(401).json({ error: 'الجلسة منتهية، سجل الدخول مجدداً' });
  }
}

function signAdminToken() {
  return jwt.sign({ isAdmin: true }, SECRET, { expiresIn: '7d' });
}

module.exports = { requireAuth, signToken, requireAdmin, signAdminToken, SECRET };
