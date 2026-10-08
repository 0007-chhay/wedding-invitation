// លេខកូដខ្លីសម្រាប់ភ្ញៀវ៖ link ...vercel.app/#g=12 → ស្រោមសំបុត្របង្ហាញឈ្មោះភ្ញៀវលេខ ១២
// ប្រើ Upstash ដដែលនឹងជញ្ជាំងពរ (KV_REST_API_URL / KV_REST_API_TOKEN) និង ADMIN_KEY
//
// POST /api/guest {hon, name}        → {id}   (ឈ្មោះដូចគ្នា ទទួលបានលេខដដែល)
// GET  /api/guest?id=12              → {hon, name}
// GET  /api/guest?admin=ADMIN_KEY    → បញ្ជីភ្ញៀវទាំងអស់
// GET  /api/guest?del=12&key=ADMIN_KEY → លុបភ្ញៀវលេខ ១២

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const ADMIN = process.env.ADMIN_KEY;

async function redis(cmd) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

module.exports = async (req, res) => {
  // ឧបករណ៍កាតនៅ domain ផ្សេង ដូច្នេះត្រូវអនុញ្ញាត CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!URL_ || !TOKEN) return res.status(503).json({ ok: false, error: 'storage not configured' });

  try {
    if (req.method === 'POST') {
      let b = req.body;
      if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
      const hon = String((b && b.hon) || '').trim().slice(0, 40);
      const name = String((b && b.name) || '').trim().slice(0, 80);
      if (!name) return res.status(400).json({ ok: false });
      const key = `${hon}|${name}`;
      let id = await redis(['HGET', 'guest_keys', key]);
      if (!id) {
        id = String(await redis(['INCR', 'guest_seq']));
        await redis(['HSET', 'guests', id, JSON.stringify({ hon, name, t: Date.now() })]);
        await redis(['HSET', 'guest_keys', key, id]);
      }
      return res.status(200).json({ ok: true, id });
    }

    const q = req.query || {};

    // លុបភ្ញៀវ
    if (q.del) {
      if (!ADMIN || q.key !== ADMIN) return res.status(403).send('Forbidden');
      const id = String(q.del).replace(/\D/g, '');
      const raw = await redis(['HGET', 'guests', id]);
      if (raw) {
        try { const g = JSON.parse(raw); await redis(['HDEL', 'guest_keys', `${g.hon}|${g.name}`]); } catch {}
        await redis(['HDEL', 'guests', id]);
      }
      res.setHeader('Location', `/api/guest?admin=${encodeURIComponent(ADMIN)}`);
      return res.status(302).end();
    }

    if (q.admin !== undefined) {
      if (!ADMIN || q.admin !== ADMIN) return res.status(403).send('Forbidden');
      const all = (await redis(['HGETALL', 'guests'])) || [];
      const rows = [];
      for (let i = 0; i < all.length; i += 2) {
        try { const g = JSON.parse(all[i + 1]); rows.push({ id: +all[i], ...g }); } catch {}
      }
      rows.sort((a, b) => a.id - b.id);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>បញ្ជីភ្ញៀវ</title><style>body{font-family:system-ui,sans-serif;background:#1f2913;color:#efe2b8;padding:16px;max-width:640px;margin:auto}
        a{color:#ff9a8a;text-decoration:none}td,th{padding:6px 8px;border-bottom:1px solid #3a4a26;text-align:left}table{border-collapse:collapse;width:100%}</style>
        <h2>បញ្ជីភ្ញៀវដែលបានផ្ញើកាត (${rows.length})</h2><table><tr><th>#</th><th>ការគោរព</th><th>ឈ្មោះ</th><th>ថ្ងៃ</th><th></th></tr>
        ${rows.map(r => `<tr><td>${r.id}</td><td>${esc(r.hon)}</td><td>${esc(r.name)}</td><td>${new Date(r.t).toLocaleDateString()}</td><td><a href="/api/guest?del=${r.id}&key=${encodeURIComponent(ADMIN)}" onclick="return confirm('លុបភ្ញៀវ ${esc(r.name).replace(/'/g,'')}? Link របស់គាត់នឹងបង្ហាញ «ភ្ញៀវកិត្តិយស» ជំនួសឈ្មោះ')">🗑</a></td></tr>`).join('')}</table>`);
    }

    if (q.id) {
      const raw = await redis(['HGET', 'guests', String(q.id).replace(/\D/g, '')]);
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