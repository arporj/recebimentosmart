import express from 'express';
import serverless from 'serverless-http';
import cors from 'cors';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const app = express();
const router = express.Router();

app.use(cors());
// Raw body needed for webhook signature verification — must come before json()
app.use((req, res, next) => {
  if (req.path === '/stripe/webhook') {
    express.raw({ type: 'application/json' })(req, res, next);
  } else {
    express.json()(req, res, next);
  }
});

/**
 * POST /api/stripe/create-checkout-session
 * Body: { amount: number (em centavos), planName: string, userId: string, userEmail: string, successUrl: string, cancelUrl: string }
 * Retorna: { url: string } — URL da página de checkout do Stripe
 */
router.post('/stripe/create-checkout-session', async (req, res) => {
  try {
    const { amount, planName, userId, userEmail, successUrl, cancelUrl } = req.body;

    if (!amount || !userId || !planName) {
      return res.status(400).json({ success: false, message: 'Parâmetros obrigatórios ausentes.' });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: userEmail || undefined,
      line_items: [
        {
          price_data: {
            currency: 'brl',
            unit_amount: Math.round(amount * 100), // Stripe usa centavos
            product_data: {
              name: `Recebimento Smart — Plano ${planName}`,
              description: `Assinatura mensal do Plano ${planName}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        user_id: userId,
        plan_name: planName,
      },
      success_url: successUrl || `${req.headers.origin}/v2/assinatura?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${req.headers.origin}/v2/assinatura?payment=cancelled`,
    });

    res.status(201).json({ success: true, url: session.url });
  } catch (error) {
    console.error('Erro ao criar sessão Stripe:', error.message);
    res.status(500).json({ success: false, message: 'Erro ao iniciar o checkout.' });
  }
});

/**
 * GET /api/stripe/session-status?session_id=cs_xxx
 * Retorna o status da sessão para exibir confirmação na tela
 */
router.get('/stripe/session-status', async (req, res) => {
  try {
    const { session_id } = req.query;

    if (!session_id) {
      return res.status(400).json({ success: false, message: 'session_id obrigatório.' });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);

    res.status(200).json({
      success: true,
      status: session.payment_status, // 'paid' | 'unpaid' | 'no_payment_required'
      customerEmail: session.customer_email,
      planName: session.metadata?.plan_name,
      amountTotal: session.amount_total, // em centavos
    });
  } catch (error) {
    console.error('Erro ao buscar status da sessão:', error.message);
    res.status(500).json({ success: false, message: 'Erro ao verificar o pagamento.' });
  }
});

/**
 * POST /api/stripe/webhook
 * Recebe eventos do Stripe e atualiza o banco de dados
 * Requer STRIPE_WEBHOOK_SECRET no .env (configurado após deploy)
 */
router.post('/stripe/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // Em desenvolvimento sem webhook secret configurado, usa o body direto
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata?.user_id;
    const planName = session.metadata?.plan_name;
    const transactionId = session.id;
    const amount = session.amount_total / 100; // converter centavos para reais

    if (!userId) {
      console.error('user_id ausente nos metadados da sessão.');
      return res.status(200).send('OK');
    }

    try {
      // 1. Verificar se já foi registrado (idempotência)
      const { data: existing } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('transaction_id', transactionId)
        .single();

      if (existing) {
        console.log(`Sessão ${transactionId} já registrada. Ignorando.`);
        return res.status(200).send('OK');
      }

      // 2. Registrar o pagamento
      const { error: insertError } = await supabase.from('subscriptions').insert({
        user_id: userId,
        amount,
        payment_provider: 'stripe',
        transaction_id: transactionId,
      });

      if (insertError) throw insertError;

      // 3. Atualizar o plano do usuário
      if (planName) {
        const { error: rpcError } = await supabase.rpc('update_user_subscription', {
          p_user_id: userId,
          p_plan_name: planName,
        });

        if (rpcError) {
          console.error('Erro ao atualizar plano:', rpcError);
        } else {
          console.log(`Plano ${planName} ativado para usuário ${userId}.`);
        }
      }
    } catch (err) {
      console.error('Erro ao processar webhook:', err.message);
      return res.status(500).json({ success: false });
    }
  }

  res.status(200).json({ received: true });
});

app.use('/api', router);

export const handler = serverless(app);