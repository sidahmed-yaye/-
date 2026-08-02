// خدمة إرسال رسائل واتساب عبر WhatsApp Cloud API من Meta
// للحصول على بيانات الاعتماد: https://developers.facebook.com/docs/whatsapp/cloud-api/get-started
// ضع WHATSAPP_TOKEN و WHATSAPP_PHONE_ID في ملف .env
// في حال عدم توفر بيانات الاعتماد، تعمل الخدمة في "وضع تجريبي" وتسجل الرسائل في log.txt بدل إرسالها فعلياً

const fs = require('fs');
const path = require('path');

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const DEV_LOG = path.join(__dirname, '..', 'data', 'whatsapp-dev-log.txt');

function normalizePhone(phone) {
  // يفترض أرقام موريتانيا محلياً (يبدأ بـ 2/3/4) ويضيف مفتاح الدولة +222 إن لم يكن موجوداً
  let p = phone.replace(/[^\d+]/g, '');
  if (!p.startsWith('+')) {
    if (p.startsWith('222')) p = '+' + p;
    else p = '+222' + p;
  }
  return p;
}

async function sendWhatsAppMessage(phoneRaw, message) {
  const phone = normalizePhone(phoneRaw);

  if (!TOKEN || !PHONE_ID) {
    // وضع تجريبي: نسجل الرسالة بدل إرسالها (مفيد أثناء التطوير قبل اعتماد حساب واتساب للأعمال)
    const line = `[${new Date().toISOString()}] (DEV MODE) إلى ${phone}: ${message}\n`;
    fs.appendFileSync(DEV_LOG, line);
    console.log('WhatsApp DEV MODE ->', phone, message);
    return { ok: true, dev: true };
  }

  const url = `https://graph.facebook.com/v20.0/${PHONE_ID}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone.replace('+', ''),
      type: 'text',
      text: { body: message }
    })
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('WhatsApp send failed:', data);
    return { ok: false, error: data };
  }
  return { ok: true, data };
}

module.exports = { sendWhatsAppMessage, normalizePhone };
