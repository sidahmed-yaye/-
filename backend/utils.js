// أدوات مشتركة: التعامل مع الوقت والهاتف

// نخزّن كل الأوقات كنص محلي "خام" بصيغة YYYY-MM-DDTHH:MM بدون منطقة زمنية،
// ونفترض دائماً أنه توقيت موريتانيا (UTC+0 بدون توقيت صيفي) عند الحاجة لحسابات زمنية فعلية.
// هذا يمنع مشاكل انزياح التاريخ الناتجة عن اختلاف المنطقة الزمنية بين متصفح العميل وخادم الاستضافة.

function toUTCDateForMath(localTimeStr) {
  // "2026-08-05T08:00" -> Date كائن يمثل نفس اللحظة بافتراض أنها بتوقيت UTC+0
  const clean = localTimeStr.length === 16 ? localTimeStr + ':00' : localTimeStr;
  return new Date(clean + 'Z');
}

function formatFriendly(localTimeStr) {
  const [datePart, timePart] = localTimeStr.split('T');
  const [y, m, d] = datePart.split('-');
  const [h, mi] = timePart.split(':');
  return `${d}/${m}/${y} ${h}:${mi}`;
}

// رقم موريتاني: 8 أرقام، يبدأ بـ 2 أو 3 أو 4 (يقبل إدخال مع أو بدون مفتاح الدولة 222/+222)
function validateMauritanianPhone(raw) {
  let p = (raw || '').replace(/[^\d]/g, '');
  if (p.startsWith('222') && p.length === 11) p = p.slice(3);
  if (!/^[234]\d{7}$/.test(p)) return null;
  return p;
}

module.exports = { toUTCDateForMath, formatFriendly, validateMauritanianPhone };
