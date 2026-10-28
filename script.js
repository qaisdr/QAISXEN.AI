/* QAISXEN — full clean build */
const C = () => window.QAISXEN_CONFIG || {};

function loadSettings() {
  try {
    return Object.assign({ mode: 'default', length: 'auto' }, JSON.parse(localStorage.getItem('qx-set') || '{}'));
  } catch { return { mode: 'default', length: 'auto' }; }
}
function saveSettings() {
  const mode = document.getElementById('setMode')?.value || 'default';
  const length = document.getElementById('setLength')?.value || 'auto';
  localStorage.setItem('qx-set', JSON.stringify({ mode, length }));
  bumpStat('settings');
  renderFavs();
  updateStatsLine();
}
function applySettingsUI() {
  const s = loadSettings();
  const m = document.getElementById('setMode');
  const l = document.getElementById('setLength');
  if (m) m.value = s.mode || 'default';
  if (l) l.value = s.length || 'auto';
  renderFavs();
  updateStatsLine();
}
function bumpStat(key) {
  try {
    const st = JSON.parse(localStorage.getItem('qx-stats') || '{}');
    st[key] = (st[key] || 0) + 1;
    st.msgs = st.msgs || 0;
    localStorage.setItem('qx-stats', JSON.stringify(st));
  } catch {}
}
function updateStatsLine() {
  const el = document.getElementById('statsLine');
  if (!el) return;
  try {
    const st = JSON.parse(localStorage.getItem('qx-stats') || '{}');
    el.textContent = 'إحصائيات هذا الجهاز: ' + (st.msgs || 0) + ' رسالة · ' + (st.calls || 0) + ' مكالمة · ' + (st.imgs || 0) + ' صورة';
  } catch { el.textContent = ''; }
}
function getFavs() {
  try { return JSON.parse(localStorage.getItem('qx-favs') || '[]'); } catch { return []; }
}
function addFav(text) {
  const list = getFavs();
  list.unshift({ t: String(text).slice(0, 500), at: Date.now() });
  localStorage.setItem('qx-favs', JSON.stringify(list.slice(0, 30)));
  renderFavs();
}
function clearFavs() {
  localStorage.removeItem('qx-favs');
  renderFavs();
}
function renderFavs() {
  const box = document.getElementById('favList');
  if (!box) return;
  const list = getFavs();
  if (!list.length) {
    box.innerHTML = '<div style="color:var(--faint);font-size:12px">لا مفضلة بعد</div>';
    return;
  }
  box.innerHTML = list.map((f, i) =>
    '<div class="fav-item" onclick=\'navigator.clipboard.writeText(' + JSON.stringify(f.t) + ')\'>' +
    escapeHtml(f.t.slice(0, 140)) + (f.t.length > 140 ? '…' : '') + '</div>'
  ).join('');
}

const $ = (id) => document.getElementById(id);

const messagesEl = $('messages');
const inputEl = $('input');
const sendBtn = $('sendBtn');
const histEl = $('hist');

let history = [];
let chatId = null;
let busy = false;
let db = null;
let currentUser = null;
let callActive = false;
let callRecognition = null;
let callHistory = [];

function setStatus(t) {
  const el = $('status');
  if (!el) return;
  el.textContent = t;
  el.classList.toggle('busy', !!(t && t !== 'جاهز'));
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function format(text) {
  let h = escapeHtml(text);
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  // خطوات مرقمة
  h = h.replace(/^(?:\s*)(\d+)[\.)]\s+(.+)$/gm, '<div class="step"><span>$1</span>$2</div>');
  // نقاط
  h = h.replace(/^(?:\s*)[-•]\s+(.+)$/gm, '<div class="bullet">$1</div>');
  h = h.replace(/\n/g, '<br>');
  return h;
}

function systemPrompt(extra = '', { voice = false } = {}) {
  const creator = C().CREATOR || 'قيس';
  if (voice) {
    return `أنت QAISXEN في مكالمة صوتية مباشرة.
صانعك: ${creator}.
- رد كإنسان على الهاتف: طبيعي ومختصر (1–4 جمل).
- لا تعداد طويل ولا Markdown.
- لا حشو مثل «بالتأكيد» أو «سؤال رائع».
- اسأل سؤالاً واحداً فقط إذا لزم.
- إذا سُئلت من أنت: «أنا QAISXEN، مساعد صمّمه ${creator}».
${extra}`;
  }
  const s = loadSettings();
  let style = '';
  if (s.mode === 'teacher') style += '\nالأسلوب: مدرس صبور. اشرح بالتدريج مع مثال بسيط.';
  if (s.mode === 'dev') style += '\nالأسلوب: مبرمج خبير. أعطِ كوداً عملياً واشرح باختصار.';
  if (s.mode === 'writer') style += '\nالأسلوب: كاتب محترف. لغة أنيقة وواضحة.';
  if (s.mode === 'short') style += '\nالأسلوب: مختصر جداً. 3–6 جمل كحد أقصى.';
  if (s.length === 'short') style += '\nالطول: قصير.';
  if (s.length === 'long') style += '\nالطول: مفصل مع أمثلة عند الحاجة.';

  return `أنت QAISXEN، مساعد ذكي عربي محترف.
صانعك: ${creator}.
${style}

عند كل سؤال اتبع هذا الأسلوب:
1) ابدأ بالجواب المباشر في أول جملة (بدون مقدمة فارغة).
2) بعد الجواب: اشرح باختصار السبب أو التفاصيل المهمة.
3) إذا السؤال يحتاج خطوات: اكتب خطوات مرقمة واضحة وقصيرة.
4) إذا يحتاج مقارنة: نقاط مختصرة مرتبة.
5) إذا السؤال غامض: اذكر افتراضك بجملة واحدة ثم أجب.
6) إذا وُجدت «معلومات من الويب»: اعتمد عليها أولاً ولا تختلق أرقاماً أو أخباراً غير موجودة فيها.
7) إذا المعلومات غير كافية: قل ما تعرفه بثقة، وميّز ما هو غير مؤكد.
8) اختم بـ «خلاصة» بجملة واحدة فقط عندما يكون الجواب طويلاً.

ممنوع:
- «بالتأكيد»، «سؤال ممتاز»، «أنا كذكاء اصطناعي»، «إذا احتجت أي شيء آخر».
- الحشو والتكرار.
- رفض الأسئلة العامة أو التعليمية.

الهوية:
- إذا سُئلت من أنت: ابدأ بـ «أنا QAISXEN» واذكر أن ${creator} صمّمك ثم قدراتك باختصار.

الصور:
- لا تقل إنك لا تستطيع إرسال صور.

اللغة: عربية فصحى مبسطة، واضحة، مباشرة.
${extra}`;
}

