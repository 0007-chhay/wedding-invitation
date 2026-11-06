// ជញ្ជាំងពាក្យជូនពរ — Upstash Redis
//
// Environment Variables (Vercel → Settings → Environment Variables):
//   KV_REST_API_URL + KV_REST_API_TOKEN (Vercel បន្ថែមឲ្យស្វ័យប្រវត្តិ)
//   ADMIN_KEY            ពាក្យសម្ងាត់វែង (យ៉ាងតិច ១៦ តួ) សម្រាប់ទំព័រគ្រប់គ្រង
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID   ដំណឹងទៅ Telegram ពេលមានពរថ្មី
//   WISHES_MODERATION    ទុកទទេ = ត្រូវអនុម័តមុនបង្ហាញ | "off" = បង្ហាញភ្លាម
//
// GET  /api/wishes                     → ពរដែលបានអនុម័ត (JSON)
// POST /api/wishes {name, message}     → ផ្ញើពរថ្មី (ជំនួស /api/send-wish ចាស់ផង)
// GET  /api/wishes?manage=1 + header x-admin-key        → {pending, live} សម្រាប់ទំព័រគ្រប់គ្រង
// POST /api/wishes {op:"approve"|"unapprove"|"del", id, from} + header x-admin-key
// ទំព័រគ្រប់គ្រង៖ /list-name/#wishes

const { redis, hasRedis, ipOf, allow, checkAdmin, bodyOf, clean, hasLink, tellTelegram } = require('./_lib');

const LIVE = 'wishes';            // បង្ហាញជាសាធារណៈ
const PENDING = 'wishes_pending'; // រង់ចាំអនុម័ត
const MODERATE = (process.env.WISHES_MODERATION || '').toLowerCase() !== 'off';

async function list(key) {
  const raw = (await redis(['LRANGE', key, 0, 499])) || [];
  return raw.map(x => { try { return { raw: x, w: JSON.parse(x) }; } catch { return null; } }).filter(Boolean);
}

module.exports = async (req, res) => {
  if (!hasRedis) return res.status(200).json({ wishes: [], disabled: true });

  try {
    // ---------- ផ្ញើពរថ្មី ----------
    // ---------- អនុម័ត / លុប (header x-admin-key) ----------
    if (req.method === 'POST' && req.headers['x-admin-key'] !== undefined) {
      res.setHeader('Cache-Control', 'no-store');
      if (!(await checkAdmin(req, String(req.headers['x-admin-key'])))) return res.status(403).json({ ok: false, error: 'key' });
      const b = bodyOf(req), id = String(b.id || '');
      if (!['approve', 'unapprove', 'del'].includes(b.op) || !id) return res.status(400).json({ ok: false });
      const from = b.op === 'approve' ? PENDING : b.op === 'unapprove' ? LIVE : (b.from === 'pending' ? PENDING : LIVE);
      const found = (await list(from)).find(x => x.w.id === id);
      if (found) {
        await redis(['LREM', from, 1, found.raw]);
        if (b.op === 'approve') await redis(['LPUSH', LIVE, found.raw]);
        if (b.op === 'unapprove') await redis(['LPUSH', PENDING, found.raw]);
      }
      return res.status(200).json({ ok: true, found: !!found });
    }

    if (req.method === 'POST') {
      const ip = ipOf(req);
      // IP មួយ ១០ ដង/ម៉ោង (ភ្ញៀវច្រើនអាចប្រើ Wi-Fi តែមួយ), ទាំងអស់គ្នា ១២០ ដង/ម៉ោង (ការពារការវាយប្រហារពី IP ច្រើន)
      if (!(await allow(`wish:${ip}`, 10, 3600)) || !(await allow('wish:all', 120, 3600))) {
        return res.status(429).json({ ok: false, error: 'too_many' });
      }

      const b = bodyOf(req);
      const name = clean(b.name, 60).replace(/\n/g, ' ');
      const msg = clean(b.message, 500);
      if (msg.length < 2) return res.status(400).json({ ok: false, error: 'empty' });
      if (hasLink(name) || hasLink(msg)) return res.status(400).json({ ok: false, error: 'link' });

      const wish = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), name, msg, t: Date.now() };
      await redis(['LPUSH', MODERATE ? PENDING : LIVE, JSON.stringify(wish)]);
      await redis(['LTRIM', MODERATE ? PENDING : LIVE, 0, 499]);

      // សារ Telegram ផ្គុំនៅ server (browser មិនអាចសរសេរសារចូល Telegram ដោយផ្ទាល់ទៀតទេ)
      await tellTelegram(
        `💌 មានសារជូនពរថ្មីពីភ្ញៀវកិត្តិយស!\n\n👤 ឈ្មោះ: ${name || '-'}\n💬 ពាក្យជូនពរ: ${msg}` +
        (MODERATE ? '\n\n⏳ រង់ចាំអ្នកអនុម័តនៅ /list-name/#wishes' : '')
      );
      return res.status(200).json({ ok: true, wish, pending: MODERATE });
    }

    if (req.method !== 'GET') return res.status(405).json({ ok: false });
    const q = req.query || {};

    // ---------- ទំព័រគ្រប់គ្រង (/list-name/) ----------
    if (q.manage !== undefined) {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Robots-Tag', 'noindex');
      if (!(await checkAdmin(req, String(req.headers['x-admin-key'] || '')))) return res.status(403).json({ ok: false, error: 'key' });
      const pend = await list(PENDING), live = await list(LIVE);
      return res.status(200).json({ ok: true, moderate: MODERATE, pending: pend.map(x => x.w), live: live.map(x => x.w) });
    }

    // របៀបចាស់ ?admin=KEY ត្រូវបានបិទ (ពាក្យសម្ងាត់លេចក្នុង URL)
    if (q.admin !== undefined) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(410).send('<meta charset="utf-8">ទំព័រនេះបានផ្លាស់ទៅ <a href="/list-name/#wishes">/list-name/</a>');
    }

    // ---------- បញ្ជីសម្រាប់ធៀប ----------
    const wishes = (await list(LIVE)).slice(0, 100).map(x => x.w);
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=60');
    return res.status(200).json({ wishes });
  } catch (e) {
    return res.status(500).json({ ok: false, wishes: [] });
  }
};