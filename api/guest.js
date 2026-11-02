// លេខកូដខ្លីសម្រាប់ភ្ញៀវ៖ link ...vercel.app/#g=12 → ស្រោមសំបុត្របង្ហាញឈ្មោះភ្ញៀវលេខ ១២
//
// POST /api/guest {hon, name}           → {id}
// GET  /api/guest?id=12                 → {hon, name}
// GET  /api/guest?admin=ADMIN_KEY       → បញ្ជីភ្ញៀវ
// GET  /api/guest?admin=ADMIN_KEY&del=12 → លុបភ្ញៀវលេខ ១២
//
// ចំណាំ: រក្សាលេខរៀងដដែល ដើម្បីកុំឲ្យ link ដែលផ្ញើទៅភ្ញៀវរួចហើយខូច។
// ការការពារ: កំណត់ចំនួនការសួរក្នុងមួយ IP ដូច្នេះគេមិនអាចទាញបញ្ជីភ្ញៀវទាំងអស់បានទេ។

const { redis, hasRedis, ipOf, allow, checkAdmin, bodyOf, clean, esc } = require('./_lib');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); // ឧបករណ៍កាតនៅ domain ផ្សេង
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!hasRedis) return res.status(503).json({ ok: false, error: 'storage not configured' });

  const ip = ipOf(req);
  try {
    if (req.method === 'POST') {
      if (!(await allow(`gpost:${ip}`, 120, 3600))) return res.status(429).json({ ok: false });
      const b = bodyOf(req);
      const hon = clean(b.hon, 40).replace(/\n/g, ' ');
      const name = clean(b.name, 80).replace(/\n/g, ' ');
      const src = clean(b.src || 'my-secord-app', 30);
      if (!name) return res.status(400).json({ ok: false });
      const key = `${hon}|${name}`;
      let id = await redis(['HGET', 'guest_keys', key]);
      if (!id) {
        id = String(await redis(['INCR', 'guest_seq']));
        await redis(['HSET', 'guests', id, JSON.stringify({ hon, name, src, t: Date.now() })]);
        await redis(['HSET', 'guest_keys', key, id]);
      }
      return res.status(200).json({ ok: true, id });
    }

    const q = req.query || {};

    if (q.admin !== undefined) {
      const ADMIN = String(q.admin);
      if (!(await checkAdmin(req, ADMIN))) return res.status(403).send('Forbidden');
      const K = encodeURIComponent(ADMIN);

      if (q.del) {
        const id = String(q.del).replace(/\D/g, '');
        const raw = await redis(['HGET', 'guests', id]);
        if (raw) {
          try { const g = JSON.parse(raw); await redis(['HDEL', 'guest_keys', `${g.hon}|${g.name}`]); } catch {}
          await redis(['HDEL', 'guests', id]);
        }
        res.setHeader('Location', `/api/guest?admin=${K}`);
        return res.status(302).end();
      }

      const all = (await redis(['HGETALL', 'guests'])) || [];
      const rows = [];
      for (let i = 0; i < all.length; i += 2) {
        try { rows.push({ id: +all[i], ...JSON.parse(all[i + 1]) }); } catch {}
      }
      rows.sort((a, b) => a.id - b.id);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Robots-Tag', 'noindex');
      return res.status(200).send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>បញ្ជីភ្ញៀវ</title><style>body{font-family:system-ui,sans-serif;background:#1f2913;color:#efe2b8;padding:16px;max-width:640px;margin:auto}
        a{color:#ff9a8a;text-decoration:none}td,th{padding:6px 8px;border-bottom:1px solid #3a4a26;text-align:left}table{border-collapse:collapse;width:100%}</style>
        <h2>បញ្ជីភ្ញៀវដែលបានផ្ញើកាត (${rows.length})</h2><table><tr><th>ល.រ</th><th>កូដ link</th><th>ការគោរព</th><th>ឈ្មោះ</th><th>ថ្ងៃ</th><th>ពី</th><th></th></tr>
        ${rows.map((r, i) => `<tr><td>${i + 1}</td><td><small>#g=${r.id}</small></td><td>${esc(r.hon)}</td><td>${esc(r.name)}</td><td>${esc(new Date(r.t).toLocaleDateString())}</td><td>${esc(r.src || '')}</td><td><a href="/api/guest?admin=${K}&del=${r.id}" onclick="return confirm('លុបភ្ញៀវនេះ? Link របស់គាត់នឹងបង្ហាញ «ភ្ញៀវកិត្តិយស» ជំនួសឈ្មោះ')">🗑</a></td></tr>`).join('')}</table>`);
    }

    if (q.id) {
      // ភ្ញៀវធម្មតាសួរតែ ១-២ ដង; ការទាញបញ្ជីត្រូវសួររាប់រយដង → បិទ
      if (!(await allow(`gget:${ip}`, 60, 3600))) return res.status(429).json({ ok: false });
      const raw = await redis(['HGET', 'guests', String(q.id).replace(/\D/g, '').slice(0, 9)]);
      if (!raw) return res.status(404).json({ ok: false });
      const g = JSON.parse(raw);
      res.setHeader('Cache-Control', 's-maxage=3600');
      return res.status(200).json({ ok: true, hon: g.hon, name: g.name });
    }
    return res.status(400).json({ ok: false });
  } catch (e) {
    return res.status(500).json({ ok: false });
  }
};