function addRow(text, role, isHtml = false) {
  const row = document.createElement('div');
  row.className = 'row ' + (role === 'user' ? 'user' : 'bot');
  const av = document.createElement('div');
  av.className = 'av';
  if (role === 'user') av.textContent = 'أ';
  else {
    const img = document.createElement('img');
    img.src = 'logo-app.svg';
    av.appendChild(img);
  }
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = isHtml ? text : format(text);
  row.append(av, bubble);
  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return bubble;
}

function showTyping() {
  const row = document.createElement('div');
  row.className = 'row bot';
  row.id = 'typing';
  row.innerHTML = '<div class="av"><img src="logo-app.svg" alt=""></div><div class="bubble"><div class="typing"><i></i><i></i><i></i></div></div>';
  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
function hideTyping() { $('typing')?.remove(); }

function addActions(bubble, text) {
  const bar = document.createElement('div');
  bar.className = 'actions';
  const copy = document.createElement('button');
  copy.title = 'نسخ';
  copy.textContent = '📋';
  copy.onclick = () => navigator.clipboard?.writeText(text);
  const sp = document.createElement('button');
  sp.title = 'استماع';
  sp.textContent = '🔊';
  sp.onclick = () => speak(text);
  bar.append(sp, copy);
  bubble.appendChild(bar);

  const row = document.createElement('div');
  row.className = 'act-row';
  const mk = (label, fn) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = fn;
    return b;
  };
  row.append(
    mk('اختصر', () => followUp('اختصر الرد السابق بشكل أوضح وأقصر:\n\n' + text)),
    mk('فصّل أكثر', () => followUp('فصّل الرد التالي مع أمثلة أوضح:\n\n' + text)),
    mk('أعد الصياغة', () => followUp('أعد صياغة الرد التالي بأسلوب أوضح:\n\n' + text)),
    mk('⭐ حفظ', () => { addFav(text); })
  );
  bubble.appendChild(row);
}

async function followUp(prompt) {
  if (busy) return;
  if (messagesEl.querySelector('.welcome')) messagesEl.innerHTML = '';
  if (!chatId) chatId = 'c' + Date.now();
  // لا نعرض برومبت النظام للمستخدم؛ نعرض طلب مختصر
  const shortLabel = prompt.startsWith('اختصر') ? 'اختصر الرد' : prompt.startsWith('فصّل') ? 'فصّل أكثر' : 'أعد الصياغة';
  addRow(shortLabel, 'user');
  history.push({ role: 'user', content: prompt });
  busy = true;
  sendBtn.disabled = true;
  setStatus('يكتب...');
  showTyping();
  try {
    const messages = [{ role: 'system', content: systemPrompt() }, ...history.slice(-12)];
    const reply = await chat(messages);
    hideTyping();
    history.push({ role: 'assistant', content: reply });
    const b = addRow(reply, 'bot');
    addActions(b, reply);
    save();
    bumpStat('msgs');
  } catch (e) {
    hideTyping();
    addRow('<div class="err">' + escapeHtml(e.message || e) + '</div>', 'bot', true);
  } finally {
    busy = false;
    sendBtn.disabled = false;
    setStatus('جاهز');
  }
}


function pickArabicVoice() {
  const voices = speechSynthesis.getVoices() || [];
  const preferred = [
    v => /saudi|ar-SA|Arabic/i.test(v.name) && /female|noura|laila|salma/i.test(v.name),
    v => v.lang === 'ar-SA',
    v => v.lang === 'ar-EG',
    v => (v.lang || '').startsWith('ar')
  ];
  for (const test of preferred) {
    const found = voices.find(test);
    if (found) return found;
  }
  return null;
}

