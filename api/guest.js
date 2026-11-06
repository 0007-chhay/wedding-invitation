// លេខកូដខ្លីសម្រាប់ភ្ញៀវ៖ link ...vercel.app/#g=12 → ស្រោមសំបុត្របង្ហាញឈ្មោះភ្ញៀវលេខ ១២
//
// POST /api/guest {hon, name}           → {id}
// GET  /api/guest?id=12                 → {hon, name}
// GET  /api/guest?list=1   + header x-admin-key   → បញ្ជីភ្ញៀវ (JSON)
// POST /api/guest {op:"del", id} + header x-admin-key → លុបភ្ញៀវ
// ទំព័រគ្រប់គ្រង៖ /list-name/#guests
//
// ចំណាំ: រក្សាលេខរៀងដដែល ដើម្បីកុំឲ្យ link ដែលផ្ញើទៅភ្ញៀវរួចហើយខូច។
// ការការពារ: កំណត់ចំនួនការសួរក្នុងមួយ IP ដូច្នេះគេមិនអាចទាញបញ្ជីភ្ញៀវទាំងអស់បានទេ។

const { redis, hasRedis, ipOf, allow, checkAdmin, bodyOf, clean } = require('./_lib');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); // ឧបករណ៍កាតនៅ domain ផ្សេង
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!hasRedis) return res.status(503).json({ ok: false, error: 'storage not configured' });

  const ip = ipOf(req);
  try {
    if (req.method === 'POST' && req.headers['x-admin-key'] !== undefined) {
      res.setHeader('Cache-Control', 'no-store');
      if (!(await checkAdmin(req, String(req.headers['x-admin-key'])))) return res.status(403).json({ ok: false, error: 'key' });
      const b = bodyOf(req);
      if (b.op !== 'del') return res.status(400).json({ ok: false });
      const id = String(b.id || '').replace(/\D/g, '').slice(0, 9);
      const raw = id && await redis(['HGET', 'guests', id]);
      if (raw) {
        try { const g = JSON.parse(raw); await redis(['HDEL', 'guest_keys', `${g.hon}|${g.name}`]); } catch {}
        await redis(['HDEL', 'guests', id]);
      }
      return res.status(200).json({ ok: true });
    }

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

    // ---------- ទំព័រគ្រប់គ្រង (/list-name/) — ពាក្យសម្ងាត់ក្នុង header មិនមែនក្នុង URL ----------
    if (q.list !== undefined) {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Robots-Tag', 'noindex');
      if (!(await checkAdmin(req, String(req.headers['x-admin-key'] || '')))) return res.status(403).json({ ok: false, error: 'key' });
      const all = (await redis(['HGETALL', 'guests'])) || [];
      const rows = [];
      for (let i = 0; i < all.length; i += 2) {
        try { rows.push({ id: +all[i], ...JSON.parse(all[i + 1]) }); } catch {}
      }
      rows.sort((a, b) => a.id - b.id);
      return res.status(200).json({ ok: true, guests: rows });
    }

    // របៀបចាស់ ?admin=KEY ត្រូវបានបិទ (ពាក្យសម្ងាត់លេចក្នុង URL)
    if (q.admin !== undefined) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(410).send('<meta charset="utf-8">ទំព័រនេះបានផ្លាស់ទៅ <a href="/list-name/#guests">/list-name/</a>');
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