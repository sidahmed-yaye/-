require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const appointmentRoutes = require('./routes/appointments');
const publicRoutes = require('./routes/public');
const clinicRoutes = require('./routes/clinic');
const { startScheduler, runReminderPass } = require('./services/scheduler');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/clinic', clinicRoutes);

// فحص يدوي لإرسال التذكيرات (مفيد للاختبار)
app.post('/api/dev/run-reminders', async (req, res) => {
  const count = await runReminderPass();
  res.json({ sent: count });
});

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`الخادم يعمل على http://localhost:${PORT}`);
  startScheduler();
});
