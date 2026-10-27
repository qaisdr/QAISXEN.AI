# نشر QAISXEN على الإنترنت

## 1) جهّز المفاتيح (config.js)
- GROQ_API_KEY من https://console.groq.com/keys (شكل gsk_...)
- اختياري للصور: HF_TOKEN من https://huggingface.co/settings/tokens
- اختياري للصور: POLLINATIONS_KEY من https://enter.pollinations.ai
- Supabase: SUPABASE_URL + SUPABASE_ANON_KEY
- نفّذ schema.sql في SQL Editor
- Authentication → Email → Enable

## 2) ارفع الملفات
ارفع كل الملفات (ما عدا DEPLOY.md إن رغبت):
index.html, styles.css, script.js, config.js, schema.sql, logo.svg, logo-app.svg

### Netlify
1. https://app.netlify.com
2. Add new site → Deploy manually
3. اسحب مجلد الموقع
4. انتظر الرابط (https://....netlify.app)

### Vercel
1. https://vercel.com
2. Add New → Project → Upload
3. أو اربط GitHub

### Cloudflare Pages
1. https://dash.cloudflare.com → Pages
2. Upload assets

## 3) بعد النشر
- افتح الموقع على https
- Ctrl+Shift+R
- جرب الشات ثم إنشاء حساب لحفظ السحابة
- لا تشارك مفاتيح gsk_ / hf_ / sk_ علناً

## 4) حماية لاحقة (موصى بها)
- لا تضع secret keys في الواجهة
- anon key في Supabase محمي بـ RLS (schema.sql)
- لمفاتيح AI الحساسة الأفضل لاحقاً Backend بسيط
