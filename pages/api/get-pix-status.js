
// pages/api/get-pix-status.js
import { supabase } from '../../src/lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { transactionId } = req.query;

  if (!transactionId) {
    return res.status(400).json({ error: 'transactionId is required' });
  }

  try {
    const { data, error } = await supabase
      .from('pix_transactions')
      .select('status')
      .eq('transaction_id', transactionId)
      .single();

    if (error || !data) {
      console.error('Error fetching transaction status:', error);
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.status(200).json({ status: data.status });
  } catch (error) {
    console.error('Internal server error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
