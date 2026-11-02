// លុបរូបពី memories.html (សម្រាប់ម្ចាស់កម្មវិធីប៉ុណ្ណោះ)
//
// Environment Variables (គ្មានតម្លៃលំនាំដើមក្នុងកូដទៀតទេ):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   Supabase → Project Settings → API → service_role (កុំដាក់ក្នុង HTML ដាច់ខាត)
//   ADMIN_PASSWORD              ពាក្យសម្ងាត់ថ្មី វែង (មិនមែន 686911 ទៀតទេ)

const { ipOf, redis, hasRedis, allow, sameSecret, bodyOf } = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const SB_URL = process.env.SUPABASE_URL, SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY, PASS = process.env.ADMIN_PASSWORD;
  if (!SB_URL || !SB_KEY || !PASS) return res.status(500).json({ error: 'Server not configured' });

  // ការពារការទាយពាក្យសម្ងាត់: ខុស ៥ ដង → បិទ ១ ម៉ោង
  const ip = ipOf(req), failKey = `rl:photofail:${ip}`;
  if (hasRedis) {
    try { if ((Number(await redis(['GET', failKey])) || 0) >= 5) return res.status(429).json({ error: 'ព្យាយាមខុសច្រើនដងពេក សូមរង់ចាំ ១ ម៉ោង' }); } catch {}
  }

  const { id, password } = bodyOf(req);
  if (!sameSecret(String(password || ''), PASS)) {
    await allow(`photofail:${ip}`, 5, 3600);
    return res.status(401).json({ error: 'លេខសម្ងាត់មិនត្រឹមត្រូវទេ!' });
  }

  // id ត្រូវតែជាលេខ ឬ UUID ប៉ុណ្ណោះ (ការពារការបញ្ចូល filter ផ្សេងៗ)
  const sid = String(id || '');
  if (!/^(\d{1,18}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(sid)) {
    return res.status(400).json({ error: 'ID រូបភាពមិនត្រឹមត្រូវ' });
  }

  try {
    const r = await fetch(`${SB_URL}/rest/v1/wedding_photos?id=eq.${encodeURIComponent(sid)}`, {
      method: 'DELETE',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    if (!r.ok) return res.status(502).json({ error: 'បរាជ័យក្នុងការលុបពី Database' });
    return res.status(200).json({ success: true, message: 'លុបរូបភាពជោគជ័យ' });
  } catch {
    return res.status(500).json({ error: 'Server error' });
  }
};
