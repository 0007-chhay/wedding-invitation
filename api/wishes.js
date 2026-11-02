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
// GET  /api/wishes?admin=ADMIN_KEY     → ទំព័រគ្រប់គ្រង (អនុម័ត / លុប)

const { redis, hasRedis, ipOf, allow, checkAdmin, bodyOf, clean, hasLink, esc, tellTelegram } = require('./_lib');

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
        (MODERATE ? '\n\n⏳ រង់ចាំអ្នកអនុម័តនៅទំព័រគ្រប់គ្រង' : '')
      );
      return res.status(200).json({ ok: true, wish, pending: MODERATE });
    }

    if (req.method !== 'GET') return res.status(405).json({ ok: false });
    const q = req.query || {};

    // ---------- ទំព័រគ្រប់គ្រង ----------
    if (q.admin !== undefined) {
      const key = String(q.admin);
      if (!(await checkAdmin(req, key))) return res.status(403).send('Forbidden');
      const K = encodeURIComponent(key);

      // សកម្មភាព: approve / del
      if (q.approve || q.del) {
        const from = q.from === 'pending' ? PENDING : LIVE;
        const id = String(q.approve || q.del);
        const found = (await list(q.approve ? PENDING : from)).find(x => x.w.id === id);
        if (found) {
          await redis(['LREM', q.approve ? PENDING : from, 1, found.raw]);
          if (q.approve) await redis(['LPUSH', LIVE, found.raw]);
        }
        res.setHeader('Location', `/api/wishes?admin=${K}`);
        return res.status(302).end();
      }

      const pend = await list(PENDING), live = await list(LIVE);
      const card = (w, from) => `<div class="w"><b>${esc(w.name || 'ភ្ញៀវកិត្តិយស')}</b> <small>${esc(new Date(w.t).toLocaleString())}</small>
        <p>${esc(w.msg)}</p>
        ${from === 'pending' ? `<a class="ok" href="/api/wishes?admin=${K}&approve=${encodeURIComponent(w.id)}">✅ អនុម័ត</a> · ` : ''}
        <a href="/api/wishes?admin=${K}&del=${encodeURIComponent(w.id)}&from=${from}" onclick="return confirm('លុបពរនេះ?')">🗑 លុប</a></div>`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Robots-Tag', 'noindex');
      return res.status(200).send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>គ្រប់គ្រងពាក្យជូនពរ</title>
        <style>body{font-family:system-ui,sans-serif;background:#1f2913;color:#efe2b8;padding:16px;max-width:640px;margin:auto}
        .w{background:rgba(0,0,0,.3);border-left:3px solid #b39246;border-radius:8px;padding:10px 12px;margin:10px 0}
        p{white-space:pre-wrap;margin:6px 0}a{color:#ff9a8a}a.ok{color:#9be29b}small{opacity:.6}h2{margin-top:28px}</style>
        <p>ការអនុម័ត: <b>${MODERATE ? 'បើក (ពរថ្មីត្រូវរង់ចាំអនុម័ត)' : 'បិទ (ពរថ្មីបង្ហាញភ្លាម)'}</b></p>
        <h2>⏳ រង់ចាំអនុម័ត (${pend.length})</h2>${pend.map(x => card(x.w, 'pending')).join('') || '<p>គ្មាន</p>'}
        <h2>🌸 កំពុងបង្ហាញ (${live.length})</h2>${live.map(x => card(x.w, 'live')).join('') || '<p>គ្មាន</p>'}`);
    }

    // ---------- បញ្ជីសម្រាប់ធៀប ----------
    const wishes = (await list(LIVE)).slice(0, 100).map(x => x.w);
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=60');
    return res.status(200).json({ wishes });
  } catch (e) {
    return res.status(500).json({ ok: false, wishes: [] });
  }
};
