// បញ្ជីចំណងដៃ (ភ្ញៀវដែលបានចងដៃ) — សម្រាប់ទំព័រ /list-name/
// ទិន្នន័យរក្សាក្នុង Upstash Redis ដដែល (hash "gifts")
// គ្រប់សំណើត្រូវមាន header  x-admin-key: ADMIN_KEY  (ពាក្យសម្ងាត់ដដែលនឹង /api/wishes)
//
// GET  /api/gifts                         → {gifts:[...], guests:[...]}  (guests = ឈ្មោះភ្ញៀវដែលបានផ្ញើធៀប សម្រាប់ជំនួយវាយ)
// POST /api/gifts {op:"save", gift:{...}} → បន្ថែម ឬកែ (id ដដែល = កែ)
// POST /api/gifts {op:"del",  id}         → លុប

const { redis, hasRedis, checkAdmin, bodyOf, clean } = require('./_lib');

const KEY = 'gifts';
const ID_RE = /^[a-z0-9]{6,32}$/;

function tidy(g) {
  const amount = Math.round(Number(g.amount) * 100) / 100;
  return {
    id: String(g.id || ''),
    hon: clean(g.hon, 40).replace(/\n/g, ' '),
    name: clean(g.name, 80).replace(/\n/g, ' '),
    amount: Number.isFinite(amount) && amount >= 0 && amount < 1e10 ? amount : 0,
    cur: g.cur === 'USD' ? 'USD' : 'KHR',
    side: g.side === 'bride' ? 'bride' : g.side === 'groom' ? 'groom' : '',
    note: clean(g.note, 200).replace(/\n/g, ' '),
    by: clean(g.by, 30).replace(/\n/g, ' '),
    t: Number(g.t) > 0 ? Number(g.t) : Date.now(),
  };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (!hasRedis) return res.status(503).json({ ok: false, error: 'storage' });

  const key = String((req.headers || {})['x-admin-key'] || '');
  if (!(await checkAdmin(req, key))) return res.status(403).json({ ok: false, error: 'key' });

  try {
    if (req.method === 'GET') {
      const all = (await redis(['HGETALL', KEY])) || [];
      const gifts = [];
      for (let i = 0; i < all.length; i += 2) { try { gifts.push(JSON.parse(all[i + 1])); } catch {} }
      gifts.sort((a, b) => a.t - b.t);

      // ឈ្មោះភ្ញៀវពីធៀប (api/guest.js) សម្រាប់ជួយវាយឈ្មោះលឿន
      const gl = (await redis(['HGETALL', 'guests'])) || [];
      const guests = [];
      for (let i = 0; i < gl.length; i += 2) {
        try { const g = JSON.parse(gl[i + 1]); if (g.name) guests.push({ hon: g.hon || '', name: g.name }); } catch {}
      }
      return res.status(200).json({ ok: true, gifts, guests });
    }

    if (req.method !== 'POST') return res.status(405).json({ ok: false });
    const b = bodyOf(req);

    if (b.op === 'save') {
      const g = tidy(b.gift || {});
      if (!ID_RE.test(g.id)) return res.status(400).json({ ok: false, error: 'id' });
      if (!g.name) return res.status(400).json({ ok: false, error: 'name' });
      g.u = Date.now();
      await redis(['HSET', KEY, g.id, JSON.stringify(g)]);
      return res.status(200).json({ ok: true, gift: g });
    }

    if (b.op === 'del') {
      const id = String(b.id || '');
      if (!ID_RE.test(id)) return res.status(400).json({ ok: false, error: 'id' });
      await redis(['HDEL', KEY, id]);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ ok: false });
  } catch (e) {
    return res.status(500).json({ ok: false });
  }
};