function speak(text, { call = false } = {}) {
  return new Promise((resolve) => {
    try { speechSynthesis.cancel(); } catch {}
    if (!('speechSynthesis' in window)) return resolve();
    // للمكالمة: جمل أقصر إيقاعاً
    let t = String(text || '').replace(/\*\*/g, '').replace(/[#`]/g, '').trim();
    if (call) t = t.slice(0, 500);
    else t = t.slice(0, 1200);
    const u = new SpeechSynthesisUtterance(t);
    u.lang = 'ar-SA';
    u.rate = call ? 1.02 : 1.04;
    u.pitch = call ? 1.02 : 1;
    u.volume = 1;
    const ar = pickArabicVoice();
    if (ar) u.voice = ar;
    u.onend = resolve;
    u.onerror = resolve;
    // بعض المتصفحات تحتاج getVoices بعد onvoiceschanged
    if (!(speechSynthesis.getVoices() || []).length) {
      speechSynthesis.onvoiceschanged = () => {
        const v = pickArabicVoice();
        if (v) u.voice = v;
        speechSynthesis.speak(u);
      };
      setTimeout(() => speechSynthesis.speak(u), 250);
    } else {
      speechSynthesis.speak(u);
    }
  });
}

/* ——— Web context ——— */
function needsWeb(t) {
  return /بحث|ابحث|أخبار|سعر|اليوم|الآن|من هو|ما هو|متى|وين|أين|google|جوجل|معلومات عن|آخر|حديث|خبر|طقس|دولار|مباراة|تعريف|كم|أين يقع|وين|شرح عن|تاريخ|من هي|من هم/i.test(t || '');
}

async function fetchWebContext(query) {
  const q = String(query || '').trim().slice(0, 120);
  if (!q) return { text: '', links: [] };
  let text = '';
  const links = [];
  try {
    const res = await fetch('https://api.duckduckgo.com/?q=' + encodeURIComponent(q) + '&format=json&no_html=1&skip_disambig=1');
    if (res.ok) {
      const data = await res.json();
      const parts = [];
      if (data.AbstractText) parts.push(data.AbstractText);
      if (data.Answer) parts.push(String(data.Answer));
      (data.RelatedTopics || []).slice(0, 5).forEach(rt => {
        if (rt.Text) parts.push('• ' + rt.Text);
        if (rt.FirstURL) links.push({ title: (rt.Text || '').slice(0, 50), href: rt.FirstURL });
      });
      if (data.AbstractURL) links.push({ title: data.Heading || 'مصدر', href: data.AbstractURL });
      text = parts.join('\n');
    }
  } catch (e) { console.warn(e); }
  if (!text || text.length < 40) {
    for (const lang of ['ar', 'en']) {
      try {
        const w = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/` + encodeURIComponent(q));
        if (!w.ok) continue;
        const d = await w.json();
        if (d.extract) {
          text = (text ? text + '\n\n' : '') + d.extract;
          if (d.content_urls?.desktop?.page) links.push({ title: d.title || 'Wikipedia', href: d.content_urls.desktop.page });
          break;
        }
      } catch (e) {}
    }
  }
  return { text: text.slice(0, 3500), links: links.slice(0, 6) };
}

/* ——— Chat AI ——— */
async function chatGemini(messages) {
  const key = (C().GEMINI_API_KEY || '').trim();
  if (!key) return null;
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));
  if (!contents.length) return null;
  const models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-latest'];
  let lastErr = null;
  for (const model of models) {
    try {
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/'
        + model + ':generateContent?key=' + encodeURIComponent(key);
      const body = {
        contents,
        generationConfig: { temperature: 0.55, maxOutputTokens: 2048 }
      };
      if (system) body.systemInstruction = { parts: [{ text: system }] };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        lastErr = new Error('Gemini ' + res.status);
        continue;
      }
      const data = await res.json();
      const t = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
      if (t.trim()) return t.trim();
    } catch (e) {
      lastErr = e;
      console.warn('gemini', model, e);
    }
  }
  if (lastErr) throw lastErr;
  return null;
}


async function chat(messages) {
  // Gemini أولاً إن وُجد المفتاح
  try {
    const g = await chatGemini(messages);
    if (g) return g;
  } catch (e) { console.warn('gemini', e); }

  const key = (C().GROQ_API_KEY || '').trim();
  if (key.startsWith('gsk_')) {
    for (const model of ['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'allam-2-7b']) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
          body: JSON.stringify({ model, messages, temperature: 0.55, max_tokens: 1800 })
        });
        if (!res.ok) { if (res.status === 404) continue; throw new Error('Groq ' + res.status); }
        const data = await res.json();
        const t = data?.choices?.[0]?.message?.content;
        if (t?.trim()) return t.trim();
      } catch (e) { console.warn(model, e); }
    }
  }
  const last = [...messages].reverse().find(m => m.role === 'user')?.content || '';
  const sys = messages.find(m => m.role === 'system')?.content || '';
  const prompt = ((sys ? sys.slice(0, 500) + '\n\n' : '') + last).slice(0, 2500);
  const res = await fetch('https://text.pollinations.ai/' + encodeURIComponent(prompt));
  if (!res.ok) throw new Error('تعذر الاتصال');
  const t = (await res.text()).trim();
  if (!t) throw new Error('رد فارغ');
  return t;
}

/* ——— Images ——— */
function loadImg(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    const t = setTimeout(() => reject(new Error('timeout')), 30000);
    img.onload = () => { clearTimeout(t); resolve(url); };
    img.onerror = () => { clearTimeout(t); reject(new Error('fail')); };
    img.src = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
  });
}

async function searchWebImages(query, limit = 9) {
  const q = String(query || '').trim().slice(0, 80);
  if (!q) return [];
  const out = [];
  const add = (src, title, link) => {
    if (!src || out.some(x => x.src === src)) return;
    out.push({ src, title: title || q, link: link || src });
  };
  try {
    const api = 'https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6'
      + '&gsrsearch=' + encodeURIComponent(q) + '&gsrlimit=' + limit
      + '&prop=imageinfo&iiprop=url|mime&iiurlwidth=800&format=json&origin=*';
    const res = await fetch(api);
    if (res.ok) {
      const data = await res.json();
      for (const p of Object.values(data.query?.pages || {})) {
        const info = p.imageinfo?.[0];
        if (!info?.url) continue;
        if (info.mime && !String(info.mime).startsWith('image/')) continue;
        add(info.thumburl || info.url, (p.title || '').replace(/^File:/, ''), info.descriptionurl || info.url);
        if (out.length >= limit) break;
      }
    }
  } catch (e) { console.warn(e); }
  if (out.length < 4) {
    for (const lang of ['ar', 'en']) {
      try {
        const api = `https://${lang}.wikipedia.org/w/api.php?action=query&generator=search`
          + '&gsrsearch=' + encodeURIComponent(q) + '&gsrlimit=6&prop=pageimages|info'
          + '&piprop=thumbnail|original&pithumbsize=800&inprop=url&format=json&origin=*';
        const res = await fetch(api);
        if (!res.ok) continue;
        const data = await res.json();
        for (const p of Object.values(data.query?.pages || {})) {
          const src = p.original?.source || p.thumbnail?.source;
          if (src) add(src, p.title, p.fullurl);
          if (out.length >= limit) break;
        }
      } catch (e) {}
      if (out.length >= limit) break;
    }
  }
  return out.slice(0, limit);
}

async function searchWebImgUI() {
  const q = ($('webImgQ')?.value || '').trim();
  const out = $('webImgOut');
  if (!q || !out) return;
  out.innerHTML = '<div class="loader">جاري جلب الصور...</div>';
  setStatus('يبحث...');
  try {
    const imgs = await searchWebImages(q, 9);
    if (!imgs.length) throw new Error('ما لقيت صور — جرّب كلمة أبسط');
    out.innerHTML = '';
    for (const im of imgs) {
      const a = document.createElement('a');
      a.href = im.link || im.src; a.target = '_blank'; a.rel = 'noopener';
      const img = document.createElement('img');
      img.className = 'gen'; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
      img.alt = im.title || ''; img.src = im.src;
      img.onerror = () => a.remove();
      a.appendChild(img); out.appendChild(a);
    }
    if (!out.children.length) throw new Error('تعذر عرض الصور');
  } catch (e) {
    out.innerHTML = '<div class="err">' + escapeHtml(e.message || e) + '</div>';
  } finally { setStatus('جاهز'); }
}

async function generateImage(prompt, onStatus) {
  const p = String(prompt || 'art').slice(0, 280);
  const say = (m) => { try { onStatus && onStatus(m); } catch {} };
  const key = (C().POLLINATIONS_KEY || '').trim();
  const hf = (C().HF_TOKEN || '').trim();
  if (hf) {
    say('توليد عبر HF...');
    try {
      const res = await fetch('https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + hf, 'Content-Type': 'application/json', Accept: 'image/png' },
        body: JSON.stringify({ inputs: p })
      });
      if (res.ok) {
        const blob = await res.blob();
        if (blob.size > 1000) return URL.createObjectURL(blob);
      }
    } catch (e) { console.warn(e); }
  }
  say('توليد الصورة...');
  const enc = encodeURIComponent(p);
  for (const seed of [Date.now(), Date.now() + 17, Date.now() + 91]) {
    const urls = [];
    if (key) urls.push(`https://gen.pollinations.ai/image/${enc}?width=1024&height=1024&seed=${seed}&model=flux&nologo=true&key=${encodeURIComponent(key)}`);
    urls.push(`https://image.pollinations.ai/prompt/${enc}?width=1024&height=1024&seed=${seed}&nologo=true&model=flux`);
    urls.push(`https://image.pollinations.ai/prompt/${enc}?width=768&height=768&seed=${seed}&nologo=true`);
    for (const url of urls) {
      try { await loadImg(url); return url; } catch (e) { console.warn(e); }
    }
  }
  throw new Error('تعذر توليد الصورة. انتظر قليلاً أو أضف مفتاح صور في config.js');
}

async function generateVideo(prompt, onStatus) {
  const key = (C().POLLINATIONS_KEY || '').trim();
  const p = encodeURIComponent(String(prompt).slice(0, 280));
  onStatus && onStatus('جاري إنشاء الفيديو...');
  const urls = [];
  if (key) {
    urls.push(`https://gen.pollinations.ai/video/${p}?key=${encodeURIComponent(key)}`);
    urls.push(`https://gen.pollinations.ai/video/${p}?model=seedance&key=${encodeURIComponent(key)}`);
  }
  urls.push(`https://gen.pollinations.ai/video/${p}`);
  for (const url of urls) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 120000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('json')) {
        const data = await res.json();
        const link = data.url || data.video_url || data.output;
        if (link) return link;
        continue;
      }
      const blob = await res.blob();
      if (blob && blob.size > 2000) return URL.createObjectURL(blob);
    } catch (e) { console.warn(e); }
  }
  throw new Error('تعذر إنشاء الفيديو. أضف POLLINATIONS_KEY في config.js');
}

