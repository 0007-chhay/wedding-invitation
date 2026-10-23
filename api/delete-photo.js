// api/delete-photo.js

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hojyarygbfnszspisjzd.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvanlhcnlnYmZuc3pzcGlzanpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyNjkzNzksImV4cCI6MjEwNzg0NTM3OX0.f7ziLBlDqd5W_t6fdVpN2uGHgWxz-1T61NkA_BFq7J0';

// កំណត់ Password របស់អ្នកនៅទីនេះ
const MASTER_PASSWORD = process.env.ADMIN_PASSWORD || "686911";

export default async function handler(req, res) {
  // អនុញ្ញាតតែ POST request ប៉ុណ្ណោះ
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { id, password } = req.body || {};

  // ផ្ទៀងផ្ទាត់ពាក្យសម្ងាត់
  if (!password || password !== MASTER_PASSWORD) {
    return res.status(401).json({ error: 'លេខសម្ងាត់មិនត្រឹមត្រូវទេ!' });
  }

  if (!id) {
    return res.status(400).json({ error: 'សូមបញ្ជាក់ ID រូបភាព!' });
  }

  try {
    // ហៅទៅ Supabase REST API ផ្ទាល់ (មិនបាច់ពឹងផ្អែកលើ @supabase/supabase-js)
    const response = await fetch(`${SUPABASE_URL}/rest/v1/wedding_photos?id=eq.${id}`, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText || 'បរាជ័យក្នុងការលុបពី Database' });
    }

    return res.status(200).json({ success: true, message: 'លុបរូបភាពជោគជ័យ' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}