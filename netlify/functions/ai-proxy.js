// netlify/functions/ai-proxy.js
// Proxy seguro para a API da Anthropic.
// Verifica autenticação Supabase + plano antes de chamar a IA.
// A ANTHROPIC_API_KEY nunca é exposta ao frontend.

const { createClient } = require('@supabase/supabase-js');

const TRIAL_DAYS = 15;
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

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

  // ── Verificar chave da Anthropic ─────────────────────────────────────────
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY não configurada nas variáveis de ambiente.');
    return reply(500, { error: 'AI service not configured' });
  }

  // ── Montar payload para a Anthropic ────────────────────────────────────
  let messages;

  if (type === 'voice') {
    const { text } = body;
    if (!text || typeof text !== 'string') return reply(400, { error: 'Missing text' });
    // Sanitização básica: limitar tamanho
    const safeText = text.slice(0, 500);
    messages = [{
      role: 'user',
      content: `Extraia dados de gasto desta frase: "${safeText}". Responda SOMENTE com JSON: {"desc":"descrição","val":0.00,"cat":"Alimentação|Transporte|Moradia|Saúde|Lazer|Compras|Serviços|Equipamentos|Outros"}`,
    }];

  } else if (type === 'ocr') {
    const { image, mediaType } = body;
    if (!image || typeof image !== 'string') return reply(400, { error: 'Missing image' });
    const safeMediaType = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType)
      ? mediaType
      : 'image/jpeg';
    messages = [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: safeMediaType, data: image } },
        { type: 'text', text: 'Analise o comprovante. JSON puro: {"desc":"estabelecimento","val":0.00,"date":"YYYY-MM-DD ou null","cat":"Alimentação|Transporte|Moradia|Saúde|Lazer|Compras|Serviços|Equipamentos|Outros"}' },
      ],
    }];

  } else {
    return reply(400, { error: 'Invalid type. Use "ocr" or "voice".' });
  }

  // ── Chamar a API da Anthropic ────────────────────────────────────────────
  try {
    const anthropicResp = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: type === 'ocr' ? 300 : 200,
        messages,
      }),
    });

    const data = await anthropicResp.json();

    if (!anthropicResp.ok) {
      console.error('Anthropic API error:', JSON.stringify(data));
      return reply(502, { error: 'AI service error' });
    }

    return reply(200, data);

  } catch (err) {
    console.error('Fetch error:', err.message);
    return reply(500, { error: 'Internal server error' });
  }
};
