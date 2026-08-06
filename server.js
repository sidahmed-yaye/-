require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// نتأكد من وجود مجلد البيانات دائماً عند بدء التشغيل، بغض النظر عن كيفية رفع المشروع
// (رفع GitHub اليدوي أحياناً لا ينقل المجلدات شبه الفارغة بشكل موثوق)
fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });

const authRoutes = require('./routes/auth');
const appointmentRoutes = require('./routes/appointments');
const publicRoutes = require('./routes/public');
const clinicRoutes = require('./routes/clinic');
const adminRoutes = require('./routes/admin');
const { startScheduler, runReminderPass } = require('./services/scheduler');

const app = express();
app.set('trust proxy', true);
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/clinic', clinicRoutes);
app.use('/api/admin', adminRoutes);

// فحص يدوي لإرسال التذكيرات (مفيد للاختبار)
app.post('/api/dev/run-reminders', async (req, res) => {
  const count = await runReminderPass();
  res.json({ sent: count });
});

app.use(express.static(path.join(__dirname, 'public')));

// معالج أخطاء عام: أي خطأ غير متوقع في أي مسار API يُرجع رسالة واضحة
// بدل أن يُسقط الخادم بالكامل ويسبب 502 لكل المستخدمين
app.use((err, req, res, next) => {
  console.error('خطأ غير متوقع:', err);
  res.status(500).json({ error: 'حدث خطأ في الخادم، يرجى المحاولة مرة أخرى' });
});

// شبكة أمان إضافية: تسجيل أي خطأ غير مُعالَج دون إسقاط العملية بالكامل
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`الخادم يعمل على http://localhost:${PORT}`);
  startScheduler();
});
