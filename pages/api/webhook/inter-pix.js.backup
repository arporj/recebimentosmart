// Endpoint para receber Webhooks de confirmação de pagamento PIX do Banco Inter
// Arquivo: pages/api/webhooks/inter-pix.js (Exemplo Atualizado com Variáveis de Conteúdo)

import { createClient } from "@supabase/supabase-js";
import https from "https"; // Para validação de certificado
// import crypto from "crypto"; // Pode ser necessário para validação de assinatura

// IMPORTANTE: Use variáveis de ambiente
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Conteúdo dos certificados/chave lidos das variáveis de ambiente
const interCACertContent = process.env.INTER_CA_CERTIFICATE_CONTENT; // Conteúdo do ca.crt
const interCertificateContent = process.env.INTER_CERTIFICATE_CONTENT; // Conteúdo do seu certificado .crt
const interPrivateKeyContent = process.env.INTER_PRIVATE_KEY_CONTENT; // Conteúdo da sua chave .key

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error("Erro Crítico: Variáveis de ambiente Supabase não configuradas.");
}
if (!interCACertContent) {
  console.warn("Aviso: Conteúdo do certificado CA do Inter (INTER_CA_CERTIFICATE_CONTENT) não configurado. A validação do webhook pode falhar.");
}
// Os certificados do cliente (.crt, .key) podem não ser necessários para *receber* o webhook,
// mas são necessários para *fazer* chamadas para o Inter (como no generate-pix).
// A validação do webhook geralmente usa o CA do Inter ou chaves públicas deles.

// Crie um cliente Supabase com a chave de serviço
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    console.log("Webhook Inter: Método não permitido recebido:", req.method);
    return res.status(405).json({ success: false, message: "Método não permitido" });
  }

  console.log("Webhook Inter: Notificação recebida.");

  // 2. **VALIDAÇÃO DE SEGURANÇA (MUITO IMPORTANTE!)**
  // Esta parte PRECISA ser implementada conforme a documentação do Banco Inter!
  const isVerified = await verifyInterWebhookSignature(req, interCACertContent);
  if (!isVerified) {
     console.error("Webhook Inter: Falha na validação de segurança da notificação.");
     return res.status(403).json({ success: false, message: "Falha na validação de segurança" });
  }
  console.log("Webhook Inter: Validação de segurança OK.");

  // 3. Processar o Payload da Notificação
  try {
    const notificationPayload = req.body;
    const pixNotifications = notificationPayload.pix || [];

    if (!Array.isArray(pixNotifications) || pixNotifications.length === 0) {
        console.log("Webhook Inter: Payload não contém notificações PIX válidas.", notificationPayload);
        return res.status(200).json({ success: true, message: "Payload vazio ou inválido, mas recebido." });
    }

    for (const pixInfo of pixNotifications) {
        const transactionId = pixInfo.endToEndId;
        const amountPaid = parseFloat(pixInfo.valor);
        const status = pixInfo.status || "COMPLETO";
        const userId = await findUserIdByTransactionId(transactionId);

        if (!userId) {
            console.error(`Webhook Inter: Não foi possível encontrar usuário para transactionId: ${transactionId}`);
            continue;
        }

        console.log(`Webhook Inter: Processando pagamento para User ${userId}, TxID ${transactionId}, Valor ${amountPaid}`);

        if (status === "CONCLUIDA" || status === "CONFIRMADA" || status === "COMPLETO") {
            const { error: paymentError } = await supabaseAdmin
                .from("payments")
                .insert({
                    user_id: userId,
                    amount: amountPaid,
                    status: "completed",
                    transaction_id: transactionId,
                    payment_date: new Date().toISOString(),
                })
                .select()
                .maybeSingle();

            if (paymentError && paymentError.code !== "23505") {
                console.error(`Webhook Inter: Erro ao registrar pagamento para TxID ${transactionId}:`, paymentError);
            }

            const { error: creditError } = await supabaseAdmin.rpc(
                "apply_referral_credit_multilevel",
                { p_referred_user_id: userId }
            );

            if (creditError) {
                console.error(`Webhook Inter: Erro ao aplicar créditos para User ${userId} (TxID ${transactionId}):`, creditError);
            }
             console.log(`Webhook Inter: Pagamento e créditos processados para User ${userId}, TxID ${transactionId}`);
        } else {
             console.log(`Webhook Inter: Status ${status} não indica pagamento concluído para TxID ${transactionId}. Ignorando.`);
        }
    }

    return res.status(200).json({ success: true, message: "Webhook recebido e processado." });

  } catch (error) {
    console.error("Webhook Inter: Erro ao processar payload:", error);
    return res.status(200).json({ success: false, message: "Erro interno ao processar webhook." });
  }
}

// --- Funções Auxiliares --- //

// **FUNÇÃO DE VALIDAÇÃO DE EXEMPLO - SUBSTITUIR PELA LÓGICA REAL DO INTER**
async function verifyInterWebhookSignature(req, caCertContent) {
  // Implementar a lógica de validação conforme documentação do Banco Inter.
  // Pode envolver:
  // 1. Verificar assinatura em header (ex: x-inter-signature) usando chave pública do Inter.
  // 2. Se for mTLS, a validação pode ocorrer no nível do servidor web/proxy reverso.
  // 3. Usar o caCertContent (INTER_CA_CERTIFICATE_CONTENT) para validar a cadeia de certificados
  //    se a validação for baseada em certificado do cliente (Inter enviando certificado).
  console.warn("VALIDAÇÃO DE WEBHOOK NÃO IMPLEMENTADA - APENAS RETORNANDO TRUE PARA TESTES");
  // Exemplo hipotético de uso do CA (requer biblioteca específica, ex: forge ou crypto nativo):
  /*
  try {
    const clientCertPem = req.headers["x-client-cert"]; // Supondo que o Inter envie o certificado no header
    if (!clientCertPem) return false;
    const caStore = crypto.createCaStore();
    caStore.addCertificate(caCertContent);
    const clientCert = crypto.pki.certificateFromPem(clientCertPem);
    const verified = caStore.verify(clientCert);
    return verified;
  } catch (e) {
    console.error("Erro na validação do certificado do webhook:", e);
    return false;
  }
  */
  return true; // **RETORNO FIXO PARA TESTES - MUDE ISSO!**
}

// **FUNÇÃO PARA BUSCAR USER ID - IMPLEMENTAR CONFORME SUA LÓGICA**
async function findUserIdByTransactionId(transactionId) {
  console.warn(`BUSCA DE USER ID POR TXID (${transactionId}) NÃO IMPLEMENTADA`);
  // Exemplo: Buscar em uma tabela hipotética `pix_transactions`
  /*
  const { data, error } = await supabaseAdmin
    .from("pix_transactions")
    .select("user_id")
    .eq("transaction_id", transactionId)
    .maybeSingle();
  if (error) {
    console.error("Erro ao buscar user_id por txid:", error);
    return null;
  }
  return data?.user_id;
  */
  return null; // Retorno placeholder
}

