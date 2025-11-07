
// pages/api/generate-pix.js
import { supabase } '../../src/lib/supabase';
import axios from 'axios';
import https from 'https';
import fs from 'fs';
import path from 'path';

// --- Configurações do Pagar.me ---
const PAGARME_API_KEY = process.env.PAGARME_API_KEY || 'sk_09720c10c13b4e04a420b5d107c29dad';
const PAGARME_ACCOUNT_ID = process.env.PAGARME_ACCOUNT_ID || 'acc_BjkmNYkfVAsz1PMV';

// --- Configurações do Banco Inter (COMENTADO) ---
// const INTER_API_URL = process.env.INTER_API_URL || 'https://cdpj-sandbox.partners.uatinter.co';
// const INTER_CLIENT_ID = process.env.INTER_CLIENT_ID;
// const INTER_CLIENT_SECRET = process.env.INTER_CLIENT_SECRET;
// const INTER_CONTA_CORRENTE = process.env.INTER_CONTA_CORRENTE;

// // Caminhos para os certificados do cliente (devem ser colocados em netlify/functions/certs/)
// const CLIENT_CERT_PATH = path.join(__dirname, 'certs', 'client.crt'); // Assumindo client.crt
// const CLIENT_KEY_PATH = path.join(__dirname, 'certs', 'client.key');   // Assumindo client.key

// let clientCertContent = null;
// let clientKeyContent = null;

// try {
//   clientCertContent = fs.readFileSync(CLIENT_CERT_PATH, 'utf8');
//   clientKeyContent = fs.readFileSync(CLIENT_KEY_PATH, 'utf8');
//   console.log('Certificados do cliente Inter carregados com sucesso.');
// } catch (err) {
//   console.error('ERRO: Não foi possível carregar os certificados do cliente Inter do caminho:', err);
//   // Em produção, você pode querer encerrar o processo ou desabilitar a função
// }

// // Agente HTTPS com os certificados do Inter
// const httpsAgent = new https.Agent({
//   cert: clientCertContent,
//   key: clientKeyContent,
//   passphrase: '' // Se sua chave privada tiver uma senha, coloque-a aqui
// });

// // Função para obter o token de autenticação do Inter
// async function getInterToken() {
//   if (!clientCertContent || !clientKeyContent) {
//     throw new Error('Certificados do cliente Inter não carregados. Autenticação falhou.');
//   }

//   try {
//     const response = await axios.post(
//       `${INTER_API_URL}/oauth/v2/token`,
//       new URLSearchParams({
//         client_id: INTER_CLIENT_ID,
//         client_secret: INTER_CLIENT_SECRET,
//         grant_type: 'client_credentials',
//         scope: 'boleto-cobranca.write boleto-cobranca.read'
//       }),
//       {
//         httpsAgent,
//         headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
//       }
//     );
//     return response.data.access_token;
//   } catch (error) {
//     console.error('Erro ao obter token do Inter:', error.response?.data || error.message);
//     throw new Error('Falha na autenticação com o Inter');
//   }
// }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { amount, userId } = req.body;

  if (!amount || !userId) {
    return res.status(400).json({ error: 'Amount and userId are required' });
  }

  try {
    // 1. Buscar dados do usuário no Supabase (ex: CPF/CNPJ)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('cpf_cnpj, full_name, email') // Assumindo que a coluna se chama 'cpf_cnpj'
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      console.error('Erro ao buscar perfil do usuário:', profileError);
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Lógica do Pagar.me para criar a cobrança PIX
    const pagarmeApi = axios.create({
      baseURL: 'https://api.pagar.me/core/v5',
      headers: {
        'Authorization': `Basic ${Buffer.from(PAGARME_API_KEY + ':').toString('base64')}`,
        'Content-Type': 'application/json'
      }
    });

    const expires_in = 3600; // 1 hora

    const cobrancaBody = {
      customer: {
        name: profile.full_name || 'Nome não informado', // Usar o nome completo do perfil
        email: profile.email, // Usar o email do perfil
        document: profile.cpf_cnpj,
        type: 'individual'
      },
      items: [{
        amount: Math.round(amount * 100), // O valor deve ser em centavos
        description: 'Pagamento Assinatura Anual',
        quantity: 1,
      }],
      payments: [{
        payment_method: 'pix',
        pix: {
          expires_in: expires_in,
          additional_information: [
            { name: 'Referente a', value: 'Assinatura Anual' }
          ]
        }
      }]
    };

    const responseCobranca = await pagarmeApi.post('/orders', cobrancaBody);

    const { id: transactionId, charges } = responseCobranca.data;
    const qrCodeData = charges[0].last_transaction.qr_code;
    const qrCodeImageUrl = charges[0].last_transaction.qr_code_url;

    if (!transactionId || !qrCodeData) {
        return res.status(500).json({ error: 'Resposta inválida da API do Pagar.me' });
    }

    // 4. Salvar a transação no nosso banco de dados
    const { error: insertError } = await supabase
      .from('pix_transactions')
      .insert([
        {
          user_id: userId,
          amount: amount,
          transaction_id: transactionId, // Usamos o ID da ordem do Pagar.me
          status: 'PENDING',
          qr_code: qrCodeData,
          qr_code_url: qrCodeImageUrl,
          expires_at: new Date(new Date().getTime() + expires_in * 1000).toISOString(),
        },
      ]);

    if (insertError) {
      console.error('Erro ao salvar transação PIX:', insertError);
      // Idealmente, deveria haver um tratamento para cancelar a cobrança no Inter
      return res.status(500).json({ error: 'Falha ao salvar dados da transação' });
    }

    // 5. Retornar os dados do PIX para o frontend
    res.status(200).json({
        transactionId: transactionId,
        qrCodeText: qrCodeData,
        qrCodeImageUrl: qrCodeImageUrl
    });

  } catch (error) {
    console.error('Erro ao gerar cobrança PIX:', error.response?.data || error.message);
    res.status(500).json({ error: 'Erro interno do servidor ao gerar PIX' });
  }
}
