require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('@supabase/supabase-js');

// --- Configuração e Inicialização ---
const app = express();
const PORT = process.env.API_PORT || 3001;

// --- Variáveis de Ambiente ---
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const mercadoPagoAccessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
const mercadoPagoBaseUrl = process.env.MERCADO_PAGO_BASE_URL || 'https://api.mercadopago.com';
const webhookUrl = process.env.WEBHOOK_URL;

// Validação das Variáveis
if (!supabaseUrl || !supabaseServiceRoleKey || !mercadoPagoAccessToken) {
  console.error('ERRO CRÍTICO: Variáveis de ambiente essenciais (Supabase, Mercado Pago) não estão definidas. Verifique seu arquivo .env');
  process.exit(1); // Encerra o servidor se a configuração for inválida
}

// --- Middlewares ---
app.use(cors());
app.use(express.json());

// --- Cliente Supabase ---
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

// --- Rotas da API ---
app.post('/api/generate-payment-mp', async (req, res) => {
  try {
    const { 
      amount, 
      description, 
      userId, 
      paymentMethod = 'pix',
      customerData,
      cardData,
      installments = 1
    } = req.body;

    if (!amount || !description || !userId) {
      return res.status(400).json({ success: false, message: 'Dados obrigatórios: amount, description, userId' });
    }

    const externalReference = uuidv4();
    await saveTransactionAssociation(externalReference, userId, amount, description);

    const payer = {
      email: customerData?.email || 'cliente@exemplo.com',
      identification: { type: 'CPF', number: customerData?.cpf || '12345678909' },
      first_name: customerData?.firstName || 'Cliente',
      last_name: customerData?.lastName || 'Exemplo'
    };

    let paymentPayload;
    switch (paymentMethod) {
      case 'pix':
        paymentPayload = createPixPaymentPayload(amount, description, payer, externalReference);
        break;
      case 'credit_card':
        if (!cardData) return res.status(400).json({ success: false, message: 'Dados do cartão são obrigatórios' });
        paymentPayload = createCreditCardPaymentPayload(amount, description, payer, cardData, installments, externalReference);
        break;
      case 'debit_card':
        if (!cardData) return res.status(400).json({ success: false, message: 'Dados do cartão são obrigatórios' });
        paymentPayload = createDebitCardPaymentPayload(amount, description, payer, cardData, externalReference);
        break;
      case 'ticket':
        paymentPayload = createTicketPaymentPayload(amount, description, payer, externalReference);
        break;
      default:
        return res.status(400).json({ success: false, message: 'Método de pagamento não suportado' });
    }

    if (webhookUrl) {
      paymentPayload.notification_url = webhookUrl;
    }

    const response = await axios.post(
      `${mercadoPagoBaseUrl}/v1/payments`,
      paymentPayload,
      {
        headers: {
          Authorization: `Bearer ${mercadoPagoAccessToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': externalReference
        }
      }
    );

    const payment = response.data;
    const responseData = {
      success: true,
      externalReference,
      paymentId: payment.id,
      status: payment.status,
      paymentMethod,
      amount,
      currency: payment.currency_id
    };

    if (paymentMethod === 'pix') {
      responseData.pixQrCode = payment.point_of_interaction?.transaction_data?.qr_code;
      responseData.pixQrCodeBase64 = payment.point_of_interaction?.transaction_data?.qr_code_base64;
      responseData.pixTicketUrl = payment.point_of_interaction?.transaction_data?.ticket_url;
    } else if (paymentMethod === 'ticket') {
      responseData.ticketUrl = payment.transaction_details?.external_resource_url;
    }

    res.status(200).json(responseData);

  } catch (error) {
    console.error('Erro detalhado na função:', error.response?.data || error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Falha ao gerar pagamento',
      error: error.response?.data || error.message
    });
  }
});

// --- Funções Auxiliares ---
function createPixPaymentPayload(amount, description, payer, externalReference) {
  return { transaction_amount: amount, description, payment_method_id: 'pix', payer, external_reference: externalReference };
}
function createCreditCardPaymentPayload(amount, description, payer, cardData, installments, externalReference) {
  return { transaction_amount: amount, description, payment_method_id: cardData.payment_method_id || 'visa', token: cardData.token, installments, payer, external_reference: externalReference };
}
function createDebitCardPaymentPayload(amount, description, payer, cardData, externalReference) {
  return { transaction_amount: amount, description, payment_method_id: cardData.payment_method_id || 'debvisa', token: cardData.token, payer, external_reference: externalReference };
}
function createTicketPaymentPayload(amount, description, payer, externalReference) {
  return { transaction_amount: amount, description, payment_method_id: 'bolbradesco', payer: { ...payer, address: { zip_code: '01310-100', street_name: 'Av Paulista', street_number: 1000, neighborhood: 'Bela Vista', city: 'São Paulo', federal_unit: 'SP' } }, external_reference: externalReference };
}
async function saveTransactionAssociation(externalReference, userId, amount, description) {
  try {
    const { error } = await supabaseAdmin.from('payment_transactions').insert({ reference_id: externalReference, user_id: userId, amount, description, status: 'PENDING', created_at: new Date().toISOString() });
    if (error) console.error('Erro ao salvar associação da transação:', error);
  } catch (error) {
    console.error('Erro ao salvar associação da transação:', error);
  }
}

// --- Iniciar Servidor ---
app.listen(PORT, () => {
  console.log(`Servidor de API rodando na porta ${PORT}`);
});
