const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
  try {
    const payload = jwt.verify(token, SECRET);
    req.clinicId = payload.clinicId;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'الجلسة منتهية، سجل الدخول مجدداً' });
  }
}

function signToken(clinicId) {
  return jwt.sign({ clinicId }, SECRET, { expiresIn: '30d' });
}

module.exports = { requireAuth, signToken, SECRET };
