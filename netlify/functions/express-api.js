import express from 'express';
import serverless from 'serverless-http';
import cors from 'cors';
import { MercadoPagoConfig, Payment } from 'mercadopago';

// Inicializa o cliente do Mercado Pago com o Access Token
const client = new MercadoPagoConfig({ 
  accessToken: 'TEST-6058466609332947-072217-b82dec033b5106f14bdb573acc981ed9-6402098',
  options: { timeout: 5000 }
});

const app = express();
const router = express.Router();

app.use(express.json());
app.use(cors());

// Rota de teste para criação de preferência (PIX)
router.post('/create-preference', (req, res) => {
  console.log('[Express Function] Test route hit!');
  res.status(200).json({ success: true, message: 'Test preference created successfully!' });
});

// Rota para processar pagamento com cartão usando o SDK v2
router.post('/process-card-payment', async (req, res) => {
  // Usando o e-mail do pagador vindo do frontend
  const { token, description, transaction_amount, payer_email, userId } = req.body;

  const payment = new Payment(client);

  const body = {
    transaction_amount: Number(transaction_amount),
    token: token,
    description: description,
    installments: 1,
    payer: {
      email: payer_email, // Revertido para usar o e-mail do usuário logado
    },
    metadata: {
      user_id: userId,
    },
  };

  try {
    const result = await payment.create({ body });
    res.status(201).json({ 
      success: true, 
      message: 'Pagamento processado com sucesso!',
      paymentId: result.id,
      status: result.status,
      status_detail: result.status_detail
    });
  } catch (error) {
    console.error('Erro detalhado ao processar pagamento:', JSON.stringify(error, null, 2));
    const errorMessage = error.cause?.[0]?.description || error.message || 'Erro desconhecido ao processar pagamento.';
    res.status(500).json({ success: false, message: errorMessage });
  }
});

app.use('/api/mp', router);

// Transforma o app Express em uma função serverless
export const handler = serverless(app);