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
    const { title, unit_price, quantity, userId, metadata } = req.body;
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
        metadata: { ...metadata, user_id: userId }, // Inclui metadata adicional
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
        const planName = paymentDetails.metadata?.plan_name; // Pega o nome do plano
        const transactionId = paymentDetails.id;
        const amount = paymentDetails.transaction_amount;

        if (!userId) {
          throw new Error('UserID não encontrado nos metadados do pagamento.');
        }

        // 1. Verificar se o pagamento já foi registrado
        const { data: existingSubscription, error: selectError } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('transaction_id', transactionId)
          .single();

        if (selectError && selectError.code !== 'PGRST116') {
          throw selectError;
        }

        if (existingSubscription) {
          console.log(`Pagamento ${transactionId} já registrado. Ignorando.`);
          return res.status(200).send('OK - Pagamento já registrado');
        }

        // 2. Inserir o novo registro de pagamento
        const { error: insertError } = await supabase
          .from('subscriptions')
          .insert({
            user_id: userId,
            amount: amount,
            payment_provider: 'mercadopago',
            transaction_id: transactionId,
          });

        if (insertError) {
          throw insertError;
        }
        
        console.log(`Pagamento ${transactionId} para usuário ${userId} registrado.`);

        // 3. Se o plano foi especificado, atualiza o perfil do usuário
        if (planName) {
          const { error: rpcError } = await supabase.rpc('update_user_subscription', {
            p_user_id: userId,
            p_plan_name: planName,
          });

          if (rpcError) {
            console.error(`Erro ao atualizar plano para ${planName} para o usuário ${userId}:`, rpcError);
          } else {
            console.log(`Plano do usuário ${userId} atualizado para ${planName}.`);
          }
        }
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

// Rota para gerar pagamento (usada pela SubscriptionPage)
router.post('/generate-payment-mp', async (req, res) => {
  try {
    const { amount, description, userId, metadata, customerData } = req.body;
    const siteUrl = req.headers.origin;

    const preference = new Preference(mpClient);
    const result = await preference.create({
      body: {
        items: [{
          title: description,
          unit_price: Number(amount),
          quantity: 1,
          currency_id: 'BRL'
        }],
        payer: {
          email: customerData.email,
          first_name: customerData.firstName,
          last_name: customerData.lastName,
        },
        back_urls: {
          success: `${siteUrl}/assinatura`,
          failure: `${siteUrl}/assinatura`,
          pending: `${siteUrl}/assinatura`,
        },
        auto_return: 'approved',
        metadata: { ...metadata, user_id: userId },
        notification_url: `${siteUrl}/api/mp/webhook`,
      },
    });

    const pixData = result.point_of_interaction?.transaction_data;
    if (!pixData) {
      throw new Error('Dados do PIX não foram retornados pela API do Mercado Pago.');
    }

    res.status(201).json({
      success: true,
      paymentId: result.id,
      externalReference: result.external_reference,
      pixQrCode: pixData.qr_code,
      pixQrCodeBase64: pixData.qr_code_base64,
    });

  } catch (error) {
    console.error('Erro ao gerar pagamento no MP:', JSON.stringify(error, null, 2));
    res.status(500).json({ success: false, message: 'Erro ao gerar o pagamento.' });
  }
});


app.use('/api/mp', router);

export const handler = serverless(app);