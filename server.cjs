require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('@supabase/supabase-js');

// --- Configuração e Inicialização ---
const app = express();
const PORT = process.env.API_PORT || 3000;

// --- Variáveis de Ambiente ---
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const mercadoPagoAccessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
const mercadoPagoBaseUrl = process.env.MERCADO_PAGO_BASE_URL || 'https://api.mercadopago.com';
const webhookUrl = process.env.WEBHOOK_URL;

const pagarMeApiKey = process.env.PAGARME_API_KEY;

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

app.post('/api/pagarme/create-payment', async (req, res) => {
  const { amount, card_token } = req.body;

  if (!pagarMeApiKey) {
    return res.status(500).json({ error: 'A chave de API do Pagar.me não está configurada no servidor.' });
  }

  try {
    const pagarmeResponse = await axios.post('https://api.pagar.me/1/transactions', {
      api_key: pagarMeApiKey,
      amount: amount,
      card_token: card_token,
      payment_method: 'credit_card',
      async: false, // Processa a transação de forma síncrona
      customer: {
        external_id: uuidv4(),
        name: 'Cliente Teste',
        type: 'individual',
        country: 'br',
        email: 'cliente@teste.com',
        documents: [
          {
            type: 'cpf',
            number: '00000000000'
          }
        ],
        phone_numbers: ['+5511999999999']
      }
    });

    // Se a transação for bem-sucedida
    if (pagarmeResponse.data && (pagarmeResponse.data.status === 'paid' || pagarmeResponse.data.status === 'authorized')) {
      // TODO: Salvar a transação no seu banco de dados (Supabase)
      console.log('Pagamento Pagar.me bem-sucedido:', pagarmeResponse.data.id);
      res.status(200).json({ success: true, data: pagarmeResponse.data });
    } else {
      // Se a transação for recusada ou falhar
      console.error('Falha no pagamento Pagar.me:', pagarmeResponse.data.status);
      res.status(400).json({ success: false, error: `Pagamento falhou: ${pagarmeResponse.data.status}` });
    }

  } catch (error) {
    console.error('Erro ao processar pagamento com Pagar.me:', error.response ? error.response.data : error.message);
    res.status(500).json({ success: false, error: 'Erro interno no servidor ao processar o pagamento.' });
  }
});


// --- Iniciar Servidor ---
const crypto = require('crypto');

// Middleware para processar o corpo raw da requisição para o webhook do Inter
const rawBodySaver = (req, res, buf, encoding) => {
  if (buf && buf.length) {
    req.rawBody = buf.toString(encoding || 'utf8');
  }
};

app.use('/webhooks/inter', express.raw({ verify: rawBodySaver, type: '*/*' }));

// Função para verificar a assinatura do webhook do Banco Inter (manter comentada se não houver certificado)
function verifyInterWebhookSignature(req) {
  try {
    const signature = req.headers['x-inter-signature'];
    if (!signature) {
      console.error('Assinatura do webhook ausente');
      return false;
    }

    const caCertificate = process.env.INTER_CA_CERTIFICATE_CONTENT;
    if (!caCertificate) {
      console.error('Certificado CA do Inter não configurado');
      return false; // Em produção, isso deve ser um erro fatal
    }

    const verify = crypto.createVerify('SHA256');
    verify.update(req.rawBody);

    const isValid = verify.verify(caCertificate, signature, 'base64');

    if (!isValid) {
      console.error('Assinatura do webhook inválida');
    }

    return isValid;
  } catch (error) {
    console.error('Erro ao verificar a assinatura do webhook:', error);
    return false;
  }
}

app.post('/webhooks/inter', async (req, res) => {
  console.log('Webhook do Inter recebido.');

  // Descomente a linha abaixo quando o certificado estiver configurado
  // if (!verifyInterWebhookSignature(req)) {
  //   return res.status(401).json({ error: 'Assinatura inválida' });
  // }

  try {
    const body = JSON.parse(req.rawBody);

    if (!body.pix || !Array.isArray(body.pix)) {
      return res.status(400).json({ error: 'Payload de PIX inválido' });
    }

    for (const pix of body.pix) {
      const { endToEndId, status } = pix;

      if (!endToEndId) {
        console.warn('Entrada PIX sem endToEndId, pulando:', pix);
        continue;
      }

      if (status !== 'CONCLUIDO' && status !== 'CONFIRMADO') {
        console.log(`Status do PIX é '${status}', não 'CONCLUIDO'. Pulando.`);
        continue;
      }

      const { data, error } = await supabaseAdmin
        .from('pix_transactions')
        .update({ status: 'COMPLETED', updated_at: new Date().toISOString() })
        .eq('transaction_id', endToEndId)
        .select('user_id');

      if (error) {
        console.error('Erro ao atualizar a transação PIX:', error);
        continue; // Continua para o próximo item do array
      }

      if (data && data.length > 0) {
        console.log(`Transação ${endToEndId} atualizada para COMPLETED.`);
        const userId = data[0].user_id;
        // TODO: Adicionar lógica pós-pagamento, como renovar a assinatura do usuário.
        console.log(`Pagamento confirmado para o usuário: ${userId}`);
      } else {
        console.warn(`Nenhuma transação encontrada com o endToEndId: ${endToEndId}`);
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Erro ao processar o webhook do Inter:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor de API rodando na porta ${PORT}`);
});
