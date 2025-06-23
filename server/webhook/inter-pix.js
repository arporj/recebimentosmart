// Webhook para receber notificações de pagamento PIX do Banco Inter
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Função para verificar a assinatura do webhook do Banco Inter
function verifyInterWebhookSignature(req) {
  try {
    // Obter cabeçalhos relevantes da requisição
    const signature = req.headers['x-inter-signature'];
    const timestamp = req.headers['x-inter-timestamp'];
    
    if (!signature || !timestamp) {
      console.error('Cabeçalhos de assinatura ausentes');
      return false;
    }
    
    // Obter o corpo da requisição como string
    const requestBody = typeof req.body === 'string' 
      ? req.body 
      : JSON.stringify(req.body);
    
    // Concatenar timestamp e corpo da requisição
    const signatureData = timestamp + requestBody;
    
    // Obter o certificado CA do Banco Inter
    let caCertificate;
    if (process.env.INTER_CA_CERTIFICATE_CONTENT) {
      // Usar o conteúdo diretamente da variável de ambiente (para Netlify/Vercel)
      caCertificate = Buffer.from(process.env.INTER_CA_CERTIFICATE_CONTENT, 'utf-8');
    } else if (process.env.INTER_CA_CERTIFICATE_PATH) {
      // Ou ler do arquivo (para desenvolvimento local)
      caCertificate = fs.readFileSync(process.env.INTER_CA_CERTIFICATE_PATH);
    } else {
      console.error('Certificado CA do Banco Inter não configurado');
      return false;
    }
    
    // Verificar a assinatura usando o certificado CA
    const verify = crypto.createVerify('SHA256');
    verify.update(signatureData);
    
    const isValid = verify.verify(caCertificate, signature, 'base64');
    
    if (!isValid) {
      console.error('Assinatura inválida');
    }
    
    return isValid;
  } catch (error) {
    console.error('Erro ao verificar assinatura:', error);
    return false;
  }
}

// Função para encontrar o ID do usuário associado a uma transação PIX
async function findUserIdByTransactionId(transactionId) {
  try {
    // Buscar na tabela de pagamentos pelo ID da transação
    const { data, error } = await supabase
      .from('payments')
      .select('user_id')
      .eq('transaction_id', transactionId)
      .single();
    
    if (error) {
      console.error('Erro ao buscar transação:', error);
      return null;
    }
    
    if (!data) {
      console.error('Transação não encontrada:', transactionId);
      return null;
    }
    
    return data.user_id;
  } catch (error) {
    console.error('Erro ao processar busca de usuário:', error);
    return null;
  }
}

// Configuração do servidor Express
const app = express();
app.use(express.json());

// Endpoint do webhook
app.post('/webhooks/inter-pix', async (req, res) => {
  console.log('Webhook recebido do Banco Inter:', req.body);
  
  // Verificar a assinatura do webhook
  if (!verifyInterWebhookSignature(req)) {
    console.error('Assinatura inválida no webhook');
    return res.status(401).json({ error: 'Assinatura inválida' });
  }
  
  try {
    // Extrair dados da notificação
    const { pix } = req.body;
    
    if (!pix || !pix.endToEndId) {
      return res.status(400).json({ error: 'Dados de PIX inválidos' });
    }
    
    const transactionId = pix.endToEndId;
    const status = pix.status;
    
    // Verificar se o status é de pagamento confirmado
    if (status !== 'CONCLUIDO' && status !== 'CONFIRMADO') {
      console.log(`Status de pagamento não confirmado: ${status}`);
      return res.status(200).json({ message: 'Notificação recebida, aguardando confirmação' });
    }
    
    // Encontrar o usuário associado à transação
    const userId = await findUserIdByTransactionId(transactionId);
    
    if (!userId) {
      console.error('Usuário não encontrado para a transação:', transactionId);
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    
    // Registrar o pagamento como confirmado
    const { error: updateError } = await supabase
      .from('payments')
      .update({ status: 'confirmed', updated_at: new Date().toISOString() })
      .eq('transaction_id', transactionId);
    
    if (updateError) {
      console.error('Erro ao atualizar status do pagamento:', updateError);
      return res.status(500).json({ error: 'Erro ao processar pagamento' });
    }
    
    // Aplicar créditos de referência multinível
    const { error: rpcError } = await supabase
      .rpc('apply_referral_credit_multilevel', { 
        p_user_id: userId,
        p_amount: pix.amount || 35.00 // Valor padrão de 35 reais se não especificado
      });
    
    if (rpcError) {
      console.error('Erro ao aplicar créditos de referência:', rpcError);
      // Continuamos mesmo com erro nos créditos, pois o pagamento já foi confirmado
    }
    
    console.log(`Pagamento confirmado para usuário ${userId}, transação ${transactionId}`);
    return res.status(200).json({ success: true });
    
  } catch (error) {
    console.error('Erro ao processar webhook:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Porta do servidor
const PORT = process.env.PORT || 3000;

// Iniciar o servidor
app.listen(PORT, () => {
  console.log(`Servidor webhook rodando na porta ${PORT}`);
});

module.exports = app; // Para uso com serverless ou testes
