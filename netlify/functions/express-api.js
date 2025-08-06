const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const mercadopago = require('mercadopago');

// Configure o Mercado Pago com seu Access Token
mercadopago.configure({
  access_token: 'TEST-6058466609332947-072217-b82dec033b5106f14bdb573acc981ed9-6402098',
});

const app = express();
const router = express.Router();

app.use(express.json());
app.use(cors());

// Rota para criar preferência de pagamento (PIX)
router.post('/create-preference', (req, res) => {
  console.log('[Express Function] Test route hit!');
  res.status(200).json({ success: true, message: 'Test preference created successfully!' });
});

// Rota para processar pagamento com cartão
router.post('/process-card-payment', async (req, res) => {
  const { token, description, transaction_amount, payer_email, userId } = req.body;

  // Objeto de pagamento simplificado. O token já contém os detalhes do cartão.
  const payment_data = {
    token: token,
    transaction_amount: Number(transaction_amount),
    installments: 1,
    description: description,
    payer: {
      email: payer_email,
    },
    metadata: {
      user_id: userId,
    }
  };

  try {
    const { body } = await mercadopago.payment.create(payment_data);
    res.status(201).json({ 
      success: true, 
      message: 'Pagamento processado com sucesso!',
      paymentId: body.id,
      status: body.status,
      status_detail: body.status_detail
    });
  } catch (error) {
    console.error('Erro detalhado ao processar pagamento:', JSON.stringify(error, null, 2));
    const errorMessage = error.cause?.[0]?.description || error.message || 'Erro desconhecido ao processar pagamento.';
    res.status(500).json({ success: false, message: errorMessage });
  }
});

app.use('/api/mp', router);

module.exports.handler = serverless(app);
