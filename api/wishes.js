// ជញ្ជាំងពាក្យជូនពរ (Wishes Wall) — រក្សាទុកក្នុង Upstash Redis (ឥតគិតថ្លៃ តាម Vercel Storage)
//
// Vercel → Settings → Environment Variables (Vercel បន្ថែមស្វ័យប្រវត្តិពេលភ្ជាប់ Upstash):
//   KV_REST_API_URL + KV_REST_API_TOKEN   ឬ   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
//   ADMIN_KEY   ពាក្យសម្ងាត់សម្រាប់ទំព័រលុបពរ (អ្នកកំណត់ខ្លួនឯង)
//
// GET  /api/wishes                      → បញ្ជីពរចុងក្រោយ (JSON)
// POST /api/wishes {name, message}      → រក្សាទុកពរថ្មី
// GET  /api/wishes?admin=ADMIN_KEY      → ទំព័រគ្រប់គ្រង (លុបពរ)
// GET  /api/wishes?del=ID&key=ADMIN_KEY → លុបពរមួយ

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const ADMIN = process.env.ADMIN_KEY;
const KEY = 'wishes';

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

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function all() {
  const raw = (await redis(['LRANGE', KEY, 0, 499])) || [];
  return raw.map(x => { try { return { raw: x, w: JSON.parse(x) }; } catch { return null; } }).filter(Boolean);
}

module.exports = async (req, res) => {
  if (!URL_ || !TOKEN) return res.status(200).json({ wishes: [], disabled: true });

  try {
    if (req.method === 'POST') {
      let b = req.body;
      if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
      const name = String((b && b.name) || '').trim().slice(0, 60);
      const msg = String((b && b.message) || '').trim().slice(0, 500);
      if (!msg) return res.status(400).json({ ok: false });
      const wish = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, msg, t: Date.now() };
      await redis(['LPUSH', KEY, JSON.stringify(wish)]);
      await redis(['LTRIM', KEY, 0, 499]);
      return res.status(200).json({ ok: true, wish });
    }

    const q = req.query || {};

    // លុបពរ
    if (q.del) {
      if (!ADMIN || q.key !== ADMIN) return res.status(403).send('Forbidden');
      const found = (await all()).find(x => x.w.id === q.del);
      if (found) await redis(['LREM', KEY, 1, found.raw]);
      res.setHeader('Location', `/api/wishes?admin=${encodeURIComponent(ADMIN)}`);
      return res.status(302).end();
    }

    // ទំព័រគ្រប់គ្រង
    if (q.admin !== undefined) {
      if (!ADMIN || q.admin !== ADMIN) return res.status(403).send('Forbidden');
      const rows = (await all()).map(({ w }) => `
        <div class="w"><b>${esc(w.name || 'ភ្ញៀវកិត្តិយស')}</b> <small>${new Date(w.t).toLocaleString()}</small>
        <p>${esc(w.msg)}</p>
        <a href="/api/wishes?del=${encodeURIComponent(w.id)}&key=${encodeURIComponent(ADMIN)}" onclick="return confirm('លុបពរនេះ?')">🗑 លុប / Delete</a></div>`).join('');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>គ្រប់គ្រងពាក្យជូនពរ</title>
        <style>body{font-family:system-ui,sans-serif;background:#1f2913;color:#efe2b8;margin:0;padding:16px;max-width:640px;margin:auto}
        .w{background:rgba(0,0,0,.3);border-left:3px solid #b39246;border-radius:8px;padding:10px 12px;margin:10px 0}
        p{white-space:pre-wrap;margin:6px 0}a{color:#ff9a8a}small{opacity:.6}</style>
        <h2>ពាក្យជូនពរ (${rows ? (await all()).length : 0})</h2>${rows || '<p>មិនទាន់មានពរនៅឡើយ</p>'}`);
    }

    // បញ្ជីសម្រាប់ធៀប
    const wishes = (await all()).slice(0, 100).map(x => x.w);
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=60');
    return res.status(200).json({ wishes });
  } catch (e) {
    return res.status(500).json({ ok: false, wishes: [] });
  }
};
