
// pages/api/generate-pix.js
import { supabase } from '../../src/lib/supabase';
import axios from 'axios';
import https from 'https';
import fs from 'fs';

// --- Configurações do Banco Inter (devem vir de variáveis de ambiente) ---
const INTER_API_URL = process.env.INTER_API_URL || 'https://cdpj-sandbox.partners.uatinter.co';
const INTER_CLIENT_ID = process.env.INTER_CLIENT_ID;
const INTER_CLIENT_SECRET = process.env.INTER_CLIENT_SECRET;
const INTER_CONTA_CORRENTE = process.env.INTER_CONTA_CORRENTE;

// Caminhos para os certificados (em produção, use o conteúdo das variáveis de ambiente)
const CERT_PATH = process.env.INTER_CERT_PATH; // ex: './certs/cert.pem'
const KEY_PATH = process.env.INTER_KEY_PATH;   // ex: './certs/key.pem'

// Agente HTTPS com os certificados do Inter
const httpsAgent = new https.Agent({
  pfx: fs.readFileSync(CERT_PATH),
  passphrase: ''
});

// Função para obter o token de autenticação do Inter
async function getInterToken() {
  try {
    const response = await axios.post(
      `${INTER_API_URL}/oauth/v2/token`,
      new URLSearchParams({
        client_id: INTER_CLIENT_ID,
        client_secret: INTER_CLIENT_SECRET,
        grant_type: 'client_credentials',
        scope: 'boleto-cobranca.write boleto-cobranca.read'
      }),
      {
        https:Agent,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );
    return response.data.access_token;
  } catch (error) {
    console.error('Erro ao obter token do Inter:', error.response?.data || error.message);
    throw new Error('Falha na autenticação com o Inter');
  }
}

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
      .select('cpf_cnpj') // Assumindo que a coluna se chama 'cpf_cnpj'
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      console.error('Erro ao buscar perfil do usuário:', profileError);
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // 2. Obter o token de autenticação
    const token = await getInterToken();

    // 3. Montar e criar a cobrança PIX no Inter
    const seuNumero = `TX_${userId.substring(0, 8)}_${Date.now()}`;
    const dataVencimento = new Date();
    dataVencimento.setDate(dataVencimento.getDate() + 1); // Vencimento em 1 dia

    const cobrancaBody = {
      seuNumero: seuNumero,
      valorNominal: parseFloat(amount),
      dataVencimento: dataVencimento.toISOString().split('T')[0],
      numDiasBaixa: 0,
      pagador: {
        cpfCnpj: profile.cpf_cnpj,
        tipoPessoa: profile.cpf_cnpj.length === 11 ? 'FISICA' : 'JURIDICA'
      }
    };

    const responseCobranca = await axios.post(
      `${INTER_API_URL}/cobranca/v3/cobrancas`,
      cobrancaBody,
      {
        httpsAgent,
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-conta-corrente': INTER_CONTA_CORRENTE,
          'Content-Type': 'application/json'
        }
      }
    );

    const { codigoSolicitacao, pix } = responseCobranca.data;

    if (!codigoSolicitacao || !pix) {
        return res.status(500).json({ error: 'Resposta inválida da API do Inter' });
    }

    // 4. Salvar a transação no nosso banco de dados
    const { error: insertError } = await supabase
      .from('pix_transactions')
      .insert([
        {
          user_id: userId,
          amount: amount,
          transaction_id: codigoSolicitacao, // Usamos o código da solicitação como ID
          status: 'PENDING',
        },
      ]);

    if (insertError) {
      console.error('Erro ao salvar transação PIX:', insertError);
      // Idealmente, deveria haver um tratamento para cancelar a cobrança no Inter
      return res.status(500).json({ error: 'Falha ao salvar dados da transação' });
    }

    // 5. Retornar os dados do PIX para o frontend
    res.status(200).json({
        transactionId: codigoSolicitacao,
        qrCodeText: pix.qrCode,
        qrCodeImageUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pix.qrCode)}`
    });

  } catch (error) {
    console.error('Erro ao gerar cobrança PIX:', error.response?.data || error.message);
    res.status(500).json({ error: 'Erro interno do servidor ao gerar PIX' });
  }
}
