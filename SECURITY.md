# QAISXEN v1.0 — تقييد المفاتيح

## 1) مفتاح Gemini (AIza...)

1. افتح https://aistudio.google.com/apikey أو
   https://console.cloud.google.com/apis/credentials
2. اختر المفتاح
3. Application restrictions → HTTP referrers (web sites)
4. أضف:
   - https://YOUR-SITE.netlify.app/*
   - https://YOUR-DOMAIN.com/*
   - http://localhost:8000/*
5. API restrictions → Restrict key → Generative Language API فقط
6. Save وانتظر 1–2 دقيقة

## 2) Google Sign-In (GOOGLE_CLIENT_ID)

1. Google Cloud → Credentials → OAuth 2.0 Client ID (Web)
2. Authorized JavaScript origins:
   - http://localhost:8000
   - https://YOUR-SITE.netlify.app
   - https://YOUR-DOMAIN.com
3. الصق Client ID في config.js → GOOGLE_CLIENT_ID

## 3) مفتاح Groq (gsk_...)

لا يوجد تقييد نطاق مثل Google.
- راقب الاستخدام: https://console.groq.com
- إذا تسرب: احذف المفتاح وأنشئ جديداً
- لاحقاً: انقله إلى Cloudflare Worker

## 4) Supabase

- نفّذ schema.sql
- فعّل Email auth
- لا تستخدم service_role في الواجهة أبداً

## بعد التقييد

الموقع = QAISXEN v1.0 جاهز للنشر مع حماية أساسية للمفاتيح.
