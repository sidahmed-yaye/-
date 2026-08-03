const TRANSLATIONS = {
  ar: {
    appName: 'موعدي',
    tagline: 'نظام حجز وتذكير للعيادات — بلا مواعيد ضائعة',
    login: 'تسجيل الدخول',
    username: 'اسم المستخدم',
    password: 'كلمة المرور',
    noAccount: 'ليس لديك حساب؟',
    createClinic: 'أنشئ عيادتك الآن',
    haveAccount: 'لديك حساب؟',
    clinicName: 'اسم العيادة',
    clinicPhone: 'رقم هاتف العيادة (لأغراض التذكيرات)',
    phoneHint: 'رقم موريتاني: 8 أرقام تبدأ بـ 2 أو 3 أو 4',
    workStart: 'بداية الدوام',
    workEnd: 'نهاية الدوام',
    createAccount: 'إنشاء الحساب',
    logout: 'تسجيل الخروج',
    bookingLinkLabel: 'رابط الحجز الخاص بعيادتك، شاركه مع مرضاك:',
    copyLink: 'نسخ الرابط',
    linkCopied: 'تم نسخ الرابط: ',
    statTotal: 'مواعيد اليوم',
    statConfirmed: 'مؤكدة',
    statPending: 'بانتظار التأكيد',
    todayAppts: 'مواعيد اليوم',
    noAppts: 'لا توجد مواعيد في هذا اليوم',
    addManual: 'إضافة موعد يدوياً',
    patientName: 'اسم المريض',
    patientPhone: 'رقم هاتف المريض (واتساب)',
    dateTime: 'التاريخ والوقت',
    reasonOptional: 'سبب الزيارة (اختياري)',
    addAppt: 'إضافة الموعد',
    addSuccess: 'تمت إضافة الموعد بنجاح',
    settings: 'إعدادات العيادة',
    saveSettings: 'حفظ التعديلات',
    settingsSaved: 'تم حفظ الإعدادات بنجاح',
    slotDuration: 'مدة كل موعد (بالدقائق)',
    confirm: 'تأكيد',
    reject: 'رفض',
    visited: 'تمت الزيارة',
    noShow: 'لم يحضر',
    cancel: 'إلغاء',
    footer: 'موعدي — صُنع لعيادات موريتانيا 🇲🇷',
    statusPending: 'بانتظار التأكيد',
    statusConfirmed: 'مؤكد',
    statusRejected: 'مرفوض',
    statusCompleted: 'تمت الزيارة',
    statusCancelled: 'ملغى',
    statusNoShow: 'لم يحضر',
    // صفحة الحجز
    bookHero: 'احجز موعدك',
    fullName: 'الاسم الكامل',
    phoneForReminder: 'رقم الهاتف (واتساب — لإرسال تذكير قبل الموعد)',
    chooseDate: 'اختر التاريخ',
    chooseTime: 'اختر الوقت المتاح',
    confirmBooking: 'تأكيد الحجز',
    selectDateFirst: 'اختر تاريخاً لعرض الأوقات المتاحة',
    noSlots: 'لا توجد أوقات متاحة في هذا اليوم',
    loadingSlots: 'جارِ تحميل الأوقات...',
    bookingSuccess: 'تم إرسال طلب حجزك',
    bookingSuccessDetail: 'ستصلك رسالة واتساب لتأكيد الموعد، وتذكير قبل موعدك بيوم واحد.',
    poweredBy: 'مدعوم بواسطة موعدي',
    invalidLink: 'رابط غير صالح',
    clinicNotFound: 'تعذر إيجاد العيادة',
    fillRequired: 'يرجى إدخال الاسم والهاتف واختيار وقت'
  },
  fr: {
    appName: 'Mawidi',
    tagline: 'Système de réservation et rappel pour cliniques — plus de rendez-vous manqués',
    login: 'Connexion',
    username: "Nom d'utilisateur",
    password: 'Mot de passe',
    noAccount: "Vous n'avez pas de compte ?",
    createClinic: 'Créez votre clinique',
    haveAccount: 'Vous avez un compte ?',
    clinicName: 'Nom de la clinique',
    clinicPhone: 'Téléphone de la clinique (pour les rappels)',
    phoneHint: 'Numéro mauritanien : 8 chiffres commençant par 2, 3 ou 4',
    workStart: 'Début des horaires',
    workEnd: 'Fin des horaires',
    createAccount: 'Créer le compte',
    logout: 'Déconnexion',
    bookingLinkLabel: 'Lien de réservation de votre clinique, partagez-le avec vos patients :',
    copyLink: 'Copier le lien',
    linkCopied: 'Lien copié : ',
    statTotal: "Rendez-vous aujourd'hui",
    statConfirmed: 'Confirmés',
    statPending: 'En attente',
    todayAppts: "Rendez-vous du jour",
    noAppts: "Aucun rendez-vous ce jour",
    addManual: 'Ajouter un rendez-vous manuellement',
    patientName: 'Nom du patient',
    patientPhone: 'Téléphone du patient (WhatsApp)',
    dateTime: 'Date et heure',
    reasonOptional: 'Motif de la visite (optionnel)',
    addAppt: 'Ajouter le rendez-vous',
    addSuccess: 'Rendez-vous ajouté avec succès',
    settings: 'Paramètres de la clinique',
    saveSettings: 'Enregistrer les modifications',
    settingsSaved: 'Paramètres enregistrés avec succès',
    slotDuration: 'Durée de chaque créneau (minutes)',
    confirm: 'Confirmer',
    reject: 'Refuser',
    visited: 'Visité',
    noShow: 'Absent',
    cancel: 'Annuler',
    footer: 'Mawidi — conçu pour les cliniques de Mauritanie 🇲🇷',
    statusPending: 'En attente',
    statusConfirmed: 'Confirmé',
    statusRejected: 'Refusé',
    statusCompleted: 'Visité',
    statusCancelled: 'Annulé',
    statusNoShow: 'Absent',
    bookHero: 'Réservez votre rendez-vous',
    fullName: 'Nom complet',
    phoneForReminder: 'Téléphone (WhatsApp — pour recevoir un rappel)',
    chooseDate: 'Choisissez une date',
    chooseTime: 'Choisissez un créneau disponible',
    confirmBooking: 'Confirmer la réservation',
    selectDateFirst: 'Choisissez une date pour voir les créneaux disponibles',
    noSlots: 'Aucun créneau disponible ce jour',
    loadingSlots: 'Chargement des créneaux...',
    bookingSuccess: 'Votre demande a été envoyée',
    bookingSuccessDetail: 'Vous recevrez un message WhatsApp pour confirmer, puis un rappel la veille.',
    poweredBy: 'Propulsé par Mawidi',
    invalidLink: 'Lien invalide',
    clinicNotFound: 'Clinique introuvable',
    fillRequired: 'Veuillez renseigner le nom, le téléphone et choisir un créneau'
  }
};

function getLang() {
  return localStorage.getItem('lang') || 'ar';
}

function t(key) {
  const lang = getLang();
  return (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) || TRANSLATIONS.ar[key] || key;
}

function applyTranslations() {
  const lang = getLang();
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
  const toggleBtn = document.getElementById('langToggle');
  if (toggleBtn) toggleBtn.textContent = lang === 'ar' ? 'Français' : 'العربية';
}

function toggleLang() {
  const current = getLang();
  localStorage.setItem('lang', current === 'ar' ? 'fr' : 'ar');
  applyTranslations();
  if (typeof onLangChange === 'function') onLangChange();
}

document.addEventListener('DOMContentLoaded', applyTranslations);