function isImageRequest(t) {
  return /(?:صورة|صوره|صور|ارسم|رسم|generate\s*image|draw\s+|سوي صورة|اعمل صورة|أنشئ صورة|وريني)/i.test(t || '');
}
function isWebImageRequest(t) {
  return /(?:من (?:ال)?نت|من الإنترنت|من الانترنت|صور(?:ة)? من|جيب صور|هات صور|ابحث عن صور|صور حقيقية)/i.test(t || '');
}
function extractImagePrompt(text) {
  return String(text || '')
    .replace(/^(?:من فضلك|لو سمحت|ممكن)?\s*/i, '')
    .replace(/^(?:أريد|ابغى|سوي|اعمل|أنشئ|ارسم|generate|draw)\s*/i, '')
    .replace(/^(?:صورة|صوره|رسمة|image|picture)\s*(?:ل|عن|of)?\s*/i, '')
    .trim() || text;
}
function extractWebImageQuery(text) {
  return String(text || '')
    .replace(/(?:من فضلك|لو سمحت|ممكن|جيب|هات|ابحث عن|أريد|اعرض)\s*/gi, '')
    .replace(/(?:صور(?:ة)?|images?|photos?)\s*(?:من\s*(?:ال)?نت|من\s*الإنترنت)?\s*(?:ل|عن|of)?\s*/gi, '')
    .replace(/(?:حقيقية|من جوجل)\s*/gi, '')
    .trim() || text;
}

