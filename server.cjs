require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('@supabase/supabase-js');

// --- Configuração e Inicialização ---
const app = express();
const PORT = process.env.API_PORT || 3000;

// --- Variáveis de Ambiente ---
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validação das Variáveis do Supabase
if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('ERRO CRÍTICO: Variáveis de ambiente essenciais (Supabase) não estão definidas. Verifique seu arquivo .env');
  process.exit(1);
}

// Inicialização do Cliente Admin do Supabase
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

// --- Middlewares ---
app.use(cors());
app.use(express.json());

// --- Setup do Handshake mTLS com Banco Inter ---
const interEnv = process.env.INTER_ENV || 'sandbox';
const certName = interEnv === 'sandbox' ? 'Sandbox_InterAPI_Certificado.crt' : 'Inter API_Certificado.crt';
const keyName = interEnv === 'sandbox' ? 'Sandbox_InterAPI_Chave.key' : 'Inter API_Chave.key';
const certPath = path.join(__dirname, 'certs', certName);
const keyPath = path.join(__dirname, 'certs', keyName);

let httpsAgent = null;

try {
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    httpsAgent = new https.Agent({
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
      rejectUnauthorized: false // Desabilita rejeição para certificados UAT de testes
    });
    console.log(`[mTLS] Certificados do Banco Inter (${interEnv}) carregados com sucesso.`);
  } else {
    console.warn(`[mTLS] AVISO: Certificados mTLS do Banco Inter não encontrados em: ${certPath} ou ${keyPath}. O servidor usará o modo simulado (fallback).`);
  }
} catch (err) {
  console.error(`[mTLS] Erro ao carregar certificados do Banco Inter:`, err.message);
}

// --- Função para obter o Token OAuth do Banco Inter (mTLS) ---
async function getInterOAuthToken() {
  const baseUrl = interEnv === 'sandbox' 
    ? 'https://cdpj-sandbox.partners.uatinter.co' 
    : 'https://cdpj.partners.bancointer.com.br';
  
  const tokenUrl = `${baseUrl}/oauth/v2/token`;
  const clientId = process.env.INTER_CLIENT_ID;
  const clientSecret = process.env.INTER_CLIENT_SECRET;

  if (!httpsAgent) {
    throw new Error('Certificados mTLS do Banco Inter não foram configurados ou carregados corretamente.');
  }

  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('scope', 'cob.write cob.read pix.read');

  if (clientId && clientSecret) {
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
  }

  console.log(`[OAuth] Solicitando token de acesso no Banco Inter (${interEnv})...`);
  
  const response = await axios.post(tokenUrl, params.toString(), {
    httpsAgent,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });

  if (!response.data || !response.data.access_token) {
    throw new Error('Retorno inválido ao solicitar token de acesso.');
  }

  return response.data.access_token;
}

// --- Rotas de API da Assinatura ---

/**
 * POST /api/pix/create-payment
 * Body: { amount, planName, userId }
 * Cria uma cobrança imediata PIX dinamicamente usando mTLS com Banco Inter.
 */
