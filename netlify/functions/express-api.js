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
        
        if (!userId) {
          throw new Error('UserID não encontrado nos metadados do pagamento.');
        }

        // Lógica para atualizar a assinatura no Supabase
        const { data: subscription, error } = await supabase
          .from('Assinatura')
          .select('id')
          .eq('usuario_id', userId)
          .order('data_inicio', { ascending: false })
          .limit(1)
          .single();

        if (error && error.code !== 'PGRST116') { // Ignora erro se não encontrar assinatura
          throw error;
        }

        const today = new Date();
        const endDate = new Date();
        endDate.setDate(today.getDate() + 30);

        const subscriptionData = {
          usuario_id: userId,
          plano: 'Mensal',
          valor: paymentDetails.transaction_amount,
          status: 'ativa',
          data_inicio: today.toISOString(),
          data_fim: endDate.toISOString(),
          metodo_pagamento: 'mercadopago',
          referencia_pagamento: paymentDetails.id,
        };

        if (subscription) {
          // Atualiza assinatura existente
          const { error: updateError } = await supabase
            .from('Assinatura')
            .update(subscriptionData)
            .eq('id', subscription.id);
          if (updateError) throw updateError;
        } else {
          // Cria nova assinatura
          const { error: insertError } = await supabase
            .from('Assinatura')
            .insert(subscriptionData);
          if (insertError) throw insertError;
        }
        
        console.log(`Assinatura para usuário ${userId} atualizada com sucesso.`);
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