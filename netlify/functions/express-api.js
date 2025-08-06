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

// Nova rota para processar pagamento com cartão
router.post('/process-card-payment', async (req, res) => {
  const { token, description, transaction_amount, payer_email, userId } = req.body;

  const payment_data = {
    token: token,
    issuer_id: req.body.issuer_id, // Opcional, mas recomendado
    payment_method_id: req.body.payment_method_id, // Opcional, mas recomendado
    transaction_amount: Number(transaction_amount),
    installments: 1, // Pagamento em 1 parcela
    description: description,
    payer: {
      email: payer_email,
      // first_name e last_name podem ser adicionados se disponíveis
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
    console.error('Erro ao processar pagamento com cartão:', error);
    const errorMessage = error.cause?.message || 'Erro desconhecido ao processar pagamento.';
    res.status(500).json({ success: false, message: errorMessage });
  }
});

app.use('/api/mp', router);

module.exports.handler = serverless(app);