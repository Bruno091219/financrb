// netlify/functions/ai-proxy.js
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

function reply(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

// Normaliza a resposta do Gemini para o formato que o app.html já sabe parsear:
// { content: [{ type: 'text', text: '...' }] }
function normalizeGemini(data) {
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return { content: [{ type: 'text', text }] };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return reply(405, { error: 'Method Not Allowed' });
  }

  // ── Parse body ──────────────────────────────────────────────────────────
  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return reply(400, { error: 'Invalid JSON' });
  }

  const { type, token } = body;

  if (!token) return reply(401, { error: 'Missing auth token' });
  if (!type)  return reply(400, { error: 'Missing type (ocr | voice)' });

  // ── Verificar JWT do Supabase ────────────────────────────────────────────
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return reply(401, { error: 'Unauthorized' });
  }

  // ── Verificar plano (Pro ou trial ativo) ────────────────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', user.id)
    .single();

  const isPro = profile?.plan === 'pro' || calcTrialDaysLeft(user.created_at) > 0;
  if (!isPro) {
    return reply(403, { error: 'Subscription required' });
  }

  // ── Verificar chave do Gemini ─────────────────────────────────────────────
  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY não configurada nas variáveis de ambiente.');
    return reply(500, { error: 'AI service not configured' });
  }

  // ── Montar partes do conteúdo para o Gemini ─────────────────────────────
  let parts;

  if (type === 'voice') {
    const { text } = body;
    if (!text || typeof text !== 'string') return reply(400, { error: 'Missing text' });
    const safeText = text.slice(0, 500);
    parts = [{
      text: `Extraia dados de gasto desta frase: "${safeText}". Responda SOMENTE com JSON puro, sem markdown: {"desc":"descrição","val":0.00,"cat":"Alimentação|Transporte|Moradia|Saúde|Lazer|Compras|Serviços|Equipamentos|Outros"}`,
    }];

  } else if (type === 'ocr') {
    const { image, mediaType } = body;
    if (!image || typeof image !== 'string') return reply(400, { error: 'Missing image' });
    const safeMediaType = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType)
      ? mediaType
      : 'image/jpeg';
    parts = [
      { inline_data: { mime_type: safeMediaType, data: image } },
      { text: 'Analise este comprovante. Responda SOMENTE com JSON puro, sem markdown: {"desc":"estabelecimento","val":0.00,"date":"YYYY-MM-DD ou null","cat":"Alimentação|Transporte|Moradia|Saúde|Lazer|Compras|Serviços|Equipamentos|Outros"}' },
    ];

  } else {
    return reply(400, { error: 'Invalid type. Use "ocr" or "voice".' });
  }

  // ── Chamar a API do Gemini ────────────────────────────────────────────────
  try {
    const url = `${GEMINI_ENDPOINT}?key=${process.env.GEMINI_API_KEY}`;

    const geminiResp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { maxOutputTokens: type === 'ocr' ? 300 : 200 },
      }),
    });

    const data = await geminiResp.json();

    if (!geminiResp.ok) {
      console.error('Gemini API error:', JSON.stringify(data));
      return reply(502, { error: 'AI service error' });
    }

    // Normaliza para o formato que o app.html já sabe parsear
    return reply(200, normalizeGemini(data));

  } catch (err) {
    console.error('Fetch error:', err.message);
    return reply(500, { error: 'Internal server error' });
  }
};
