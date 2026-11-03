// כנפי רוח · shared rules. Runs in the browser (window.KR) and on the server (globalThis.KR).
// Every change to the data is an "op". The server keeps the list of ops; the state is rebuilt
// by replaying them here, so the phone and the server always agree.
(function (G) {
  const HOME = [['👶','שמר על האחים',3],['🍽️','שטף כלים',3],['🧽','עזר לנקות',3],['🛒','עזר בקניות',3],['🛏️','סידר את החדר',3],['🕯️','הכנות לשבת',3]];
  const PRIZES = [['🎟️','שובר לקיוסק 20 ש״ח',100],['🍦','גלידה',40],['🎧','שיר בהפסקה',30],['🪑','לשבת ליד חבר שבוע',60],['📝','פטור משיעורי בית',80],['🍕','פיצה אישית',120],['⚽','כדור כדורגל',150]];
  const FLAVORS = ['וניל עוגיות','וניל נוגט','שוקולד נוגט','אגוזי לוז'];
  const VALUES = ['חברות','למידה','חסד','אחריות','יראת שמיים'];
  const WHY = ['עזר לי בשיעור','למד איתי','היה חבר טוב','שיתף אותי','עודד אותי'];
  const SUBJ = ['תורה','גמרא','משנה','נביא','מתמטיקה','אנגלית','לשון','מדעים','היסטוריה','גיאוגרפיה'];
  const TREATS = ['🍕 מגש פיצה','🍦 גלידה','🍿 חטיפים'];
  const TEACHER = 'המחנך ינון אליה';
  const ARAM0 = [['תָּא שְׁמַע','בוא ושמע'],['מַאי טַעְמָא','מה הסיבה?'],['אִיבַּעְיָא לְהוּ','נשאלה להם שאלה'],['תְּיוּבְתָּא','הפרכה, קושיה שאין עליה תשובה'],['פְּשִׁיטָא','פשוט! ברור!'],['הָכִי נַמִי','כך גם'],['מְנָא הָנֵי מִילֵּי','מניין הדברים האלה?'],['אִי נַמִי','או גם, אפשרות אחרת'],['לָא צְרִיכָא','לא נצרך, אין צורך לומר'],['שְׁמַע מִינַּהּ','למד מכאן']];
  const CATS = {
    'חברותא ועזרה לחבר':[['🤝','עזר לחבר בשיעור',5],['📖','למד עם חבר (חברותא)',10],['💡','הסביר לחבר חומר',5],['💬','ניגש לחבר שהיה לבד',5]],
    'גמרא':[['🗣️','אמר שקלא וטריא של עמוד גמרא',20]],
    'לימודים':[['📚','הכין שיעורי בית',3],['✋','השתתפות פעילה',3],['📜','חזר על תורה בבית',5]],
    'כיתה':[['🧹','סידר את הכיתה',3],['🎧','שקט ומרוכז',2],['📘','הגיע בזמן (גם אחרי הפסקה) עם ספר, מחברת וכלי כתיבה בלבד',3],['⏰','הגיע בזמן',2],['🙋','התנדב לתפקיד',4]],
    'ערכים':[['🙏','כבוד לצוות',4],['💛','מעשה חסד',6],['🕊️','השכין שלום',6],['🎯','התמדה ומאמץ',5]],
    'מבחנים':[['📝','מעל 80 במבחן',6],['🏅','מעל 90 במבחן',10],['💯','100 במבחן',15]],
    'הפתעה':[['⭐','שמתי לב!',5],['🌟','משהו מיוחד',8]] };
  const defCfg = () => ({ prizes: PRIZES.map((p, i) => ({ id: 'p' + i, e: p[0], name: p[1], cost: p[2], stock: null })),
    cats: JSON.parse(JSON.stringify(CATS)), home: HOME.map(h => h.slice()) });
  const HIST_MAX = 120, FEED_MAX = 60;

  // ---- Israel time ----
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
  function il(ts) {
    const o = {}; fmt.formatToParts(new Date(ts)).forEach(p => o[p.type] = p.value);
    const date = `${o.year}-${o.month}-${o.day}`, dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(o.weekday);
    const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - dow);
    return { date, min: (+o.hour) * 60 + (+o.minute), dow, wk: d.toISOString().slice(0, 10) };
  }

  function newStudent(id, name) {
    return { id, name, points: 0, wallet: 0, goalPts: 0, zr: 0, streak: 0, homeCount: 0, donated: 0, count: {}, values: {}, hist: [], arr: [], crunches: [], flavor: '', goals: [],
      sleep: { bed: '23:30', wake: '06:45', nights: 0, days: {} }, msg: '', gave: '', aramDay: '', zrDay: '', wk: {}, sleepBadge: 0 };
  }
  function init(roster) {
    return { n: 0, students: roster.map(r => Object.assign(newStudent(r.id, r.name), { first: r.first || r.name.split(' ')[0] })), cls: { bonus: 0, feed: [], agent: null, revealed: [], aram: ARAM0.map(x => x.slice()), cfg: defCfg() } };
  }
  // keep the state in step with the roster (new students, renamed students)
  function syncRoster(st, roster) {
    const by = {}; st.students.forEach(s => by[s.id] = s);
    if (!st.cls.cfg) st.cls.cfg = defCfg();
    st.students = roster.map(r => { const s = by[r.id] || newStudent(r.id, r.name); s.name = r.name; s.first = r.first || r.name.split(' ')[0]; return s; });
    return st;
  }

  function dist(a, b, c, d) { const R = 6371000, t = x => x * Math.PI / 180, dLa = t(c - a), dLo = t(d - b);
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
  class Bad extends Error {}
  const need = (c, m) => { if (!c) throw new Bad(m || 'לא מורשה'); };

  function apply(st, op) {
    const T = il(op.ts), r = op.r, a = op.a; // r = role of who sent it, a = his student index (student/parent)
    const S = i => { const s = st.students[i]; need(s, 'תלמיד לא קיים'); return s; };
    const isT = r === 'teacher'; const C = st.cls.cfg || (st.cls.cfg = defCfg());
    const own = i => isT || (+i === +a);
    const hid = k => `${op.i}.${k}`;
    let hk = 0;
    const hist = (s, h) => { s.hist.unshift(Object.assign({ id: hid(hk++), ts: op.ts }, h)); if (s.hist.length > HIST_MAX) s.hist.length = HIST_MAX; };
    const feed = f => { st.cls.feed.unshift(Object.assign({ id: hid(hk++), ts: op.ts }, f)); if (st.cls.feed.length > FEED_MAX) st.cls.feed.length = FEED_MAX; };
    const add = (s, p, t, who, q, noGoal) => { s.points += p; s.wallet += p; if (!noGoal) s.goalPts += p; s.wk[T.wk] = (s.wk[T.wk] || 0) + p; hist(s, { p, t, who, q: q ? 1 : 0, w: p, l: p, g: noGoal ? 0 : p }); };
    const crunch = s => { while (s.zr >= 15) { s.zr -= 15; const f = s.flavor || 'שוקולד נוגט'; s.crunches.push(f); add(s, 4, 'בונוס 15 זריזין', 'זריזין', 0, 1);
      hist(s, { p: '🍦', t: `קיבלת קראנץ' ${f}! (מס' ${s.crunches.length})`, who: 'זריזין' }); } };

    switch (op.t) {
      case 'award': { need(isT); const s = S(op.s), p = Math.round(+op.p); need(p > 0 && p <= 50, 'ניקוד לא תקין');
        const t = String(op.tx || '').slice(0, 140); need(t); s.count[t] = (s.count[t] || 0) + 1; add(s, p, t, TEACHER); break; }
      case 'home': { need(r === 'parent' || isT); need(own(op.s)); const s = S(op.s), h = C.home[op.h]; need(h);
        s.homeCount++; feed({ s: s.name, p: h[2], t: h[1], who: 'הורים' }); s.count[h[1]] = (s.count[h[1]] || 0) + 1; add(s, h[2], h[1], 'ההורים'); break; }
      case 'other': { need(r === 'parent' || isT); need(own(op.s)); const s = S(op.s), t = String(op.tx || '').trim().slice(0, 140); need(t, 'כתבו מה הוא עשה');
        s.homeCount++; feed({ s: s.name, p: 3, t, who: 'הורים' }); add(s, 3, t, 'ההורים', 1); break; }
      case 'zr': { need(isT); (op.list || []).forEach(i => { const s = S(i); if (s.zrDay === T.date) return; s.zrDay = T.date; s.streak++;
          if (s.streak >= 5) { s.zr += 4; s.streak = 0; hist(s, { p: '⚡', t: 'זריזין פרו! 5 ימים ברצף, שווה 8', who: TEACHER, z: 4 }); }
          else { s.zr += 1; hist(s, { p: '☀️', t: 'זריזין, הגעת לפני 7:30', who: TEACHER, z: 1 }); }
          crunch(s); }); break; }
      case 'zrAdd': { need(isT); need(Array.isArray(op.list) && op.list.length <= 60);
        op.list.forEach(x => { const s = S(x.s), k = Math.round(+x.n); need(k >= -100 && k <= 300, 'מספר זריזין לא תקין'); if (!k) return;
          const tot = s.crunches.length * 15 + s.zr; need(tot + k >= 0, 'אי אפשר לרדת מתחת ל-0');
          if (k < 0) { s.zr += k; while (s.zr < 0 && s.crunches.length) { s.crunches.pop(); s.zr += 15; } }
          else s.zr += k;
          hist(s, { p: '☀️', t: k > 0 ? `${k} זריזין מלפני האפליקציה` : `תיקון זריזין: ${k}`, who: TEACHER, z: k }); crunch(s); }); break; }
      case 'cfgLoc': { need(isT); if (op.off) { C.loc = null; break; } const la = +op.lat, ln = +op.lng, rr = Math.round(+op.rad);
        need(Math.abs(la) <= 90 && Math.abs(ln) <= 180, 'מיקום לא תקין'); need(rr >= 50 && rr <= 2000, 'טווח לא תקין'); C.loc = { lat: la, lng: ln, r: rr }; break; }
      case 'msg': { need(isT); S(op.s).msg = String(op.tx || '').slice(0, 500); break; }
      case 'redeem': { need(r !== 'parent' && own(op.s)); const s = S(op.s), p = C.prizes.find(x => x.id === op.pz); need(p, 'הפרס לא קיים'); need(p.stock == null || p.stock > 0, 'הפרס אזל'); need(s.wallet >= p.cost, 'אין מספיק נקודות');
        s.wallet -= p.cost; if (p.stock != null) p.stock--; hist(s, { p: '🎁', t: 'בחרת פרס: ' + p.name, who: 'בנק הפרסים', w: -p.cost, pz: p.id }); feed({ s: s.name, p: '🎁', t: 'ביקש פרס: ' + p.name, who: 'בנק הפרסים' }); break; }
      case 'cfgPrizes': { need(isT); need(Array.isArray(op.list) && op.list.length <= 40); const seen = new Set();
        C.prizes = op.list.map((x, k) => { const c = Math.round(+x.cost), st0 = x.stock === '' || x.stock == null ? null : Math.round(+x.stock); need(String(x.name || '').trim(), 'לכל פרס צריך שם'); need(c > 0 && c <= 5000, 'מחיר לא תקין');
          need(st0 == null || (st0 >= 0 && st0 <= 999), 'מלאי לא תקין'); let id = String(x.id || '').slice(0, 20) || hid('p' + k); if (seen.has(id)) id = hid('p' + k); seen.add(id);
          return { id, e: String(x.e || '🎁').slice(0, 8), name: String(x.name).trim().slice(0, 60), cost: c, stock: st0 }; }); break; }
      case 'cfgDeeds': { need(isT); const cats = op.cats; need(cats && typeof cats === 'object'); const out = {}; const ks = Object.keys(cats).slice(0, 15);
        ks.forEach(k => { const name = String(k).trim().slice(0, 40); need(name, 'לכל קטגוריה צריך שם'); need(Array.isArray(cats[k]));
          out[name] = cats[k].slice(0, 30).map(d => { const pp = Math.round(+d[2]); need(String(d[1] || '').trim(), 'לכל פעולה צריך שם'); need(pp > 0 && pp <= 50, 'ניקוד בין 1 ל-50'); return [String(d[0] || '⭐').slice(0, 8), String(d[1]).trim().slice(0, 140), pp]; }); });
        C.cats = out; break; }
      case 'cfgHome': { need(isT); need(Array.isArray(op.list) && op.list.length <= 20);
        C.home = op.list.map(d => { const pp = Math.round(+d[2]); need(String(d[1] || '').trim(), 'לכל פעולה צריך שם'); need(pp > 0 && pp <= 20, 'ניקוד בין 1 ל-20'); return [String(d[0] || '🏡').slice(0, 8), String(d[1]).trim().slice(0, 140), pp]; }); break; }
      case 'peer': { need(r !== 'parent' && own(op.s)); const s = S(op.s), f = S(op.to); need(+op.to !== +op.s); need(s.gave !== T.date, 'כבר נתת היום');
        const why = WHY.includes(op.why) ? op.why : WHY[0]; s.gave = T.date; add(f, 5, why, 'מחבר: ' + s.name); break; }
      case 'goal': { need(r !== 'parent' && own(op.s)); const s = S(op.s), tg = Math.round(+op.tg); need(SUBJ.includes(op.sub)); need(tg >= 65 && tg <= 100);
        need(s.goals.filter(g => g.grade == null).length < 8, 'יותר מדי יעדים פתוחים'); s.goals.unshift({ id: hid('g'), sub: op.sub, target: tg, grade: null }); break; }
      case 'grade': { need(isT); const s = S(op.s), g = s.goals.find(x => x.id === op.g); need(g && g.grade == null); const v = Math.round(+op.v); need(v >= 0 && v <= 100);
        g.grade = v; if (v >= g.target) { add(s, 8, `עמד ביעד ב${g.sub} (${v}/${g.target}), למדליה`, TEACHER); add(s, 5, `בונוס מבחן ב${g.sub}`, TEACHER); } break; }
      case 'sleepSet': { need(own(op.s)); const s = S(op.s), ok = x => /^\d\d:\d\d$/.test(x); if (ok(op.bed)) s.sleep.bed = op.bed; if (ok(op.wake)) s.sleep.wake = op.wake; break; }
      case 'bed': { need(r === 'parent' || isT); need(own(op.s)); const s = S(op.s), d = s.sleep.days[T.date] = s.sleep.days[T.date] || {}; need(!d.b, 'כבר סומן');
        d.b = 1; s.sleep.nights++; add(s, 5, 'הלך לישון בזמן 🌙', 'ההורים');
        if (s.sleep.nights >= 5) { s.sleep.nights = 0; s.sleepBadge = 1; add(s, 5, '5 לילות בזמן! ישן כמו אלוף 🌙', 'בונוס שינה'); } break; }
      case 'wake': { need(r === 'parent' || isT); need(own(op.s)); const s = S(op.s), d = s.sleep.days[T.date] = s.sleep.days[T.date] || {}; need(!d.w, 'כבר סומן');
        d.w = 1; add(s, 2, 'קם בזמן ☀️', 'ההורים'); break; }
      case 'flavor': { need(r !== 'parent' && own(op.s)); need(FLAVORS.includes(op.f)); S(op.s).flavor = op.f; break; }
      case 'donate': { need(r !== 'parent' && own(op.s)); const s = S(op.s), v = +op.v; need([10, 25, 50].includes(v)); need(s.wallet >= v, 'אין מספיק נקודות');
        s.wallet -= v; s.donated += v; st.cls.bonus += v; hist(s, { p: '💛', t: `תרמת ${v} נקודות לכיתה`, who: 'תרומה', w: -v, b: v }); break; }
      case 'checkin': { need(r !== 'parent' && own(op.s)); const s = S(op.s); need(!s.arr.some(x => x.d === T.date), 'כבר נרשמת היום');
        if (C.loc && !isT) { need(isFinite(+op.lat) && isFinite(+op.lng), 'צריך לאשר גישה למיקום כדי להירשם');
          need(dist(+op.lat, +op.lng, C.loc.lat, C.loc.lng) <= C.loc.r, 'אפשר להירשם רק כשנמצאים בישיבה'); }
        if (!isT) need(T.min >= 420 && T.min <= 450, 'אפשר ללחוץ "הגעתי" רק בין 7:00 ל-7:30');
        s.arr.push({ d: T.date, t: T.min }); break; }
      case 'adj': { need(isT); const s = S(op.s), p = Math.round(+op.p); need(p && Math.abs(p) <= 1000, 'מספר לא תקין');
        const t = String(op.tx || '').trim().slice(0, 140) || (p > 0 ? 'תוספת נקודות' : 'הורדת נקודות');
        need(s.wallet + p >= 0 || p > 0, 'אין לו מספיק נקודות לשימוש להוריד'); s.points = Math.max(0, s.points + p); s.wallet = Math.max(0, s.wallet + p); s.goalPts = Math.max(0, s.goalPts + p);
        s.wk[T.wk] = (s.wk[T.wk] || 0) + p; hist(s, { p, t, who: TEACHER, w: p, l: p, g: p }); break; }
      case 'undo': { need(isT); const s = S(op.s), h = s.hist.find(x => x.id === op.h); need(h, 'הפעולה לא נמצאה'); const sg = h.u ? 1 : -1; // undo, or bring back
        const w = h.w != null ? h.w : (typeof h.p === 'number' ? h.p : 0), l = h.l != null ? h.l : (typeof h.p === 'number' ? h.p : 0), g = h.g != null ? h.g : l;
        need(w || l || g || h.z || h.b, 'לפעולה הזו אין מה לבטל');
        s.wallet = Math.max(0, s.wallet + sg * w); s.points = Math.max(0, s.points + sg * l); s.goalPts = Math.max(0, s.goalPts + sg * g);
        if (h.b) st.cls.bonus = Math.max(0, st.cls.bonus + sg * h.b);
        if (h.pz) { const pr = C.prizes.find(x => x.id === h.pz); if (pr && pr.stock != null) pr.stock = Math.max(0, pr.stock - sg); }
        if (h.z) { s.zr += sg * h.z; while (s.zr < 0 && s.crunches.length) { s.crunches.pop(); s.zr += 15; } if (s.zr < 0) s.zr = 0; if (sg > 0) crunch(s); }
        h.u = h.u ? 0 : 1; break; }
      case 'reset': { need(isT); const s = S(op.s); const bak = JSON.parse(JSON.stringify(s)); delete bak.bak;
        const f = newStudent(s.id, s.name); f.first = s.first; f.bak = bak; st.students[+op.s] = f; break; }
      case 'restore': { need(isT); const s = S(op.s); need(s.bak, 'אין נתונים לשחזר'); const b = s.bak; b.name = s.name; b.first = s.first; st.students[+op.s] = b; break; }
      case 'agentSet': { need(isT); S(op.idx); st.cls.agent = { date: T.date, idx: +op.idx, status: 'pending' }; break; }
      case 'agentRes': { need(isT); let ag = st.cls.agent;
        if (!(ag && ag.date === T.date)) { S(op.idx); ag = st.cls.agent = { date: T.date, idx: +op.idx, status: 'pending' }; }
        need(ag.status === 'pending', 'הסוכן של היום כבר סומן');
        ag.status = op.ok ? 'yes' : 'no'; if (op.ok) { st.cls.bonus += 10; st.cls.revealed.unshift(S(ag.idx).name); st.cls.revealed.length = Math.min(st.cls.revealed.length, 20); } break; }
      case 'aramSet': { need(isT); need(Array.isArray(op.list)); st.cls.aram = op.list.slice(0, 10).map(w => [String(w[0] || '').slice(0, 60), String(w[1] || '').slice(0, 120)]); break; }
      case 'aramMark': { need(r === 'parent' || isT); need(own(op.s)); const s = S(op.s); need(s.aramDay !== T.date, 'כבר סומן היום'); s.aramDay = T.date; feed({ s: s.name, p: 2, t: 'אמר את המילים בארמית בעל פה', who: 'הורים' }); add(s, 2, 'אמר בעל פה את המילים בארמית', 'ההורים'); break; }
      case 'init': { need(isT); const s = S(op.s); need(VALUES.includes(op.val)); const tx = String(op.tx || '').trim().slice(0, 140);
        s.values[op.val] = (s.values[op.val] || 0) + 1; add(s, 10, `יוזמה מבורכת (${op.val})${tx ? ': ' + tx : ''}`, TEACHER); break; }
      case 'grp': { need(isT); const tr = TREATS.includes(op.treat) ? op.treat : TREATS[0]; const L = [...new Set(op.list || [])]; need(L.length >= 2, 'חבורה = לפחות 2 תלמידים');
        L.forEach(i => { const s = S(i); add(s, 10, 'למד בחבורה למבחן', TEACHER); hist(s, { p: tr.split(' ')[0], t: `למדתם בחבורה למבחן: ${tr.slice(3)} עלינו!`, who: TEACHER }); }); break; }
      default: throw new Bad('פעולה לא מוכרת');
    }
    st.n = op.i + 1;
    return st;
  }
  // replay: bad ops are skipped (they change nothing)
  function replay(st, ops) { ops.forEach(op => { const snap = JSON.stringify(st); try { apply(st, op); } catch (e) { if (!(e instanceof Bad)) throw e; Object.assign(st, JSON.parse(snap)); st.n = op.i + 1; } }); return st; }
  // try an op on a copy: returns error text or ''
  function check(st, op) { try { apply(JSON.parse(JSON.stringify(st)), op); return ''; } catch (e) { if (e instanceof Bad) return e.message; throw e; } }

  // the daily secret agent: same answer all day, unknown to students
  function agentFor(st, date, secret) {
    const ag = st.cls.agent; if (ag && ag.date === date) return ag;
    let h = 2166136261; const str = secret + '|' + date; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return { date, idx: h % st.students.length, status: 'pending' };
  }

  const KR = { dist, newStudent, defCfg, CATS, HOME, PRIZES, FLAVORS, VALUES, WHY, SUBJ, TREATS, TEACHER, il, init, syncRoster, apply, replay, check, agentFor, Bad };
  G.KR = KR;
})(typeof window !== 'undefined' ? window : globalThis);
