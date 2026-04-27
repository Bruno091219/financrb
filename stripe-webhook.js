// netlify/functions/stripe-webhook.js
// Recebe eventos do Stripe e atualiza o plano no Supabase

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // chave de serviço — NUNCA no frontend
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const sig = event.headers['stripe-signature'];
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  console.log(`Stripe event: ${stripeEvent.type}`);

  try {
    switch (stripeEvent.type) {

      // Pagamento confirmado (checkout completado)
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object;
        const email = session.customer_details?.email;
        const customerId = session.customer;

        if (!email) break;

        // Busca o usuário no Supabase pelo e-mail
        const { data: { users }, error } = await supabase.auth.admin.listUsers();
        if (error) throw error;

        const user = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
        if (!user) {
          console.warn(`User not found for email: ${email}`);
          break;
        }

        // Atualiza para Pro
        const { error: updateError } = await supabase
          .from('profiles')
          .upsert({
            id: user.id,
            plan: 'pro',
            stripe_customer: customerId,
          }, { onConflict: 'id' });

        if (updateError) throw updateError;
        console.log(`✅ User ${email} upgraded to Pro`);
        break;
      }

      // Assinatura renovada (pagamento mensal recorrente)
      case 'invoice.payment_succeeded': {
        const invoice = stripeEvent.data.object;
        const customerId = invoice.customer;
        if (!customerId) break;

        const { error } = await supabase
          .from('profiles')
          .update({ plan: 'pro' })
          .eq('stripe_customer', customerId);

        if (error) throw error;
        console.log(`✅ Subscription renewed for customer ${customerId}`);
        break;
      }

      // Pagamento falhou
      case 'invoice.payment_failed': {
        const invoice = stripeEvent.data.object;
        const customerId = invoice.customer;
        if (!customerId) break;

        // Opcionalmente: downgrade para free após falha
        // Você pode escolher dar um período de graça antes de downgradar
        console.warn(`⚠️ Payment failed for customer ${customerId}`);
        // Descomente para downgrade imediato:
        // await supabase.from('profiles').update({ plan: 'free' }).eq('stripe_customer', customerId);
        break;
      }

      // Assinatura cancelada ou expirada
      case 'customer.subscription.deleted': {
        const sub = stripeEvent.data.object;
        const customerId = sub.customer;
        if (!customerId) break;

        const { error } = await supabase
          .from('profiles')
          .update({ plan: 'free' })
          .eq('stripe_customer', customerId);

        if (error) throw error;
        console.log(`✅ Subscription cancelled for customer ${customerId} — downgraded to free`);
        break;
      }

      default:
        console.log(`Unhandled event type: ${stripeEvent.type}`);
    }
  } catch (err) {
    console.error('Handler error:', err);
    return { statusCode: 500, body: `Internal error: ${err.message}` };
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
