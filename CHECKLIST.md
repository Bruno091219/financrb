# ✅ Checklist — Finan.RB pronto para publicar

## 1. Supabase
- [ ] Criar projeto em supabase.com
- [ ] Rodar o schema.sql no SQL Editor
- [ ] Copiar Project URL e Anon Key
- [ ] Authentication → Providers → Email (ativado por padrão)
- [ ] Authentication → Providers → Google (opcional — precisa de Client ID e Secret do Google Cloud)
- [ ] Authentication → URL Configuration → Site URL: https://seuapp.netlify.app
- [ ] Authentication → URL Configuration → Redirect URLs: https://seuapp.netlify.app/app.html

## 2. Stripe
- [ ] Criar conta em stripe.com
- [ ] Criar produto "Finan.RB Pro" → R$ 19/mês (recorrente)
- [ ] Criar Payment Link com Success URL: https://seuapp.netlify.app/app.html?upgraded=1
- [ ] Ativar Customer Portal (Dashboard → Customer Portal)
- [ ] Copiar: Payment Link URL, Customer Portal URL, Secret Key, Publishable Key

## 3. Preencher CONFIG no app.html
```js
const CONFIG = {
  SUPABASE_URL:        'https://XXXXXXXXXXX.supabase.co',
  SUPABASE_ANON_KEY:   'eyJhbGci...',
  STRIPE_PAYMENT_LINK: 'https://buy.stripe.com/...',
  STRIPE_PORTAL_URL:   'https://billing.stripe.com/p/...',
  FREE_ITEMS_LIMIT:    50,
  APP_URL:             'https://seuapp.netlify.app',
};
```

## 4. Preencher dados nos documentos legais
Em privacy.html e terms.html, substitua:
- [ ] [Seu Nome / Empresa]
- [ ] CNPJ 00.000.000/0001-00
- [ ] [Cidade/Estado]
- [ ] [Endereço Completo]
- [ ] contato@financrb.com.br → seu e-mail real
- [ ] privacidade@financrb.com.br → seu e-mail de privacidade
- [ ] dpo@financrb.com.br → seu e-mail de DPO

## 5. Deploy no Netlify
- [ ] Criar conta em netlify.com
- [ ] Fazer upload da pasta (app.netlify.com/drop) ou conectar GitHub
- [ ] Definir as variáveis de ambiente:
  - STRIPE_SECRET_KEY = sk_live_...
  - STRIPE_WEBHOOK_SECRET = whsec_... (obtido após criar webhook)
  - SUPABASE_URL = https://xxx.supabase.co
  - SUPABASE_SERVICE_KEY = eyJhbGci... (service_role, NÃO a anon)
- [ ] Anotar a URL do seu site (ex: financrb.netlify.app)
- [ ] Opcionalmente configurar domínio customizado

## 6. Webhook Stripe
- [ ] Stripe → Developers → Webhooks → Add endpoint
- [ ] URL: https://seuapp.netlify.app/.netlify/functions/stripe-webhook
- [ ] Eventos a escutar:
  - checkout.session.completed
  - invoice.payment_succeeded
  - invoice.payment_failed
  - customer.subscription.deleted
- [ ] Copiar o Signing Secret → salvar como STRIPE_WEBHOOK_SECRET no Netlify

## 7. Testar antes de ativar produção
- [ ] Criar conta no app e verificar se aparece no Supabase (Authentication → Users)
- [ ] Adicionar alguns gastos e verificar se aparecem na tabela items do Supabase
- [ ] Testar fluxo de upgrade com cartão de teste Stripe (4242 4242 4242 4242)
- [ ] Verificar se o plano muda para Pro após o checkout
- [ ] Testar cancelamento e verificar downgrade para Free
- [ ] Testar recuperação de senha
- [ ] Testar em modo mobile (iOS Safari e Android Chrome)
- [ ] Verificar links de Política de Privacidade e Termos de Uso

## 8. Antes de divulgar
- [ ] Ativar chaves de PRODUÇÃO do Stripe (substituir sk_test_ por sk_live_)
- [ ] Verificar se Google Analytics está configurado (opcional)
- [ ] Testar o link de compartilhamento no WhatsApp (Open Graph)
- [ ] Adicionar domínio customizado (ex: financrb.com.br) — opcional
- [ ] Verificar se o favicon aparece corretamente no browser

## Estrutura final de arquivos
```
financer-final/
  index.html          ← landing page (página inicial)
  app.html            ← o app em si (acessado após login)
  privacy.html        ← política de privacidade
  terms.html          ← termos de uso
  favicon.svg         ← ícone do site
  netlify.toml        ← configuração do Netlify
  package.json        ← dependências do webhook
  schema.sql          ← rode no Supabase
  netlify/
    functions/
      stripe-webhook.js ← webhook do Stripe
```
