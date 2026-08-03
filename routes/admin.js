const express = require('express');
const db = require('../db');
const { requireAdmin, signAdminToken } = require('../middleware/auth');

const router = express.Router();

// مسار تسجيل الدخول للأدمن
router.post('/login', (req, res) => {
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

router.use(requireAdmin);

// باقي المسارات (get /clinics ... إلخ) تبدأ من هنا