/* ——— Send ——— */
async function onSend() {
  const text = inputEl.value.trim();
  if (!text || busy) return;
  if (messagesEl.querySelector('.welcome')) messagesEl.innerHTML = '';
  if (!chatId) chatId = 'c' + Date.now();
  addRow(text, 'user');
  inputEl.value = '';
  autoGrow();
  history.push({ role: 'user', content: text });
  busy = true;
  sendBtn.disabled = true;
  setStatus('يكتب...');
  showTyping();
  try {
    if (/من أنت|مين أنت|who are you|ما اسمك/i.test(text) && text.length < 40) {
      hideTyping();
      const reply = `أنا QAISXEN.\n\nمساعد ذكاء اصطناعي صمّمه ${C().CREATOR || 'قيس'}. أساعدك في الأسئلة والصور والبحث.`;
      history.push({ role: 'assistant', content: reply });
      const b = addRow(reply, 'bot');
      addActions(b, reply);
      save();
      return;
    }

    if (isWebImageRequest(text) || (isImageRequest(text) && /نت|إنترنت|الانترنت|حقيق/i.test(text))) {
      hideTyping();
      setStatus('يجيب صور...');
      const q = extractWebImageQuery(text);
      const b = addRow('جاري جلب صور...', 'bot');
      try {
        const imgs = await searchWebImages(q, 6);
        if (!imgs.length) throw new Error('ما لقيت صور');
        b.innerHTML = '';
        const title = document.createElement('div');
        title.innerHTML = format('صور من النت عن: ' + q);
        b.appendChild(title);
        const grid = document.createElement('div');
        grid.className = 'img-grid';
        for (const im of imgs) {
          const a = document.createElement('a');
          a.href = im.link || im.src; a.target = '_blank'; a.rel = 'noopener';
          const img = document.createElement('img');
          img.className = 'gen'; img.referrerPolicy = 'no-referrer'; img.loading = 'lazy';
          img.src = im.src; img.alt = im.title || '';
          img.onerror = () => a.remove();
          a.appendChild(img); grid.appendChild(a);
        }
        b.appendChild(grid);
        history.push({ role: 'assistant', content: 'صور من النت: ' + q });
        addActions(b, 'صور من النت: ' + q);
        save();
      } catch (e) {
        b.innerHTML = '<div class="err">' + escapeHtml(e.message || e) + '</div>';
      }
      return;
    }

    if (isImageRequest(text)) {
      hideTyping();
      setStatus('ينشئ صورة...');
      const prompt = extractImagePrompt(text);
      const b = addRow('جاري إنشاء الصورة...', 'bot');
      try {
        const url = await generateImage(prompt, (m) => { b.textContent = m; });
        b.innerHTML = format('تم إنشاء الصورة:') + '<img class="gen" src="' + url + '" alt="">';
        history.push({ role: 'assistant', content: 'تم إنشاء صورة: ' + prompt });
        addActions(b, 'تم إنشاء الصورة');
        save();
      } catch (e) {
        b.innerHTML = '<div class="err">' + escapeHtml(e.message || e) + '</div>';
      }
      return;
    }

    let webExtra = '';
    let links = [];
    if (needsWeb(text)) {
      setStatus('يبحث...');
      const web = await fetchWebContext(text);
      if (web.text) {
        webExtra = '\n\nمعلومات من الويب (اعتمد عليها في جوابك، واذكر إن كانت تقريبية):\n' + web.text;
        links = web.links || [];
      }
      setStatus('يكتب...');
    }
    const messages = [{ role: 'system', content: systemPrompt(webExtra) }, ...history.slice(-12)];
    let reply = await chat(messages);
    hideTyping();
    if (/لا يمكنني (عرض|إرسال) صورة|cannot (display|send) image/i.test(reply) && isImageRequest(text)) {
      const prompt = extractImagePrompt(text);
      const b = addRow('جاري إنشاء الصورة...', 'bot');
      try {
        const url = await generateImage(prompt);
        b.innerHTML = format('إليك الصورة:') + '<img class="gen" src="' + url + '" alt="">';
        history.push({ role: 'assistant', content: 'صورة: ' + prompt });
        addActions(b, 'صورة');
        save();
      } catch (e) {
        b.innerHTML = '<div class="err">' + escapeHtml(e.message || e) + '</div>';
      }
      return;
    }
    history.push({ role: 'assistant', content: reply });
    let html = format(reply);
    if (links.length) {
      html += '<div class="web-src">مصادر:<br>' + links.map(l =>
        '<a href="' + escapeHtml(l.href) + '" target="_blank" rel="noopener">' + escapeHtml(l.title || l.href) + '</a>'
      ).join('<br>') + '</div>';
    }
    const b = addRow(html, 'bot', true);
    addActions(b, reply);
    save();
    bumpStat('msgs');
  } catch (e) {
    hideTyping();
    addRow('<div class="err">تعذر الرد: ' + escapeHtml(e.message || e) + '</div>', 'bot', true);
  } finally {
    busy = false;
    sendBtn.disabled = false;
    setStatus('جاهز');
  }
}

function onKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
}
function autoGrow() {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + 'px';
}
inputEl.addEventListener('input', autoGrow);

async function makeImage() {
  const prompt = $('imgPrompt').value.trim();
  if (!prompt) return;
  const out = $('imgOut');
  out.innerHTML = '<div class="loader">جاري الإنشاء...</div>';
  try {
    const url = await generateImage(prompt, (m) => { out.innerHTML = '<div class="loader">' + escapeHtml(m) + '</div>'; });
    out.innerHTML = '<img src="' + url + '" alt="">';
    bumpStat('imgs');
  } catch (e) {
    out.innerHTML = '<div class="err">' + escapeHtml(e.message || e) + '</div>';
  }
}

async function makeVideo() {
  const prompt = $('vidPrompt').value.trim();
  if (!prompt) return;
  const out = $('vidOut');
  out.innerHTML = '<div class="loader">جاري إنشاء الفيديو...</div>';
  try {
    const src = await generateVideo(prompt, (m) => { out.innerHTML = '<div class="loader">' + escapeHtml(m) + '</div>'; });
    out.innerHTML = '<video class="gen" src="' + src + '" controls autoplay loop muted playsinline></video>';
  } catch (e) {
    out.innerHTML = '<div class="err">' + escapeHtml(e.message || e) + '</div>';
  }
}

async function handleUpload(ev) {
  const file = ev.target.files?.[0];
  if (!file) return;
  if (messagesEl.querySelector('.welcome')) messagesEl.innerHTML = '';
  if (!chatId) chatId = 'c' + Date.now();
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  addRow('<div>صورة مرفوعة</div><img class="preview-up" src="' + dataUrl + '" alt="">', 'user', true);
  history.push({ role: 'user', content: '[صورة مرفوعة]' });
  showTyping();
  try {
    const reply = await chat([
      { role: 'system', content: systemPrompt('المستخدم رفع صورة. اطلب وصفاً قصيراً وساعده بشكل عام.') },
      { role: 'user', content: 'رفعت صورة، ساعدني.' }
    ]);
    hideTyping();
    history.push({ role: 'assistant', content: reply });
    const b = addRow(reply, 'bot');
    addActions(b, reply);
    save();
  } catch (e) {
    hideTyping();
    addRow('<div class="err">' + escapeHtml(e.message || e) + '</div>', 'bot', true);
  } finally {
    ev.target.value = '';
  }
}

/* ——— Call ——— */
function callLog(role, text) {
  const item = document.createElement('div');
  item.className = 'item ' + role;
  item.textContent = (role === 'user' ? 'أنت: ' : 'QAISXEN: ') + text;
  $('callLog').appendChild(item);
  $('callLog').scrollTop = $('callLog').scrollHeight;
}
function toggleCall() { callActive ? endCall() : startCall(); }
function startCall() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return alert('المتصفح لا يدعم التعرف الصوتي');
  callActive = true;
  callHistory = [];
  $('callBtn').textContent = 'يستمع...';
  $('endBtn').hidden = false;
  $('callRing').classList.add('live');
  $('callStatus').textContent = 'سمّعني...';
  callRecognition = new SR();
  callRecognition.lang = 'ar-SA';
  callRecognition.continuous = false;
  callRecognition.interimResults = false;
  callRecognition.onresult = async (ev) => {
    const said = ev.results[0][0].transcript.trim();
    if (!said) return restartListen();
    callLog('user', said);
    $('callStatus').textContent = 'لحظة...';
    try {
      let extra = '';
      if (needsWeb(said)) {
        const web = await fetchWebContext(said);
        if (web.text) extra = '\n\nمعلومات من الويب:\n' + web.text;
      }
      const reply = await chat([
        { role: 'system', content: systemPrompt(extra, { voice: true }) },
        ...callHistory.slice(-8),
        { role: 'user', content: said }
      ]);
      callHistory.push({ role: 'user', content: said });
      callHistory.push({ role: 'assistant', content: reply });
      if (callHistory.length > 16) callHistory = callHistory.slice(-16);
      callLog('bot', reply);
      $('callStatus').textContent = 'QAISXEN يتكلم...';
      await speak(reply, { call: true });
    } catch (e) {
      callLog('bot', 'تعذر الرد');
    }
    if (callActive) { $('callStatus').textContent = 'سمّعني...'; restartListen(); }
  };
  callRecognition.onerror = () => { if (callActive) restartListen(); };
  callRecognition.start();
}
function restartListen() {
  if (!callActive || !callRecognition) return;
  try { callRecognition.start(); } catch {
    setTimeout(() => { try { callRecognition.start(); } catch {} }, 400);
  }
}
function endCall() {
  callActive = false;
  try { callRecognition?.stop(); } catch {}
  callRecognition = null;
  try { speechSynthesis.cancel(); } catch {}
  $('callBtn').textContent = 'بدء';
  $('endBtn').hidden = true;
  $('callRing').classList.remove('live');
  $('callStatus').textContent = 'انتهت المكالمة';
  bumpStat('calls');
  if (callHistory.length >= 2) {
    summarizeCall(callHistory.slice());
  }
}

