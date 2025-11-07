// pages/api/webhook/pagarme.js
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Função para verificar a assinatura do webhook do Pagar.me
function verifyPagarmeWebhookSignature(req) {
  const signature = req.headers['x-hub-signature'];
  if (!signature) {
    return false;
  }

  const [algorithm, signed] = signature.split('=');
  const expectedSignature = crypto
    .createHmac(algorithm, process.env.PAGARME_API_KEY)
    .update(req.rawBody, 'utf8')
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(signed), Buffer.from(expectedSignature));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // É importante ter o rawBody para a verificação da assinatura
  // A configuração para isso pode variar dependendo do framework (Next.js, etc.)
  // Em Next.js, você precisa desabilitar o bodyParser para esta rota específica.
  req.rawBody = JSON.stringify(req.body);

  if (!verifyPagarmeWebhookSignature(req)) {
    return res.status(401).json({ error: 'Assinatura inválida' });
  }

  const { id: orderId, charges } = req.body;
  const status = charges[0].last_transaction.status;

  if (status === 'paid') {
    const { error: updateError } = await supabase
      .from('pix_transactions')
      .update({ status: 'PAID' })
      .eq('transaction_id', orderId);

    if (updateError) {
      console.error('Erro ao atualizar status do pagamento:', updateError);
      return res.status(500).json({ error: 'Erro ao processar pagamento' });
    }

    // Adicione aqui qualquer outra lógica que você precise executar após o pagamento ser confirmado
    // como liberar o acesso do usuário, etc.

  }

  res.status(200).json({ received: true });
}

// Em Next.js, para ter acesso ao rawBody, você precisa exportar essa configuração
export const config = {
  api: {
    bodyParser: false,
  },
};