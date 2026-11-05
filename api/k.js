// כנפי רוח · server. GET  /api/k?k=CODE        -> what this person may see
//                   POST /api/k?k=CODE {ops}  -> save actions, return the new view
// Data: Upstash Redis (Vercel Marketplace). Names + personal codes live in the KR_ROSTER env var, never in the code.
import '../logic.js';
import { makeStore } from '../lib/store.js';
const KR = globalThis.KR;

function roster() {
  const r = JSON.parse(process.env.KR_ROSTER || '{"teacher":"","students":[]}');
  return r;
}
function who(code, R) {
  if (!code || code.length < 6) return null;
  if (R.teacher && code === R.teacher) return { role: 'teacher', a: -1 };
  const i = R.students.findIndex(s => s.sc === code); if (i >= 0) return { role: 'student', a: i };
  const j = R.students.findIndex(s => s.pc === code); if (j >= 0) return { role: 'parent', a: j };
  return null;
}

async function load(db, R) {
  let snap = await db.get('kr:snap');
  let st = snap ? JSON.parse(snap) : KR.init(R.students);
  KR.syncRoster(st, R.students);
  const base = st.n;
  const tail = (await db.lrange('kr:ops', base, -1)).map((x, k) => Object.assign(JSON.parse(x), { i: base + k }));
  KR.replay(st, tail);
  if (tail.length >= 40) await db.set('kr:snap', JSON.stringify(st));
  return st;
}

function view(st, me, R) {
  const T = KR.il(Date.now());
  const ag = KR.agentFor(st, T.date, process.env.KR_SECRET || R.teacher);
  const base = { role: me.role, me: me.a, today: T.date, now: T.min, n: st.n };
  if (me.role === 'teacher') return Object.assign(base, { students: st.students, cls: Object.assign({}, st.cls, { agent: ag }) });
  const students = st.students.map((s, i) => i === me.a ? s : { id: s.id, name: s.name, first: s.first, goalPts: s.goalPts });
  const agent = { date: ag.date, status: ag.status, idx: ag.status === 'yes' ? ag.idx : -1 };
  return Object.assign(base, { students, cls: { bonus: st.cls.bonus, feed: [], agent, revealed: st.cls.revealed, aram: st.cls.aram, cfg: st.cls.cfg, reqs: (st.cls.reqs || []).filter(q => q.list.includes(me.a)), tests: st.cls.tests || [] } });
}

const send = (res, code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(obj)); };

export default async function handler(req, res) {
  try {
    const R = roster();
    const url = new URL(req.url, 'http://x');
    if (url.searchParams.has('ping')) { const db = makeStore(); if (!db) return send(res, 503, { db: false });
      await db.set('kr:ping', String(Date.now())); const st = await load(db, R); return send(res, 200, { db: true, students: st.students.length, ops: st.n }); }
    const me = who(url.searchParams.get('k') || req.headers['x-kr'], R);
    if (!me) return send(res, 401, { error: 'הקישור לא תקין' });
    const db = makeStore();
    if (!db) return send(res, 503, { error: 'מסד הנתונים עוד לא מחובר' });

    if (req.method === 'GET') return send(res, 200, view(await load(db, R), me, R));

    if (req.method === 'POST') {
      let body = req.body;
      if (!body || typeof body === 'string') { const chunks = []; if (typeof body === 'string') chunks.push(Buffer.from(body)); else for await (const c of req) chunks.push(c); body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); }
      const ops = (body.ops || []).slice(0, 40);
      let st = await load(db, R);
      const results = [];
      for (const raw of ops) {
        const op = Object.assign({}, raw, { ts: Date.now(), r: me.role, a: me.a });
        delete op.i; delete op.n; op.i = st.n;
        const err = KR.check(st, op);
        if (err) { results.push({ ok: false, error: err }); continue; }
        const { i, ...stored } = op;
        const len = await db.rpush('kr:ops', JSON.stringify(stored));
        // someone else may have saved in between: replay everything up to our op
        if (len !== st.n + 1) { st = await load(db, R); } else KR.replay(st, [op]);
        results.push({ ok: true });
      }
      return send(res, 200, Object.assign(view(st, me, R), { results }));
    }
    return send(res, 405, { error: 'method' });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'שגיאה בשרת' });
  }
}
