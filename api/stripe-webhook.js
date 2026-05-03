const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  const sig = req.headers['stripe-signature'];
  const rawBody = await getRawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[webhook] assinatura inválida:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('[webhook] evento:', event.type);

  try {
    switch (event.type) {

      // Pagamento confirmado — ativa plano Pro
      case 'checkout.session.completed': {
        const session = event.data.object;
        const customerId = session.customer;
        const email = session.customer_details?.email;
        // client_reference_id é o Supabase user ID passado pelo openUpgrade()
        let userId = session.client_reference_id || null;

        if (!userId && email) {
          // Fallback: busca por e-mail se client_reference_id não veio
          const { data } = await supabase.auth.admin.listUsers({ perPage: 1000 });
          const found = (data?.users || []).find(u => u.email?.toLowerCase() === email.toLowerCase());
          userId = found?.id || null;
        }

        if (!userId) { console.warn('[webhook] usuário não encontrado:', email); break; }

        const { error } = await supabase
          .from('profiles')
          .upsert({ id: userId, plan: 'pro', stripe_customer: customerId }, { onConflict: 'id' });
        if (error) throw error;
        console.log('[webhook] Pro ativado:', userId);
        break;
      }

      // Renovação mensal — mantém plano Pro
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        if (!invoice.customer) break;
        const { error } = await supabase
          .from('profiles')
          .update({ plan: 'pro' })
          .eq('stripe_customer', invoice.customer);
        if (error) throw error;
        console.log('[webhook] renovação confirmada:', invoice.customer);
        break;
      }

      // Falha no pagamento — registra no log (sem downgrade imediato)
      case 'invoice.payment_failed': {
        console.warn('[webhook] pagamento falhou:', event.data.object.customer);
        break;
      }

      // Assinatura cancelada — volta para free
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        if (!sub.customer) break;
        const { error } = await supabase
          .from('profiles')
          .update({ plan: 'free' })
          .eq('stripe_customer', sub.customer);
        if (error) throw error;
        console.log('[webhook] cancelado, voltou para free:', sub.customer);
        break;
      }

      default:
        console.log('[webhook] evento não tratado:', event.type);
    }
  } catch (err) {
    console.error('[webhook] erro interno:', err.message);
    return res.status(500).json({ error: err.message });
  }

  res.json({ received: true });
}

// Desabilita body parser do Vercel para receber o body raw (obrigatório para verificar assinatura Stripe)
handler.config = { api: { bodyParser: false } };

module.exports = handler;
