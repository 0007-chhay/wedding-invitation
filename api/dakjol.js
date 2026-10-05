export default async function handler(req, res) {
  // ធានាថាមានតែសំណើ POST ទេទើបអនុញ្ញាត
  if (req.method !== 'POST') {
    return res.status(405).json({ status: "error", message: "Method not allowed" });
  }

  try {
    // ទទួលទិន្នន័យដែលផ្ញើมาจาก Frontend
    const { name, attendance, guest } = req.body;

    // Google Apps Script URL និង Secret Key ត្រូវបានលាក់ទុកសុវត្ថិភាពនៅទីនេះ (គ្មាននរណាមើលឃើញតាម View Source ទេ)
    const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyzQ3LZjmLF3qWKqWzGrPV8sn9auPCq3BknVAesD-E21kSVpHTaSwHCOoOVfdAZTsaH/exec";
    const SECRET_TOKEN = "MySuperSecretWedding2026Key";

    // រៀបចំទិន្នន័យដើម្បីបាញ់បន្តទៅ Google Apps Script
    const params = new URLSearchParams();
    params.append('secret', SECRET_TOKEN);
    params.append('name', name || '');
    params.append('attendance', attendance || '');
    params.append('guest', guest || '');

    // ធ្វើការ fetch ទៅកាន់ Google Apps Script ពី Server របស់ Vercel
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      body: params
    });

    const result = await response.json();
    return res.status(200).json(result);

  } catch (error) {
    return res.status(500).json({ status: "error", message: "Internal Server Error" });
  }
}