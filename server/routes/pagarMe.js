const express = require('express');
const router = express.Router();
const pagarme = require('pagarme');

const PAGARME_API_KEY = process.env.PAGARME_API_KEY;

router.post('/create-payment', async (req, res) => {
  const { amount, card_token } = req.body;
  console.log('Received payment request with amount:', amount);

  try {
    const client = await pagarme.client.connect({ api_key: PAGARME_API_KEY });
    console.log('Pagar.me client connected.');

    const transaction = await client.transactions.create({
      amount: amount,
      card_token: card_token,
      payment_method: 'credit_card',
    });

    console.log('Pagar.me transaction created successfully:', transaction);
    res.json(transaction);
  } catch (error) {
    console.error('Error creating Pagar.me transaction:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Failed to create payment' });
  }
});

module.exports = router;