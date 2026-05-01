// api/ai-proxy.js
// Proxy seguro para a API do Google Gemini.
// Verifica autenticação Supabase + plano antes de chamar a IA.
// A GEMINI_API_KEY nunca é exposta ao frontend.

const { createClient } = require('@supabase/supabase-js');

const TRIAL_DAYS = 15;
const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

function calcTrialDaysLeft(createdAt) {
  if (!createdAt) return 0;
  const diffDays = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
  return Math.max(0, TRIAL_DAYS - diffDays);
}

// Normaliza a resposta do Gemini para o formato que o app.html já sabe parsear:
// { content: [{ type: 'text', text: '...' }] }
function normalizeGemini(data) {
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return { content: [{ type: 'text', text }] };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // ── Parse body ──────────────────────────────────────────────────────────
  // Vercel auto-parseia JSON; fallback para parse manual se necessário
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }
  if (!body) return res.status(400).json({ error: 'Invalid JSON' });

  const { type, token } = body;

  if (!token) return res.status(401).json({ error: 'Missing auth token' });
  if (!type)  return res.status(400).json({ error: 'Missing type (ocr | voice)' });

  // ── Verificar JWT do Supabase ────────────────────────────────────────────
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // ── Verificar plano (Pro ou trial ativo) ────────────────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', user.id)
    .single();

  const isPro = profile?.plan === 'pro' || calcTrialDaysLeft(user.created_at) > 0;
  if (!isPro) {
    return res.status(403).json({ error: 'Subscription required' });
  }

  // ── Verificar chave do Gemini ─────────────────────────────────────────────
  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY não configurada nas variáveis de ambiente.');
    return res.status(500).json({ error: 'AI service not configured' });
  }

  // ── Montar partes do conteúdo para o Gemini ─────────────────────────────
  let parts;

  if (type === 'voice') {
    const { text } = body;
    if (!text || typeof text !== 'string') return res.status(400).json({ error: 'Missing text' });
    const safeText = text.slice(0, 500);
    parts = [{
      text: `Extraia dados de gasto desta frase: "${safeText}". Responda SOMENTE com JSON puro, sem markdown: {"desc":"descrição","val":0.00,"cat":"Alimentação|Transporte|Moradia|Saúde|Lazer|Compras|Serviços|Equipamentos|Outros"}`,
    }];

  } else if (type === 'ocr') {
    const { image, mediaType } = body;
    if (!image || typeof image !== 'string') return res.status(400).json({ error: 'Missing image' });
    const safeMediaType = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType)
      ? mediaType
      : 'image/jpeg';
    parts = [
      { inline_data: { mime_type: safeMediaType, data: image } },
      { text: 'Analise este comprovante. Responda SOMENTE com JSON puro, sem markdown: {"desc":"estabelecimento","val":0.00,"date":"YYYY-MM-DD ou null","cat":"Alimentação|Transporte|Moradia|Saúde|Lazer|Compras|Serviços|Equipamentos|Outros"}' },
    ];

  } else {
    return res.status(400).json({ error: 'Invalid type. Use "ocr" or "voice".' });
  }

  // ── Chamar a API do Gemini ────────────────────────────────────────────────
  try {
    const geminiResp = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { maxOutputTokens: type === 'ocr' ? 300 : 200 },
      }),
    });

    const data = await geminiResp.json();

    if (!geminiResp.ok) {
      console.error('Gemini API error:', JSON.stringify(data));
      return res.status(502).json({ error: 'AI service error' });
    }

    return res.status(200).json(normalizeGemini(data));

  } catch (err) {
    console.error('Fetch error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
