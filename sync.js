/* انطلاقة — المزامنة وتسجيل الدخول (Supabase عبر REST، بلا مكتبات خارجية) */
(function () {
  const CFG = window.INTILAQA_CONFIG || {};
  if (!CFG.url || !CFG.key) return; // بدون إعداد: يعمل التطبيق محلياً كما كان
  const BASE = CFG.url.replace(/\/+$/, ''), KEY = CFG.key;
  const SKEY = 'intilaqa_session', CACHE = 'intilaqa_items_cache', PROF = 'intilaqa_profile';
  const PAGES = { chair: 'chair.html', head: 'dashboard.html', research: 'research.html', clinic: 'clinic.html', academy: 'academy.html', students: 'students.html', evidence: 'evidence.html', student: 'student.html' };
  const UNIT_AR = { research: 'فرق إنجاز البحوث', clinic: 'العيادة الرقمية', academy: 'أكاديمية المهارات', students: 'باحث المستقبل', evidence: 'المقرّرة والأدلة' };
  const ROLE_AR = { chair: 'رئيسة اللجنة', member: 'عضو', head: 'رئيس القسم', student: 'طالب' };
  let PAGE = 'index';
  const ls = { get(k) { try { return JSON.parse(localStorage.getItem(k)) } catch (e) { return null } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch (e) { } }, del(k) { try { localStorage.removeItem(k) } catch (e) { } } };
  const h = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let session = ls.get(SKEY), profile = ls.get(PROF), snapshot = {}, pushing = false, dirtyT = null, pending = false, status = 'ok';

  /* ---------- HTTP ---------- */
  async function authFetch(path, body) {
    const r = await fetch(BASE + '/auth/v1/' + path, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.msg || j.error_description || j.message || ('خطأ ' + r.status)), { code: j.error_code || j.code, status: r.status });
    return j;
  }
  function keepSession(j) {
    if (!j.access_token) return false;
    session = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || (Math.floor(Date.now() / 1000) + (j.expires_in || 3600)), user: j.user };
    ls.set(SKEY, session); return true;
  }
  async function refresh() {
    if (!session) throw new Error('no session');
    try { keepSession(await authFetch('token?grant_type=refresh_token', { refresh_token: session.refresh_token })) }
    catch (e) { if (e.status && e.status < 500) { logout(true); } throw e; }
  }
  async function api(method, path, body, extra = {}, raw = false) {
    if (session && session.expires_at - 60 < Date.now() / 1000) await refresh();
    const go = () => fetch(BASE + path, { method, headers: Object.assign({ apikey: KEY }, session ? { Authorization: 'Bearer ' + session.access_token } : (/^eyJ/.test(KEY) ? { Authorization: 'Bearer ' + KEY } : {}), body !== undefined && !(body instanceof Blob) ? { 'Content-Type': 'application/json' } : {}, extra.headers || {}), body: body === undefined ? undefined : (body instanceof Blob ? body : JSON.stringify(body)) });
    let r = await go();
    if (r.status === 401 && session) { await refresh(); r = await go(); }
    if (!r.ok) { const t = await r.text(); throw Object.assign(new Error(t || ('خطأ ' + r.status)), { status: r.status }); }
    if (raw) return r;
    const t = await r.text(); return t ? JSON.parse(t) : null;
  }
  const rest = (m, p, b, hd) => api(m, '/rest/v1/' + p, b, { headers: hd });
  const inList = ids => 'in.(' + ids.map(i => '"' + String(i).replace(/"/g, '') + '"').join(',') + ')';

  /* ---------- status pill + logout ---------- */
  function setStatus(s) {
    status = s; let el = document.getElementById('syncPill');
    if (!el) {
      el = document.createElement('div'); el.id = 'syncPill';
      el.style.cssText = 'position:fixed;z-index:25;bottom:calc(12px + env(safe-area-inset-bottom,0px));left:calc(12px + env(safe-area-inset-left,0px));display:flex;gap:6px;align-items:center;background:#fff;border:1px solid #e4eaf2;border-radius:20px;padding:5px 6px 5px 12px;font:13px Tajawal,Tahoma,Arial,sans-serif;color:#1c3768;box-shadow:0 6px 18px rgba(28,55,104,.12);direction:rtl';
      document.body.appendChild(el);
    }
    const txt = { ok: '☁️ متزامن', saving: '⏳ جارٍ الحفظ…', offline: '📴 بدون نت — سيُحفظ عند الاتصال', error: '⚠️ لم يُحفظ — إعادة المحاولة' }[s];
    el.innerHTML = `<span>${txt}</span>${profile ? `<span style="color:#6b7a8c">· ${h(profile.name || profile.email)}</span>` : ''}<button id="syncOut" style="border:0;background:#eef3fa;color:#1c3768;border-radius:14px;padding:3px 10px;font:inherit;cursor:pointer">خروج</button>`;
    el.querySelector('#syncOut').onclick = () => logout();
  }
  function logout(silent) {
    try { if (session) fetch(BASE + '/auth/v1/logout', { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + session.access_token } }) } catch (e) { }
    session = null; profile = null; ls.del(SKEY); ls.del(PROF); ls.del(CACHE);
    if (!silent) location.replace('index.html');
  }

  /* ---------- login screen ---------- */
  function loginScreen(msg) {
    return new Promise(resolve => {
      const m = document.createElement('div'); m.id = 'loginWrap';
      m.style.cssText = 'position:fixed;inset:0;z-index:40;background:linear-gradient(160deg,#f4f8fc,#e6eef8);overflow:auto;direction:rtl;font-family:Tajawal,Tahoma,Arial,sans-serif;color:#26364a';
      const logo = typeof LOGO_PROG !== 'undefined' ? LOGO_PROG : '';
      m.innerHTML = `<div style="max-width:420px;margin:0 auto;padding:max(28px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) 40px max(16px,env(safe-area-inset-left))">
      <div style="text-align:center"><img src="icon-192.png" alt="" style="width:84px;border-radius:20px;box-shadow:0 8px 20px rgba(28,55,104,.15)"><h1 style="color:#1c3768;margin:10px 0 2px;font-size:28px">انطلاقة</h1><div style="color:#6b7a8c;font-size:14px">برنامج تفعيل البحث العلمي وخدمة المجتمع</div></div>
      <div style="background:#fff;border:1px solid #e4eaf2;border-radius:20px;padding:18px;margin-top:18px">
       <div id="lgTabs" style="display:grid;grid-template-columns:1fr 1fr;background:#eef3fa;border-radius:12px;padding:4px;margin-bottom:12px"><button data-t="in" style="border:0;border-radius:9px;padding:9px;font-weight:700;font-size:15px;font-family:inherit;background:#fff;color:#1c3768;cursor:pointer">دخول</button><button data-t="up" style="border:0;border-radius:9px;padding:9px;font-weight:700;font-size:15px;font-family:inherit;background:none;color:#6b7a8c;cursor:pointer">حساب جديد</button></div>
       <form id="lgForm" novalidate>
        <label id="lgNameL" style="display:none;font-size:13px;color:#6b7a8c">الاسم الكامل<input id="lgName" autocomplete="name" style="display:block;width:100%;box-sizing:border-box;margin:4px 0 10px;border:1px solid #e4eaf2;border-radius:12px;padding:11px;font-size:15px;font-family:inherit"></label>
        <label style="font-size:13px;color:#6b7a8c">البريد الإلكتروني<input id="lgEmail" type="email" autocomplete="email" dir="ltr" style="display:block;width:100%;box-sizing:border-box;margin:4px 0 10px;border:1px solid #e4eaf2;border-radius:12px;padding:11px;font-size:15px;font-family:inherit;text-align:left"></label>
        <label style="font-size:13px;color:#6b7a8c">كلمة المرور<input id="lgPass" type="password" autocomplete="current-password" dir="ltr" style="display:block;width:100%;box-sizing:border-box;margin:4px 0 6px;border:1px solid #e4eaf2;border-radius:12px;padding:11px;font-size:15px;font-family:inherit;text-align:left"></label>
        <div id="lgMsg" style="min-height:22px;font-size:13px;color:#c0392b;margin:4px 0">${h(msg || '')}</div>
        <button id="lgGo" type="submit" style="width:100%;border:0;border-radius:14px;padding:13px;background:#1c3768;color:#fff;font-weight:800;font-size:17px;font-family:inherit;cursor:pointer">دخول</button>
        <button id="lgForgot" type="button" style="width:100%;border:0;background:none;color:#2e7bd6;font-size:14px;font-family:inherit;margin-top:10px;cursor:pointer">نسيت كلمة المرور؟</button>
       </form></div>
       <div style="font-size:12.5px;color:#6b7a8c;text-align:center;margin-top:14px;line-height:1.7">الأعضاء: سجّلوا بالبريد الذي أضافته رئيسة اللجنة.<br>الطلاب: أنشئوا حساباً جديداً ببريدكم.</div></div>`;
      document.body.appendChild(m);
      let mode = 'in';
      const $m = s => m.querySelector(s), say = (t, ok) => { $m('#lgMsg').style.color = ok ? '#3e8c00' : '#c0392b'; $m('#lgMsg').textContent = t };
      m.querySelector('#lgTabs').onclick = e => { const b = e.target.closest('[data-t]'); if (!b) return; mode = b.dataset.t; m.querySelectorAll('#lgTabs button').forEach(x => { const on = x === b; x.style.background = on ? '#fff' : 'none'; x.style.color = on ? '#1c3768' : '#6b7a8c' }); $m('#lgNameL').style.display = mode === 'up' ? 'block' : 'none'; $m('#lgGo').textContent = mode === 'up' ? 'إنشاء الحساب' : 'دخول'; $m('#lgPass').autocomplete = mode === 'up' ? 'new-password' : 'current-password'; say('') };
      $m('#lgForgot').onclick = async () => { const em = $m('#lgEmail').value.trim(); if (!em) { say('اكتب بريدك أولاً ثم اضغط «نسيت كلمة المرور»'); return } try { await authFetch('recover', { email: em }); say('أرسلنا رابط تعيين كلمة مرور جديدة إلى بريدك ✉️', true) } catch (e) { say('تعذّر الإرسال: ' + e.message) } };
      $m('#lgForm').onsubmit = async e => {
        e.preventDefault(); const em = $m('#lgEmail').value.trim().toLowerCase(), pw = $m('#lgPass').value, nm = $m('#lgName').value.trim();
        if (!em || !pw) { say('اكتب البريد وكلمة المرور'); return }
        if (mode === 'up' && pw.length < 6) { say('كلمة المرور 6 أحرف على الأقل'); return }
        if (mode === 'up' && !nm) { say('اكتب اسمك'); return }
        $m('#lgGo').disabled = true; $m('#lgGo').textContent = '…';
        try {
          const j = mode === 'up' ? await authFetch('signup', { email: em, password: pw, data: { name: nm } }) : await authFetch('token?grant_type=password', { email: em, password: pw });
          if (!keepSession(j)) { say('تم إنشاء الحساب. افتح رسالة التفعيل في بريدك ثم سجّل الدخول.', true); $m('#lgGo').disabled = false; $m('#lgGo').textContent = 'دخول'; return }
          m.remove(); resolve();
        } catch (err) {
          const t = /invalid login|invalid_credentials/i.test(err.message + err.code) ? 'البريد أو كلمة المرور غير صحيحة' : /already registered|user_already_exists/i.test(err.message + err.code) ? 'هذا البريد مسجّل من قبل، اختر «دخول»' : /fetch|network/i.test(err.message) ? 'لا يوجد اتصال بالإنترنت' : err.message;
          say(t); $m('#lgGo').disabled = false; $m('#lgGo').textContent = mode === 'up' ? 'إنشاء الحساب' : 'دخول';
        }
      };
    });
  }
  async function recoveryFlow() {
    const p = new URLSearchParams(location.hash.slice(1)); if (p.get('type') !== 'recovery' || !p.get('access_token')) return false;
    keepSession({ access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_in: +p.get('expires_in') || 3600 });
    history.replaceState(null, '', location.pathname);
    await new Promise(res => {
      const m = document.createElement('div'); m.style.cssText = 'position:fixed;inset:0;z-index:41;background:#f4f8fc;display:flex;align-items:center;justify-content:center;padding:16px;direction:rtl;font-family:Tajawal,Tahoma,Arial,sans-serif';
      m.innerHTML = `<form style="background:#fff;border:1px solid #e4eaf2;border-radius:20px;padding:20px;max-width:380px;width:100%"><b style="color:#1c3768;font-size:18px">كلمة مرور جديدة</b><input id="np" type="password" autocomplete="new-password" dir="ltr" style="display:block;width:100%;box-sizing:border-box;margin:12px 0;border:1px solid #e4eaf2;border-radius:12px;padding:11px"><div id="nm" style="color:#c0392b;font-size:13px;min-height:20px"></div><button style="width:100%;border:0;border-radius:14px;padding:12px;background:#1c3768;color:#fff;font-weight:800;font-size:16px;font-family:inherit">حفظ</button></form>`;
      document.body.appendChild(m);
      m.querySelector('form').onsubmit = async e => { e.preventDefault(); const pw = m.querySelector('#np').value; if (pw.length < 6) { m.querySelector('#nm').textContent = '6 أحرف على الأقل'; return } try { await api('PUT', '/auth/v1/user', { password: pw }); m.remove(); res() } catch (err) { m.querySelector('#nm').textContent = err.message } };
    });
    return true;
  }

  /* ---------- data mapping ---------- */
  const unitOf = { ideas: x => x.role, tasks: x => x.role, research: () => 'research', acts: x => x.role, students: () => 'students', partners: () => 'chair', evidence: x => x.role === 'students' && x.fromStudent ? null : x.role };
  function canWrite(unit) { if (!profile) return false; if (profile.role === 'chair') return true; if (profile.role === 'member') return unit === profile.unit; return false }
  function studentEntry(it) {
    const d = it.data || {};
    return { id: 'app:' + it.id, sid: it.owner, fromApp: true, name: d.name || '', team: d.team || '', sem: d.sem || '', ava: d.ava || '', hours: (d.hours || []).reduce((p, x) => p + (+x.h || 0), 0), hoursLog: d.hours || [], tasks: (d.tasks || []).map(t => ({ id: t.id, task: t.task, due: t.due || '', status: t.status })), lastReport: (it.updated_at || '').slice(0, 7) };
  }
  function confirm2(msg, ok) { return new Promise(res => { const m = document.createElement('div'); m.style.cssText = 'position:fixed;inset:0;background:rgba(20,30,50,.4);display:flex;align-items:center;justify-content:center;z-index:99;padding:16px'; m.innerHTML = `<div style="background:#fff;border-radius:16px;padding:18px;max-width:420px;width:100%;line-height:1.7"><b>${msg}</b><div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end"><button data-n class="btn l sm">إلغاء</button><button data-y class="btn sm" style="background:#c0392b;color:#fff;border:0">${ok}</button></div></div>`; document.body.appendChild(m); m.onclick = e => { if (e.target.closest('[data-y]')) { m.remove(); res(true) } else if (e.target.closest('[data-n]') || e.target === m) { m.remove(); res(false) } } }) }
  let ARCH = {};
  async function archiveYear(year, state) { await rest('POST', 'items', [{ id: 'archive-' + year, kind: 'archive', unit: 'chair', data: { year, date: new Date().toISOString().slice(0, 10), state } }], { Prefer: 'resolution=merge-duplicates,return=minimal' }) }
  async function getArchive(id) { if (ARCH[id]) return ARCH[id]; const r = await rest('GET', 'items?select=data&id=eq.' + encodeURIComponent(id)); return r[0].data }
  async function removeStudent(uid, quiet) {
    try {
      const list = await api('POST', '/storage/v1/object/list/evidence', { prefix: 'student/' + uid + '/', limit: 1000 });
      const names = (list || []).map(f => 'student/' + uid + '/' + f.name);
      if (names.length) await api('DELETE', '/storage/v1/object/evidence', { prefixes: names });
    } catch (e) { }
    await rest('POST', 'rpc/remove_student', { p_id: uid });
    if (session && uid === session.user.id) { logout(true); location.replace(PAGES.student || 'student.html'); return }
    if (!quiet) { await pull(); window.__rawRender && window.__rawRender(); if (document.getElementById('v-admin')) renderAdmin() }
  }
  function applyItems(items) {
    ls.set(CACHE, items);
    if (PAGE === 'student') {
      const mine = items.find(i => i.kind === 'student' && i.owner === session.user.id);
      if (mine) { const keep = { lastSent: S.lastSent }; S = Object.assign({}, mine.data, keep); }
      else if (!S.setup) { S.name = S.name || profile.name || ''; }
      S.sid = session.user.id; snapshot = { ['student:' + session.user.id]: mine ? JSON.stringify(mine.data) : '' };
      return;
    }
    const by = k => items.filter(i => i.kind === k).map(i => i.data);
    S.tasks = by('tasks'); S.ideas = by('ideas'); S.research = by('research'); S.acts = by('acts'); S.partners = by('partners');
    const kp = items.find(i => i.id === 'kpi'); if (kp) S.kpi = kp.data || {};
    const stuApp = items.filter(i => i.kind === 'student');
    S.students = by('students').concat(stuApp.map(studentEntry));
    S.evidence = by('evidence');
    stuApp.forEach(it => (it.data.evidence || []).forEach(ev => { if (ev.path) S.evidence.push({ id: ev.id, role: 'students', fromStudent: true, name: ev.name, size: ev.size, type: ev.type, link: 's:app:' + it.id, cat: 'دليل طالب', added: ev.added, path: ev.path }) }));
    ARCH = {}; S.archives = items.filter(i => i.kind === 'archive').map(i => { ARCH[i.id] = i.data; return { id: i.id, year: (i.data || {}).year, date: (i.data || {}).date } }).sort((a, b) => b.year - a.year);
    snapshot = {}; items.forEach(i => { if (i.kind !== 'student' && i.kind !== 'archive') snapshot[i.id] = JSON.stringify(i.data) });
  }
  function currentRows() {
    if (PAGE === 'student') { const d = Object.assign({}, S); delete d.lastSent; return [{ id: 'student:' + session.user.id, kind: 'student', unit: 'student', data: d }] }
    const rows = [];
    for (const k of ['tasks', 'ideas', 'research', 'acts', 'students', 'partners', 'evidence']) for (const x of (S[k] || [])) {
      if (x.fromApp || x.fromStudent) continue; const u = unitOf[k](x); if (!u || !canWrite(u)) continue; rows.push({ id: x.id, kind: k, unit: u, data: x });
    }
    if (canWrite('chair')) rows.push({ id: 'kpi', kind: 'kpi', unit: 'chair', data: S.kpi || {} });
    return rows;
  }

  /* ---------- files ---------- */
  const ext = n => ((n || '').match(/\.([a-z0-9]{1,6})$/i) || [, 'bin'])[1].toLowerCase();
  function pathFor(ev) { return PAGE === 'student' ? `student/${session.user.id}/${ev.id}.${ext(ev.name)}` : `${ev.role}/${ev.id}.${ext(ev.name)}` }
  async function uploadMissing() {
    for (const ev of (S.evidence || [])) {
      if (ev.path || ev.fromStudent) continue;
      if (PAGE !== 'student' && !canWrite(ev.role)) continue;
      const blob = await window.__getFLocal(ev.id); if (!blob) continue;
      const p = pathFor(ev);
      await api('POST', '/storage/v1/object/evidence/' + p, blob, { headers: { 'x-upsert': 'true', 'Content-Type': blob.type || 'application/octet-stream' } });
      ev.path = p;
    }
  }
  async function fetchFile(id) {
    const ev = (S.evidence || []).find(e => e.id === id); if (!ev || !ev.path || !session) return null;
    const r = await api('GET', '/storage/v1/object/authenticated/evidence/' + ev.path, undefined, {}, true);
    return await r.blob();
  }

  /* ---------- push / pull ---------- */
  async function push() {
    if (pushing) { pending = true; return } if (!profile || profile.role === 'head') return;
    pushing = true; setStatus('saving');
    try {
      await uploadMissing();
      const rows = currentRows(), changed = rows.filter(r => snapshot[r.id] !== JSON.stringify(r.data));
      if (changed.length) await rest('POST', 'items', changed, { Prefer: 'resolution=merge-duplicates,return=minimal' });
      if (PAGE !== 'student') {
        const ids = new Set(rows.map(r => r.id)), gone = Object.keys(snapshot).filter(id => !ids.has(id) && id !== 'kpi');
        const cached = ls.get(CACHE) || [], del = gone.filter(id => { const it = cached.find(i => i.id === id); return it && canWrite(it.unit) });
        if (del.length) await rest('DELETE', 'items?id=' + inList(del), undefined, { Prefer: 'return=minimal' });
        del.forEach(id => delete snapshot[id]);
      }
      rows.forEach(r => snapshot[r.id] = JSON.stringify(r.data));
      setStatus('ok');
    } catch (e) { setStatus(navigator.onLine === false || /fetch|network/i.test(e.message) ? 'offline' : 'error'); pending = true; if (e.status && e.status < 500 && e.status !== 401) console.warn(e) }
    pushing = false;
    if (pending) { pending = false; setTimeout(push, status === 'ok' ? 50 : 8000) }
  }
  function dirty() { clearTimeout(dirtyT); setStatus('saving'); dirtyT = setTimeout(() => { dirtyT = null; push() }, 700) }
  async function pull() {
    if (pushing || dirtyT) return;
    try {
      const items = await rest('GET', 'items?select=id,kind,unit,owner,data,updated_at&order=id');
      const before = JSON.stringify(ls.get(CACHE)); if (before === JSON.stringify(items)) { setStatus('ok'); return }
      applyItems(items); window.__rawRender && window.__rawRender(); setStatus('ok');
    } catch (e) { setStatus(/fetch|network/i.test(e.message) ? 'offline' : status) }
  }

  /* ---------- chair: members & permissions ---------- */
  async function renderAdmin() {
    const el = document.getElementById('v-admin'); if (!el) return;
    if (profile.role !== 'chair') { el.innerHTML = '<div class="card">هذه الصفحة لرئيسة اللجنة فقط.</div>'; return }
    el.innerHTML = '<h2>الأعضاء والصلاحيات</h2><div class="card">جارٍ التحميل…</div>';
    let al = [], pr = [];
    try { [al, pr] = await Promise.all([rest('GET', 'allowlist?select=*&order=role,email'), rest('GET', 'profiles?select=*&order=role,name')]) } catch (e) { el.innerHTML = '<h2>الأعضاء والصلاحيات</h2><div class="card">لا يوجد اتصال بالإنترنت.</div>'; return }
    const reg = new Set(pr.map(p => (p.email || '').toLowerCase()));
    const studs = pr.filter(p => p.role === 'student');
    el.innerHTML = `<h2>الأعضاء والصلاحيات</h2>
    <div class="card"><b>➕ إضافة عضو</b><div style="font-size:13px;color:var(--muted);margin:4px 0 8px">أضيفي بريد العضو هنا، ثم أرسلي له الرابط ليُنشئ حساباً بنفس البريد، فيأخذ صلاحيته تلقائياً.</div>
     <div class="grid g2"><label class="f">الاسم<input id="adName" placeholder="د. ..."></label><label class="f">البريد الإلكتروني<input id="adEmail" type="email" dir="ltr"></label>
     <label class="f">الدور<select id="adRole"><option value="member">عضو لجنة</option><option value="head">رئيس القسم (اطلاع فقط)</option><option value="chair">رئيسة اللجنة</option></select></label>
     <label class="f" id="adUnitL">القسم الذي يديره<select id="adUnit">${Object.entries(UNIT_AR).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label></div>
     <button class="btn" id="adAdd" style="margin-top:10px">إضافة</button> <span id="adMsg" style="font-size:13px"></span></div>
    <h2>من له صلاحية</h2><div class="card">${al.map(a => `<div class="mem"><span><b>${h(a.name || '—')}</b><br><span style="font-size:12px;color:var(--muted)" dir="ltr">${h(a.email)}</span><br><span class="tag" style="background:#eef3fa">${ROLE_AR[a.role]}${a.unit ? ' · ' + UNIT_AR[a.unit] : ''}</span> ${reg.has(a.email.toLowerCase()) ? '<span class="tag done">✓ سجّل</span>' : '<span class="tag" style="background:#fff6df;color:#8a5a00">لم يسجّل بعد</span>'}</span>${a.role === 'chair' && al.filter(x => x.role === 'chair').length < 2 ? '' : `<button class="btn red sm" data-adDel="${h(a.email)}">إزالة</button>`}</div>`).join('') || '—'}</div>
    <h2>الطلاب المسجّلون (${studs.length})</h2><div class="card">${studs.map(s => `<div class="mem"><span>${h(s.name || '—')} <span style="font-size:12px;color:var(--muted)" dir="ltr">${h(s.email)}</span></span><span style="display:flex;gap:6px;align-items:center"><span class="tag" style="background:#eaf6db;color:#3e6b00">طالب</span><button class="btn light sm" data-goStud>عرض</button><button class="btn red sm" data-rmstu="${h(s.id)}" data-nm="${h(s.name || '')}">حذف</button></span></div>`).join('') || '<div style="color:var(--muted)">لم يسجّل طلاب بعد. أرسلي لهم رابط student.html</div>'}</div>
    ${window.newYearHTML ? newYearHTML() : ''}
    <div class="note">🔒 الصلاحيات يفرضها الخادم: كل عضو يرى ويعدّل قسمه فقط، ورئيس القسم يطّلع فقط، وأ. «باحث المستقبل» يرى بيانات الطلاب، والطالب يرى بياناته فقط.</div>`;
    const syncUnit = () => { el.querySelector('#adUnitL').style.display = el.querySelector('#adRole').value === 'member' ? '' : 'none' }; syncUnit();
    el.querySelector('#adRole').onchange = syncUnit;
    el.querySelector('#adAdd').onclick = async () => {
      const email = el.querySelector('#adEmail').value.trim().toLowerCase(), name = el.querySelector('#adName').value.trim(), role = el.querySelector('#adRole').value, unit = role === 'member' ? el.querySelector('#adUnit').value : null;
      const msg = el.querySelector('#adMsg'); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg.style.color = 'var(--late)'; msg.textContent = 'اكتبي بريداً صحيحاً'; return }
      try { await rest('POST', 'allowlist', [{ email, name, role, unit }], { Prefer: 'resolution=merge-duplicates,return=minimal' }); toast && toast('✓ أُضيف ' + (name || email)); renderAdmin() } catch (e) { msg.style.color = 'var(--late)'; msg.textContent = 'تعذّرت الإضافة: ' + e.message }
    };
    el.querySelectorAll('[data-goStud]').forEach(b => b.onclick = () => { const n = document.querySelector('#nav [data-v=stud]'); n && n.click(); scrollTo(0, 0) });
    el.querySelectorAll('[data-adDel]').forEach(b => b.onclick = async () => { if (!(await ask('إزالة صلاحية ' + b.dataset.addel + '؟', 'إزالة'))) return; try { await rest('DELETE', 'allowlist?email=eq.' + encodeURIComponent(b.dataset.addel)); renderAdmin() } catch (e) { toast && toast('تعذّرت الإزالة') } });
  }

  /* ---------- after each render: adapt the page to online mode ---------- */
  function afterRender() {
    if (PAGE === 'student') {
      const s = document.getElementById('send'); if (s) { const card = s.closest('.card'); const h2 = card && card.previousElementSibling; if (h2) h2.textContent = '☁️ إنجازك يصل تلقائياً'; if (card) card.innerHTML = '<p style="margin:0">كل ما تسجّله يُحفظ ويصل لمشرف «باحث المستقبل» ورئيسة اللجنة تلقائياً، ويظهر اسمك في «نجوم انطلاقة» على شاشات الكلية ⭐</p><div style="margin-top:12px;border-top:1px dashed #e4eaf2;padding-top:10px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><span style="font-size:13px;color:#6b7a8c">تريد مغادرة البرنامج؟</span><button class="btn l sm" id="delMe" style="color:#c0392b">🗑️ حذف حسابي وبياناتي</button></div>';
        const dm = document.getElementById('delMe'); if (dm) dm.onclick = async () => { if (!(await confirm2('حذف حسابك وكل مهامك وساعاتك وأدلتك نهائياً؟ لا يمكن التراجع.', 'حذف حسابي'))) return; try { await removeStudent(session.user.id) } catch (e) { (window.toast ? toast('تعذّر الحذف، تأكد من الاتصال بالإنترنت') : 0) } } }
      return;
    }
    const send = document.getElementById('v-send');
    if (send && PAGE !== 'chair') send.innerHTML = `<h2>☁️ المزامنة التلقائية</h2><div class="card"><p style="margin-top:0">كل تحديث تسجّله يُحفظ مباشرة ويظهر عند رئيسة اللجنة فوراً، فلا حاجة لإرسال تقارير شهرية.</p><div style="font-size:14px;color:var(--muted)">الحالة: ${{ ok: '☁️ متزامن', saving: '⏳ جارٍ الحفظ', offline: '📴 بدون نت — سيُحفظ عند الاتصال', error: '⚠️ إعادة المحاولة' }[status]}</div></div><h2>نسخة احتياطية لجهازك</h2><div class="card"><button class="btn line" id="bk">💾 حفظ نسخة احتياطية</button></div>`;
    const imp = document.getElementById('stuImp'); if (imp) { const c = imp.closest('.card'); if (c) c.innerHTML = '<b>☁️ بيانات الطلاب تصل تلقائياً</b><div style="font-size:14px;color:var(--muted);margin-top:4px">كل طالب يسجّل في صفحة الطلاب، وتظهر مهامه وساعاته وأدلته هنا مباشرة.</div>' }
    if (profile && profile.role === 'head') { document.body.classList.add('ro'); const wn = document.getElementById('whoName'), wt = document.getElementById('whoTitle'), av = document.getElementById('av'); if (wn) wn.textContent = profile.name || 'رئيس القسم'; if (wt) wt.textContent = 'رئيس القسم · اطلاع على إنجاز «انطلاقة» 1448هـ'; if (av) av.textContent = '👁️' }
    if (document.querySelector('#nav button.on')?.dataset.v === 'admin') renderAdmin();
  }

  /* ---------- boot ---------- */
  async function loadNames() {
    const N = {}; if (profile.role === 'member') N[profile.unit] = profile.name; if (profile.role === 'chair') N.chair = profile.name;
    if (profile.role === 'chair' || profile.role === 'head') { try { const ps = await rest('GET', 'profiles?select=name,role,unit'); ps.forEach(p => { if (p.role === 'chair' && p.name) N.chair = p.name; if (p.role === 'member' && p.unit && p.name) N[p.unit] = p.name }); ls.set('intilaqa_names', N) } catch (e) { Object.assign(N, ls.get('intilaqa_names') || {}) } }
    window.__NAMES = N;
  }
  async function setName(v) { try { await rest('PATCH', 'profiles?id=eq.' + session.user.id, { name: v }, { Prefer: 'return=minimal' }); profile.name = v; ls.set(PROF, profile); setStatus(status) } catch (e) { } }
  async function loadProfile() {
    const rows = await rest('GET', 'profiles?select=*&id=eq.' + session.user.id);
    if (!rows || !rows[0]) throw new Error('لم يُعثر على ملف المستخدم');
    profile = rows[0]; ls.set(PROF, profile); return profile;
  }
  function pageFor(p) { return p.role === 'chair' ? PAGES.chair : p.role === 'head' ? PAGES.head : p.role === 'student' ? PAGES.student : (PAGES[p.unit] || 'index.html') }
  async function boot() {
    PAGE = typeof ROLE !== 'undefined' ? ROLE : (typeof MISSIONS !== 'undefined' ? 'student' : 'index');
    const css = document.createElement('style');
    css.textContent = '.ro main input,.ro main select,.ro main textarea,.ro main .seg,.ro main [data-mv],.ro main [data-up],.ro main [data-del],.ro main [data-done],.ro main #addStu,.ro main #addP,.ro main [data-delev],.ro main [data-delstu],.ro main [data-delp]{pointer-events:none!important;opacity:.55}.ro #nav [data-v=admin],.ro #nav [data-v=receive]{display:none}[data-s^="app:"] input,[data-s^="app:"] select,[data-s^="app:"] .seg,[data-s^="app:"] button{pointer-events:none!important;opacity:.6}.ro .hero .top:after{content:"👁️ اطلاع فقط";font-size:12px;background:rgba(255,255,255,.15);padding:3px 10px;border-radius:12px}';
    document.head.appendChild(css);
    await recoveryFlow();
    if (!session) await loginScreen();
    try { await loadProfile() } catch (e) {
      if (!profile) { if (e.status === 401 || e.status === 403) { logout(true); await loginScreen('انتهت الجلسة، سجّل الدخول مرة أخرى'); await loadProfile() } else { await loginScreen('لا يوجد اتصال بالإنترنت لأول دخول'); await loadProfile() } }
    }
    const target = pageFor(profile), here = (location.pathname.split('/').pop() || 'index.html');
    if (here !== target && !(profile.role === 'chair' && here === 'dashboard.html')) { location.replace(target); return }
    await loadNames();
    window.__init && window.__init();
    if (typeof S !== 'undefined' && S && S.names && profile.name) { const k = profile.role === 'member' ? profile.unit : profile.role === 'chair' ? 'chair' : null; if (k) S.names[k] = profile.name }
    const cached = ls.get(CACHE); if (cached) { applyItems(cached); window.__rawRender && window.__rawRender() }
    setStatus(navigator.onLine === false ? 'offline' : 'ok');
    await pull();
    if (PAGE === 'student' && !S.setup && profile.name) { S.name = S.name || profile.name }
    window.__rawRender && window.__rawRender();
    setInterval(() => { if (document.visibilityState === 'visible') pull() }, 30000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pull() });
    addEventListener('online', () => { setStatus('saving'); push().then(pull) });
    const nv = document.getElementById('nav'); if (nv) nv.addEventListener('click', e => { if (e.target.closest('[data-v=admin]')) renderAdmin() });
  }

  window.SYNC = { setName, removeStudent, archiveYear, getArchive, boot, dirty, afterRender, fetchFile, renderAdmin, get profile() { return profile }, logout, _push: push, _pull: pull };
})();