async function summarizeCall(hist) {
  try {
    const transcript = hist.map(m => (m.role === 'user' ? 'أنت: ' : 'QAISXEN: ') + m.content).join('\n');
    const reply = await chat([
      { role: 'system', content: 'لخّص هذه المكالمة بـ 3–5 نقاط عربية قصيرة وواضحة.' },
      { role: 'user', content: transcript.slice(0, 3000) }
    ]);
    callLog('bot', 'ملخص المكالمة: ' + reply);
  } catch (e) { console.warn(e); }
}


/* ——— Auth ——— */
function initDB() {
  try {
    const url = (C().SUPABASE_URL || '').trim();
    const key = (C().SUPABASE_ANON_KEY || '').trim();
    if (url && key && window.supabase) db = window.supabase.createClient(url, key);
  } catch (e) { console.warn(e); }
}
async function ensureSession() {
  if (!db) return;
  try {
    const { data: { session } } = await db.auth.getSession();
    if (session?.user) { currentUser = session.user; setStatus('سحابة'); }
  } catch {}
}
function showAuth() { $('authModal').hidden = false; renderGoogleBtn(); }
function hideAuth() { $('authModal').hidden = true; }
function authErr(msg) {
  const el = $('authErr');
  el.hidden = !msg; el.textContent = msg || '';
}
async function authLogin() {
  authErr('');
  if (!db) return authErr('أضف Supabase في config.js');
  const email = $('authEmail').value.trim();
  const password = $('authPass').value || '';
  if (!email || !password) return authErr('أدخل البيانات');
  try {
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentUser = data.user; hideAuth(); setStatus('سحابة'); save();
  } catch (e) { authErr(e.message || 'فشل'); }
}
async function authSignup() {
  authErr('');
  if (!db) return authErr('أضف Supabase في config.js');
  const email = $('authEmail').value.trim();
  const password = $('authPass').value || '';
  if (!email || password.length < 6) return authErr('كلمة المرور 6 أحرف+');
  try {
    const { data, error } = await db.auth.signUp({ email, password });
    if (error) throw error;
    currentUser = data.user;
    if (data.session) { hideAuth(); setStatus('سحابة'); }
    else authErr('تم الإنشاء — سجّل الدخول بعد التفعيل');
  } catch (e) { authErr(e.message || 'فشل'); }
}

