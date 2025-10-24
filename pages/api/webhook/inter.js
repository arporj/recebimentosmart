
// pages/api/webhook/inter.js
import { supabase } from '../../../src/lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // TODO: Adicionar verificação de autenticidade do webhook do Banco Inter

  const { transactionId, amount } = req.body;

  if (!transactionId || !amount) {
    return res.status(400).json({ error: 'transactionId and amount are required' });
  }

  try {
    // Atualiza o status da transação no banco de dados
    const { data, error } = await supabase
      .from('pix_transactions')
      .update({ status: 'COMPLETED' })
      .eq('transaction_id', transactionId)
      .eq('amount', amount);

    if (error) {
      throw error;
    }

    if (data && data.length > 0) {
        const userId = data[0].user_id;
        // TODO: Adicionar lógica para dar baixa na fatura e liberar o acesso do usuário
        console.log(`Pagamento confirmado para o usuário ${userId}`);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
