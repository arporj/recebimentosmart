import express from 'express';
import serverless from 'serverless-http';
import cors from 'cors';
import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';

// Inicializa o cliente do Mercado Pago com o Access Token
const client = new MercadoPagoConfig({ 
  accessToken: 'TEST-6058466609332947-072217-b82dec033b5106f14bdb573acc981ed9-6402098',
  options: { timeout: 5000 }
});

const app = express();
const router = express.Router();

app.use(express.json());
app.use(cors());

// Rota para criar preferência de pagamento e redirecionar para o checkout
router.post('/create-preference', async (req, res) => {
  try {
    const { title, unit_price, quantity, userId } = req.body;
    const siteUrl = req.headers.origin; // URL base do site (ex: https://recebimentosmart.com.br)

    const preference = new Preference(client);

    const result = await preference.create({
      body: {
        items: [
          {
            title: title,
            unit_price: Number(unit_price),
            quantity: Number(quantity),
            currency_id: 'BRL',
          },
        ],
        back_urls: {
          success: `${siteUrl}/payment-success`,
          failure: `${siteUrl}/payment-failure`,
          pending: `${siteUrl}/payment-pending`,
        },
        auto_return: 'approved',
        metadata: {
          user_id: userId,
        },
        // notification_url: `${siteUrl}/api/mp/webhook` // Opcional: para receber webhooks
      },
    });

    res.status(201).json({ 
      success: true, 
      preferenceId: result.id,
      init_point: result.init_point // URL de checkout do Mercado Pago
    });

  } catch (error) {
    console.error('Erro ao criar preferência:', JSON.stringify(error, null, 2));
    const errorMessage = error.cause?.[0]?.description || error.message || 'Erro desconhecido ao criar preferência.';
    res.status(500).json({ success: false, message: errorMessage });
  }
});

// Rota para processar pagamento com cartão (teste programático - manter por enquanto)
router.post('/process-card-payment', async (req, res) => {
  const { token, description, transaction_amount, payer_email, userId } = req.body;
  const payment = new Payment(client);
  const body = {
    transaction_amount: Number(transaction_amount),
    token: token,
    description: description,
    installments: 1,
    payer: { email: payer_email },
    metadata: { user_id: userId },
  };

  try {
    const result = await payment.create({ body });
    res.status(201).json({ 
      success: true, 
      paymentId: result.id,
      status: result.status,
    });
  } catch (error) {
    console.error('Erro detalhado ao processar pagamento:', JSON.stringify(error, null, 2));
    const errorMessage = error.cause?.[0]?.description || error.message || 'Erro desconhecido.';
    res.status(500).json({ success: false, message: errorMessage });
  }
});

app.use('/api/mp', router);

export const handler = serverless(app);
