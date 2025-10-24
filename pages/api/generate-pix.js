
// pages/api/generate-pix.js
import { supabase } from '../../src/lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { amount, userId } = req.body;

  if (!amount || !userId) {
    return res.status(400).json({ error: 'Amount and userId are required' });
  }

  try {
    // TODO: Lógica para gerar a cobrança PIX com o Banco Inter
    // Por enquanto, vamos simular a criação de uma cobrança
    const pixData = {
      qrCodeText: `pix.example.com/pagamento/${userId}/${amount}`,
      qrCodeImageUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=pix.example.com/pagamento/${userId}/${amount}`,
      transactionId: `TXID_${Date.now()}`,
    };

    // Salva os detalhes da transação no banco de dados para verificação posterior
    const { error } = await supabase
      .from('pix_transactions')
      .insert([
        {
          user_id: userId,
          amount: amount,
          transaction_id: pixData.transactionId,
          status: 'PENDING',
        },
      ]);

    if (error) {
      throw error;
    }

    res.status(200).json(pixData);
  } catch (error) {
    console.error('Error generating PIX:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
