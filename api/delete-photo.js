import { createClient } from '@supabase/supabase-js';

// ទាញយក environment variables ឬដាក់ផ្ទាល់នៅ Server
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://hojyarygbfnszspisjzd.supabase.co',
  process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvanlhcnlnYmZuc3pzcGlzanpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyNjkzNzksImV4cCI6MjEwNzg0NTM3OX0.f7ziLBlDqd5W_t6fdVpN2uGHgWxz-1T61NkA_BFq7J0'
);

const MASTER_PASSWORD = process.env.ADMIN_PASSWORD || "686911"; // កំណត់ពាក្យសម្ងាត់នៅទីនេះ

export default async function handler(req, res) {
  // ទទួលយកតែ POST request
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { id, password } = req.body;

  // ផ្ទៀងផ្ទាត់លេខសម្ងាត់នៅលើ Server (ភ្ញៀវមិនអាចដឹងកូដនេះឡើយ)
  if (!password || password !== MASTER_PASSWORD) {
    return res.status(401).json({ error: 'លេខសម្ងាត់មិនត្រឹមត្រូវទេ!' });
  }

  if (!id) {
    return res.status(400).json({ error: 'សូមបញ្ជាក់ ID រូបភាព!' });
  }

  try {
    const { error } = await supabase
      .from('wedding_photos')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return res.status(200).json({ success: true, message: 'លុបរូបភាពជោគជ័យ' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}