app.post('/api/pix/create-payment', async (req, res) => {
  const { amount, planName, userId } = req.body;

  if (!amount || !userId || !planName) {
    return res.status(400).json({ success: false, message: 'Parâmetros obrigatórios ausentes (amount, planName, userId).' });
  }

  // Definição do valor final de cobrança simbólica para testes em Sandbox
  let finalAmount = parseFloat(amount);
  if (interEnv === 'sandbox') {
    // Cobrança simbólica em Sandbox de testes: Básico = R$ 1.00, Pró = R$ 2.00
    finalAmount = planName.toLowerCase().includes('pro') ? 2.00 : 1.00;
    console.log(`[Sandbox] Valor real de R$ ${amount} convertido para valor simbólico de R$ ${finalAmount.toFixed(2)} para testes.`);
  }

  try {
    const token = await getInterOAuthToken();
    const baseUrl = interEnv === 'sandbox' 
      ? 'https://cdpj-sandbox.partners.uatinter.co' 
      : 'https://cdpj.partners.bancointer.com.br';
    
    const cobUrl = `${baseUrl}/pix/v2/cob`;
    const interChavePix = process.env.INTER_CHAVE_PIX || '37.905.181/0001-05';

    const payload = {
      calendario: {
        expiracao: 3600 // Vencimento em 1 hora
      },
      valor: {
        original: finalAmount.toFixed(2)
      },
      chave: interChavePix.replace(/[^a-zA-Z0-9]/g, ''), // Limpa caracteres especiais do CNPJ
      solicitacaoPagador: `Recebimento Smart - Assinatura ${planName}`
    };

    console.log(`[PIX] Solicitando cobrança Pix Cob imediata no Banco Inter (${interEnv})...`);

    const response = await axios.post(cobUrl, payload, {
      httpsAgent,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const { txid, pixCopiaECola } = response.data;

    if (!txid || !pixCopiaECola) {
      throw new Error('Banco Inter retornou dados de cobrança vazios ou inválidos.');
    }

    // Salvar no Supabase a transação no estado PENDING
    console.log(`[DB] Salvando transação pendente no Supabase para usuário ${userId}. txid: ${txid}`);
    const { error: dbError } = await supabaseAdmin
      .from('pix_transactions')
      .insert({
        user_id: userId,
        transaction_id: txid,
        amount: finalAmount,
        status: 'PENDING',
        plan_name: planName,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (dbError) {
      console.error('[DB] Erro ao gravar transação no banco de dados:', dbError.message);
      throw dbError;
    }

    res.status(201).json({
      success: true,
      txid,
      pixCopiaECola,
      simulated: false
    });

  } catch (error) {
    console.error('[PIX] Falha ao obter cobrança PIX do Banco Inter:', error.response?.data || error.message);

    // Fallback inteligente para Sandbox: Se as credenciais ou mTLS falharem na Sandbox, geramos um Pix simulado
    if (interEnv === 'sandbox') {
      console.log('[PIX] --- UTILIZANDO FALLBACK SIMULADO EM SANDBOX ---');
      const mockTxid = 'SIMULADO_' + uuidv4().replace(/-/g, '').substring(0, 24);
      const mockPixCopiaECola = `00020101021226870014br.gov.bcb.pix2565379051810001055204000053039865404${finalAmount.toFixed(2)}5802BR5925RECEBIMENTO SMART6009SAO PAULO62300526${mockTxid}6304`;

      try {
        const { error: dbError } = await supabaseAdmin
          .from('pix_transactions')
          .insert({
            user_id: userId,
            transaction_id: mockTxid,
            amount: finalAmount,
            status: 'PENDING',
            plan_name: planName,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

        if (dbError) {
          console.error('[DB] Aviso: Erro ao gravar transação simulada no banco de dados (mas prosseguindo no Sandbox):', dbError.message);
        }
      } catch (dbCatchError) {
        console.error('[DB] Erro de exceção ao gravar transação simulada:', dbCatchError.message);
      }

      // Retorna sucesso com o Pix simulado para que o frontend exiba o QR Code e não trave na tela branca
      return res.status(201).json({
        success: true,
        txid: mockTxid,
        pixCopiaECola: mockPixCopiaECola,
        simulated: true
      });
    }

    res.status(500).json({
      success: false,
      message: 'Não foi possível gerar a cobrança do Pix. Contate o suporte ou tente novamente.',
      details: error.response?.data || error.message
    });
  }
});

// --- Rota de Simulação de Webhook (Útil para testes no Sandbox local) ---
app.post('/api/pix/simulate-webhook', async (req, res) => {
  if (interEnv !== 'sandbox') {
    return res.status(403).json({ success: false, message: 'A simulação do webhook está habilitada apenas no ambiente Sandbox/Desenvolvimento.' });
  }

  const { txid } = req.body;
  if (!txid) {
    return res.status(400).json({ success: false, message: 'txid obrigatório para a simulação.' });
  }

  console.log(`[Simulação] Disparando simulação de pagamento de webhook para txid: ${txid}`);

  try {
    const mockPayload = {
      pix: [
        {
          txid: txid,
          valor: "1.00",
          endToEndId: "E" + Date.now() + "12345678",
          horario: new Date().toISOString(),
          status: "CONCLUIDO"
        }
      ]
    };

    // Envia localmente a requisição ao webhook do Inter
    const response = await axios.post(`http://localhost:${PORT}/webhooks/inter`, mockPayload, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    res.json({ success: true, message: 'Simulação de webhook enviada com sucesso!', webhookResponse: response.data });
  } catch (error) {
    console.error('[Simulação] Erro ao disparar o webhook de simulação:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- Configuração do Webhook Banco Inter ---

// Middleware para capturar o rawBody necessário para validações futuras de assinatura do Inter
const rawBodySaver = (req, res, buf, encoding) => {
  if (buf && buf.length) {
    req.rawBody = buf.toString(encoding || 'utf8');
  }
};

app.use('/webhooks/inter', express.raw({ verify: rawBodySaver, type: '*/*' }));

// Rota de recebimento de confirmações de pagamento via Webhook do Banco Inter
app.post('/webhooks/inter', async (req, res) => {
  console.log('[Webhook] Webhook do Banco Inter recebido.');

  try {
    let body = null;
    if (req.rawBody) {
      body = JSON.parse(req.rawBody);
    } else {
      body = req.body;
    }

    if (!body || !body.pix || !Array.isArray(body.pix)) {
      return res.status(400).json({ error: 'Payload de notificação Pix inválido ou vazio.' });
    }

    for (const pix of body.pix) {
      const { txid, endToEndId, valor } = pix;
      const transactionId = txid || endToEndId;

      if (!transactionId) {
        console.warn('[Webhook] Entrada PIX sem txid ou endToEndId. Ignorando:', pix);
        continue;
      }

      console.log(`[Webhook] Processando pagamento PIX: ${transactionId}, Valor: R$ ${valor || 'simulado'}`);

      // 1. Atualizar o status da transação em pix_transactions para COMPLETED
      const { data, error } = await supabaseAdmin
        .from('pix_transactions')
        .update({ 
          status: 'COMPLETED', 
          updated_at: new Date().toISOString() 
        })
        .eq('transaction_id', transactionId)
        .select('*');

      if (error) {
        console.error(`[Webhook] Erro ao atualizar transação ${transactionId} no banco:`, error.message);
        continue;
      }

      if (data && data.length > 0) {
        const transaction = data[0];
        const userId = transaction.user_id;
        const amountPaid = parseFloat(transaction.amount);

        // 2. Determinar o plano com base na coluna plan_name ou no valor pago (para retrocompatibilidade)
        let planName = transaction.plan_name ? transaction.plan_name.toLowerCase() : 'basico';
        if (!transaction.plan_name) {
          if (amountPaid >= 20.00 || amountPaid === 2.00) {
            planName = 'pro';
          }
        }

        console.log(`[Webhook] Ativando a assinatura do plano '${planName}' para o usuário ${userId}...`);

        // 3. Executar ativação da assinatura no banco chamando a função RPC
        const { error: rpcError } = await supabaseAdmin.rpc('update_user_subscription', {
          p_user_id: userId,
          p_plan_name: planName
        });

        if (rpcError) {
          console.error(`[Webhook] Erro na ativação RPC para o usuário ${userId}:`, rpcError.message);
        } else {
          console.log(`[Webhook] Assinatura do plano '${planName}' ativada com sucesso para o usuário ${userId}.`);
          
          // Registrar pagamento na tabela payments para históricos
          await supabaseAdmin.from('payments').insert({
            user_id: userId,
            amount: amountPaid,
            status: 'completed',
            transaction_id: transactionId,
            payment_method: 'pix'
          }).catch(err => console.error('[Webhook] Erro ao registrar histórico de pagamento:', err.message));

          // Atribuir bônus de indicação
          await supabaseAdmin.rpc('grant_referral_credit', {
            referred_user_id: userId,
            paid_plan: planName
          }).catch(err => console.error('[Webhook] Erro ao conceder créditos de indicação:', err.message));
        }

      } else {
        console.warn(`[Webhook] Nenhuma transação pendente encontrada com o identificador: ${transactionId}`);
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[Webhook] Falha crítica ao processar o webhook do Inter:', error.message);
    res.status(500).json({ error: 'Erro ao processar confirmação de pagamento.' });
  }
});

// --- Inicialização do Servidor ---
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`Servidor de API do Recebimento Smart ativo!`);
  console.log(`Rodando na porta local: http://localhost:${PORT}`);
  console.log(`Ambiente de Integração Inter: [${interEnv.toUpperCase()}]`);
  console.log(`======================================================\n`);
});
