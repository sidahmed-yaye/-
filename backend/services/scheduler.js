const cron = require('node-cron');
const db = require('../db');
const { sendWhatsAppMessage } = require('./whatsapp');
const { formatFriendly } = require('../utils');

async function runReminderPass() {
  const due = db.allDueReminders();
  for (const appt of due) {
    const clinic = db.readDB().clinics.find(c => c.id === appt.clinicId);
    const patient = db.findPatientById(appt.patientId);
    if (!clinic || !patient) continue;
    const message =
      `تذكير بموعدك في ${clinic.name}\n` +
      `الموعد: ${formatFriendly(appt.time)}\n` +
      (appt.reason ? `السبب: ${appt.reason}\n` : '') +
      `للإلغاء أو التعديل يرجى الاتصال بالعيادة.`;
    const result = await sendWhatsAppMessage(patient.phone, message);
    if (result.ok) {
      db.updateAppointment(appt.id, appt.clinicId, { reminderSent: true, reminderSentAt: new Date().toISOString() });
    }
  }
  return due.length;
}

function startScheduler() {
  // يفحص كل 15 دقيقة عن مواعيد خلال 23-25 ساعة القادمة ولم يُرسَل لها تذكير بعد
  cron.schedule('*/15 * * * *', async () => {
    try {
      const count = await runReminderPass();
      if (count > 0) console.log(`تم إرسال ${count} تذكير(ات)`);
    } catch (e) {
      console.error('خطأ في جدولة التذكيرات:', e);
    }
  });
  console.log('مُجدوِل التذكيرات يعمل الآن (كل 15 دقيقة)');
}

module.exports = { startScheduler, runReminderPass };