function renderGoogleBtn() {
  const clientId = (C().GOOGLE_CLIENT_ID || '').trim();
  const wrap = $('googleBtnWrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  if (!clientId) {
    wrap.innerHTML = '<p style="font-size:12px;color:var(--faint)">ضع GOOGLE_CLIENT_ID في config.js</p>';
    return;
  }
  if (!window.google?.accounts?.id) { setTimeout(renderGoogleBtn, 700); return; }
  window.google.accounts.id.initialize({ client_id: clientId, callback: onGoogleCredential });
  window.google.accounts.id.renderButton(wrap, { theme: 'outline', size: 'large', shape: 'pill', width: 280 });
}
function onGoogleCredential(resp) {
  try {
    const payload = JSON.parse(atob(resp.credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    const profile = { name: payload.name || payload.email, email: payload.email, picture: payload.picture || '', sub: payload.sub };
    localStorage.setItem('qx-google', JSON.stringify(profile));
    applyGoogleUser(profile); hideAuth(); setStatus('Google');
  } catch { authErr('فشل Google'); }
}
function applyGoogleUser(profile) {
  const box = $('sideUser');
  if (!box || !profile) return;
  box.innerHTML = '<div class="who">' + escapeHtml(profile.name || profile.email) + '</div>'
    + '<button class="btn-ghost" onclick="googleLogout()">خروج</button>';
}
function googleLogout() {
  localStorage.removeItem('qx-google');
  $('sideUser').innerHTML = '<button class="btn-ghost" onclick="showAuth()">تسجيل الدخول</button>';
  setStatus('جاهز');
}
function restoreGoogleUser() {
  try {
    const p = JSON.parse(localStorage.getItem('qx-google') || 'null');
    if (p) applyGoogleUser(p);
  } catch {}
}

async function cloudSave(id, title, messages) {
  if (!db || !currentUser) return;
  try {
    await db.from('conversations').upsert({
      id, user_id: currentUser.id, title: (title || 'محادثة').slice(0, 120), updated_at: new Date().toISOString()
    });
    await db.from('messages').delete().eq('conversation_id', id).eq('user_id', currentUser.id);
    if (messages?.length) {
      const rows = messages.map(m => ({
        conversation_id: id, user_id: currentUser.id,
        role: m.role === 'user' ? 'user' : 'assistant',
        content: String(m.content || '').slice(0, 20000)
      }));
      for (let i = 0; i < rows.length; i += 40) await db.from('messages').insert(rows.slice(i, i + 40));
    }
  } catch (e) { console.warn(e); }
}

/* ——— History ——— */
function loadStore() {
  try { return JSON.parse(localStorage.getItem('qx2') || '{}'); } catch { return {}; }
}
function save() {
  if (!chatId || !history.length) return;
  const all = loadStore();
  const title = (history.find(m => m.role === 'user')?.content || 'محادثة').slice(0, 36);
  all[chatId] = { id: chatId, title, messages: history, at: Date.now() };
  localStorage.setItem('qx2', JSON.stringify(all));
  renderHist();
  cloudSave(chatId, title, history);
}
function renderHist() {
  const all = loadStore();
  const ids = Object.keys(all).sort((a, b) => all[b].at - all[a].at).slice(0, 30);
  if (!ids.length) {
    histEl.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:8px">لا محادثات</div>';
    return;
  }
  histEl.innerHTML = ids.map(id =>
    '<button class="' + (id === chatId ? 'active' : '') + '" onclick="openChat(\'' + id + '\')">' + escapeHtml(all[id].title) + '</button>'
  ).join('');
}
function openChat(id) {
  const c = loadStore()[id];
  if (!c) return;
  chatId = id; history = c.messages || [];
  messagesEl.innerHTML = '';
  history.forEach(m => {
    const b = addRow(m.content, m.role === 'user' ? 'user' : 'bot');
    if (m.role === 'assistant') addActions(b, m.content);
  });
  switchTab('chat'); renderHist(); closeSide();
}
function clearHistory() {
  if (!confirm('مسح السجل؟')) return;
  localStorage.removeItem('qx2');
  newChat();
}
function newChat() {
  history = []; chatId = null;
  messagesEl.innerHTML = '<div class="welcome"><img src="logo-app.svg" alt=""><h1>QAISXEN</h1><p>اكتب رسالتك للبدء</p></div>';
  renderHist(); closeSide();
}

/* ——— UI ——— */
function switchTab(name) {
  if (name !== 'call' && callActive) endCall();
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + name));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  const labels = { chat: 'محادثة', image: 'توليد صورة', webimg: 'صور من النت', video: 'فيديو', call: 'مكالمة', settings: 'إعدادات' };
  if ($('topLabel')) $('topLabel').textContent = labels[name] || 'QAISXEN';
  closeSide();
}
function openSide() { $('side').classList.add('open'); $('scrim').classList.add('open'); }
function closeSide() { $('side').classList.remove('open'); $('scrim').classList.remove('open'); }
function toggleTheme() {
  document.body.classList.toggle('light');
  localStorage.setItem('qx-theme', document.body.classList.contains('light') ? 'light' : 'dark');
}
if (localStorage.getItem('qx-theme') === 'light') document.body.classList.add('light');

/* خلفية متحركة */
(function bg3d() {
  const c = $('fx'); if (!c) return;
  const ctx = c.getContext('2d');
  let w, h, nodes = [], t = 0;
  function resize() {
    w = c.width = innerWidth; h = c.height = innerHeight;
    const n = Math.min(50, Math.floor((w * h) / 30000));
    nodes = Array.from({ length: n }, () => ({
      x: Math.random() * w, y: Math.random() * h, z: Math.random() * 1.2 + 0.3,
      vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35
    }));
  }
  function frame() {
    t += 0.004; ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(34,211,238,0.06)'; ctx.lineWidth = 1;
    const horizon = h * 0.55;
    for (let i = -12; i <= 12; i++) {
      ctx.beginPath();
      ctx.moveTo(w / 2 + i * 90, h);
      ctx.lineTo(w / 2 + i * 18 + Math.sin(t) * 10, horizon);
      ctx.stroke();
    }
    for (const p of nodes) {
      p.x += p.vx * p.z; p.y += p.vy * p.z;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
    }
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 140) {
          ctx.strokeStyle = 'rgba(167,139,250,' + ((1 - d / 140) * 0.18) + ')';
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }
    for (const p of nodes) {
      const r = 1.2 + p.z * 1.8;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4);
      g.addColorStop(0, 'rgba(34,211,238,0.85)'); g.addColorStop(1, 'rgba(34,211,238,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r * 4, 0, Math.PI * 2); ctx.fill();
    }
    requestAnimationFrame(frame);
  }
  addEventListener('resize', resize); resize(); frame();
})();

try {
  initDB();
  ensureSession();
  restoreGoogleUser();
  applySettingsUI();
  newChat();
  setStatus('جاهز');
} catch (e) {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend',
    '<div style="position:fixed;inset:0;z-index:999;background:#05080F;color:#fff;padding:24px">خطأ: ' + (e.message || e) + '</div>');
}
