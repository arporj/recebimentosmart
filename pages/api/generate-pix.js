// API para gerar cobrança PIX no Banco Inter
// Arquivo: pages/api/generate-pix.js (Exemplo Atualizado com Variáveis de Conteúdo)

import axios from "axios";
import https from "https";
import { v4 as uuidv4 } from "uuid";
import { createClient } from "@supabase/supabase-js";

// IMPORTANTE: Use variáveis de ambiente
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const interClientId = process.env.INTER_CLIENT_ID;
const interClientSecret = process.env.INTER_CLIENT_SECRET;
const defaultPixKey = process.env.DEFAULT_PIX_KEY;

// Conteúdo dos certificados/chave lidos das variáveis de ambiente
const interCertificateContent = process.env.INTER_CERTIFICATE_CONTENT;
const interPrivateKeyContent = process.env.INTER_PRIVATE_KEY_CONTENT;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error("Erro Crítico: Variáveis de ambiente Supabase não configuradas.");
}
if (!interClientId || !interClientSecret || !defaultPixKey) {
  console.error("Erro Crítico: Credenciais do Banco Inter ou Chave PIX padrão não configuradas no .env.");
}
if (!interCertificateContent || !interPrivateKeyContent) {
  console.error("Erro Crítico: Conteúdo do certificado ou chave privada do Inter não configurado nas variáveis de ambiente (INTER_CERTIFICATE_CONTENT, INTER_PRIVATE_KEY_CONTENT).");
}

// Crie um cliente Supabase com a chave de serviço
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

// --- Configuração do Agente HTTPS com Certificados --- //
let httpsAgent;
try {
  httpsAgent = new https.Agent({
    cert: interCertificateContent, // Conteúdo do certificado
    key: interPrivateKeyContent, // Conteúdo da chave privada
    // passphrase: process.env.INTER_CERTIFICATE_PASSPHRASE, // Descomente se sua chave tiver senha
    rejectUnauthorized: true, // Importante para segurança em produção
  });
} catch (error) {
  console.error("Erro ao criar agente HTTPS com certificados:", error);
  // Tratar erro - talvez retornar um erro 500 imediatamente?
}

// --- Função para obter Token de Acesso do Inter --- //
async function getInterAccessToken() {
  try {
    const response = await axios.post(
      "https://cdpj.partners.bancointer.com.br/oauth/v2/token",
      new URLSearchParams({
        client_id: interClientId,
        client_secret: interClientSecret,
        grant_type: "client_credentials",
        scope: "cob.read cob.write", // Escopos necessários para cobrança PIX
      }),
      {
        httpsAgent: httpsAgent, // Usa o agente com certificados
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    return response.data.access_token;
  } catch (error) {
    console.error(
      "Erro ao obter token de acesso do Inter:",
      error.response?.data || error.message
    );
    throw new Error("Falha ao autenticar com o Banco Inter.");
  }
}

// --- Handler da API --- //
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Método não permitido" });
  }

  if (!httpsAgent) {
    return res.status(500).json({ success: false, message: "Erro interno na configuração de segurança." });
  }

  const { amount, description, userId } = req.body;

  if (!amount || !description || !userId) {
    return res.status(400).json({ success: false, message: "Dados incompletos." });
  }

  try {
    const accessToken = await getInterAccessToken();
    const txid = uuidv4().replace(/-/g, ""); // Gera um TXID único sem hífens

    const cobPayload = {
      calendario: {
        expiracao: 3600, // Tempo de expiração em segundos (ex: 1 hora)
      },
      valor: {
        original: amount.toFixed(2),
      },
      chave: defaultPixKey, // Sua chave PIX recebedora
      solicitacaoPagador: description,
      // infoAdicionais: [ { nome: "Campo 1", valor: "Informação 1" } ] // Opcional
    };

    const cobResponse = await axios.put(
      `https://cdpj.partners.bancointer.com.br/pix/v2/cob/${txid}`,
      cobPayload,
      {
        httpsAgent: httpsAgent,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    // TODO: Salvar a associação txid <-> userId em algum lugar
    // para poder identificar o usuário no webhook ou na consulta de status.
    // Ex: await saveTransactionAssociation(txid, userId);

    // Gerar QR Code (requer outra chamada à API do Inter)
    const qrCodeResponse = await axios.get(
      `https://cdpj.partners.bancointer.com.br/pix/v2/cob/${txid}/qrcode`,
      {
        httpsAgent: httpsAgent,
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    res.status(200).json({
      success: true,
      txid: cobResponse.data.txid,
      pixCopyPaste: qrCodeResponse.data.qrcode, // Payload para o QR Code
      qrCodeImageBase64: qrCodeResponse.data.imagemQrcode, // Imagem base64
      status: cobResponse.data.status,
    });

  } catch (error) {
    console.error(
      "Erro ao gerar cobrança PIX no Inter:",
      error.response?.data || error.message
    );
    res.status(500).json({ success: false, message: "Falha ao gerar cobrança PIX." });
  }
}

// Função placeholder - Implementar conforme necessário
// async function saveTransactionAssociation(txid, userId) {
//   console.log(`Associando TXID ${txid} ao User ${userId}`);
//   // Lógica para salvar no Supabase ou outro banco
// }

