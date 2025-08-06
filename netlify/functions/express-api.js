import express from 'express';
import serverless from 'serverless-http';
import cors from 'cors';
import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';
import { createClient } from '@supabase/supabase-js';

// Inicializa o cliente do Mercado Pago
const mpClient = new MercadoPagoConfig({ 
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN,
  options: { timeout: 5000 }
});

// Inicializa o cliente do Supabase
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const app = express();
const router = express.Router();

app.use(express.json());
app.use(cors());

// Rota para criar preferência de pagamento
router.post('/create-preference', async (req, res) => {
  try {
    const { title, unit_price, quantity, userId } = req.body;
    const siteUrl = req.headers.origin;

    const preference = new Preference(mpClient);
    const result = await preference.create({
      body: {
        items: [{ title, unit_price: Number(unit_price), quantity: Number(quantity), currency_id: 'BRL' }],
        back_urls: {
          success: `${siteUrl}/payment-success`,
          failure: `${siteUrl}/payment-failure`,
          pending: `${siteUrl}/payment-pending`,
        },
        auto_return: 'approved',
        metadata: { user_id: userId },
        notification_url: `${siteUrl}/api/mp/webhook`,
      },
    });

    res.status(201).json({ success: true, init_point: result.init_point });

  } catch (error) {
    console.error('Erro ao criar preferência:', JSON.stringify(error, null, 2));
    res.status(500).json({ success: false, message: 'Erro ao criar preferência.' });
  }
});

// Rota de Webhook para receber notificações do Mercado Pago
router.post('/webhook', async (req, res) => {
  const { type, data } = req.body;

  if (type === 'payment') {
    try {
      const payment = new Payment(mpClient);
      const paymentDetails = await payment.get({ id: data.id });

      if (paymentDetails && paymentDetails.status === 'approved') {
        const userId = paymentDetails.metadata?.user_id;
        const transactionId = paymentDetails.id;
        const amount = paymentDetails.transaction_amount;

        if (!userId) {
          throw new Error('UserID não encontrado nos metadados do pagamento.');
        }

        // 1. Verificar se o pagamento já foi registrado para evitar duplicidade
        const { data: existingSubscription, error: selectError } = await supabase
          .from('subscriptions') // Nome da tabela corrigido
          .select('id')
          .eq('transaction_id', transactionId)
          .single();

        if (selectError && selectError.code !== 'PGRST116') { // PGRST116 significa "no rows found"
          throw selectError;
        }

        if (existingSubscription) {
          console.log(`Pagamento ${transactionId} já registrado. Ignorando.`);
          return res.status(200).send('OK - Pagamento já registrado');
        }

        // 2. Inserir o novo registro de pagamento na tabela 'subscriptions'
        const { error: insertError } = await supabase
          .from('subscriptions') // Nome da tabela corrigido
          .insert({
            user_id: userId,
            amount: amount,
            payment_provider: 'mercadopago',
            transaction_id: transactionId,
            // created_at e subscription_date usarão o default NOW() do banco de dados
          });

        if (insertError) {
          throw insertError;
        }
        
        console.log(`Pagamento ${transactionId} para usuário ${userId} registrado com sucesso na tabela subscriptions.`);
      }

      res.status(200).send('OK');

    } catch (error) {
      console.error('Erro no processamento do webhook:', error.message);
      res.status(500).json({ success: false, message: 'Erro interno no servidor.' });
    }
  } else {
    res.status(200).send('Notificação não relevante');
  }
});

app.use('/api/mp', router);

export const handler = serverless(app);
