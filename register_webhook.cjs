require('dotenv').config();
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');

const interEnv = process.env.INTER_ENV || 'sandbox';
const certName = interEnv === 'sandbox' ? 'Sandbox_InterAPI_Certificado.crt' : 'Inter API_Certificado.crt';
const keyName = interEnv === 'sandbox' ? 'Sandbox_InterAPI_Chave.key' : 'Inter API_Chave.key';
const certPath = path.join(__dirname, 'certs', certName);
const keyPath = path.join(__dirname, 'certs', keyName);

async function getInterOAuthToken(httpsAgent) {
  const baseUrl = interEnv === 'sandbox' 
    ? 'https://cdpj-sandbox.partners.uatinter.co' 
    : 'https://cdpj.partners.bancointer.com.br';
  
  const tokenUrl = `${baseUrl}/oauth/v2/token`;
  const clientId = process.env.INTER_CLIENT_ID;
  const clientSecret = process.env.INTER_CLIENT_SECRET;

  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('scope', 'cob.write cob.read pix.read webhook.write webhook.read');

  if (clientId && clientSecret) {
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
  }

  const response = await axios.post(tokenUrl, params.toString(), {
    httpsAgent,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });

  return response.data.access_token;
}

async function register() {
  const webhookUrl = process.argv[2];
  if (!webhookUrl) {
    console.error('ERRO: Você deve passar a URL final do seu webhook como argumento.');
    console.log('Exemplo: node register_webhook.cjs https://seu-site-producao.com/webhooks/inter');
    process.exit(1);
  }

  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    console.error(`ERRO: Certificados mTLS do Banco Inter não encontrados em: ${certPath} ou ${keyPath}`);
    process.exit(1);
  }

  const httpsAgent = new https.Agent({
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
    rejectUnauthorized: false
  });

  try {
    const token = await getInterOAuthToken(httpsAgent);
    
    const baseUrl = interEnv === 'sandbox' 
      ? 'https://cdpj-sandbox.partners.uatinter.co' 
      : 'https://cdpj.partners.bancointer.com.br';
    
    const rawChave = process.env.INTER_CHAVE_PIX || '';
    const cleanChave = rawChave.replace(/[^a-zA-Z0-9]/g, '');

    const putUrl = `${baseUrl}/pix/v2/webhook/${cleanChave}`;
    const payload = { webhookUrl };

    console.log(`[Webhook] Enviando registro de webhook no Banco Inter (${interEnv})...`);
    console.log(`[Webhook] URL de Destino: ${webhookUrl}`);
    console.log(`[Webhook] Chave Pix: ${cleanChave}`);

    const response = await axios.put(putUrl, payload, {
      httpsAgent,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('[Webhook] Sucesso absoluto! Retorno do Banco Inter:', response.status, response.statusText);
    console.log('O Webhook do Banco Inter está cadastrado e ativo!');

  } catch (error) {
    console.error('[Webhook] Falha ao cadastrar o webhook no Banco Inter:', error.response?.data || error.message);
  }
}

register();
