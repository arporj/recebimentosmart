const express = require('express');
const router = express.Router();
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { supabase } = require('../lib/supabase');

// Variáveis de ambiente
const mercadoPagoAccessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
const mercadoPagoBaseUrl = process.env.MERCADO_PAGO_BASE_URL || "https://api.mercadopago.com";
const webhookUrl = process.env.WEBHOOK_URL;
const webhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;

// Rota para gerar um novo pagamento
router.post('/generate-payment', async (req, res) => {
    const { 
        amount, 
        description, 
        userId, 
        paymentMethod = "pix",
        customerData,
        cardData,
        installments = 1
    } = req.body;

    if (!amount || !description || !userId) {
        return res.status(400).json({ success: false, message: "Dados obrigatórios: amount, description, userId" });
    }

    try {
        const externalReference = uuidv4();
        await saveTransactionAssociation(externalReference, userId, amount, description);

        const payer = {
            email: customerData?.email || "cliente@exemplo.com",
            identification: { type: "CPF", number: customerData?.cpf || "12345678909" },
            first_name: customerData?.firstName || "Cliente",
            last_name: customerData?.lastName || "Exemplo"
        };

        let paymentPayload;

        switch (paymentMethod) {
            case "pix":
                paymentPayload = createPixPaymentPayload(amount, description, payer, externalReference);
                break;
            case "credit_card":
                paymentPayload = createCreditCardPaymentPayload(amount, description, payer, cardData, installments, externalReference);
                break;
            case "ticket":
                paymentPayload = createTicketPaymentPayload(amount, description, payer, externalReference);
                break;
            default:
                return res.status(400).json({ success: false, message: "Método de pagamento não suportado" });
        }

        if (webhookUrl) {
            paymentPayload.notification_url = webhookUrl;
        }

        const response = await axios.post(`${mercadoPagoBaseUrl}/v1/payments`, paymentPayload, {
            headers: {
                Authorization: `Bearer ${mercadoPagoAccessToken}`,
                "Content-Type": "application/json",
                "X-Idempotency-Key": externalReference
            }
        });

        const payment = response.data;
        const responseData = {
            success: true,
            paymentId: payment.id,
            status: payment.status,
            paymentMethod: paymentMethod,
        };

        if (paymentMethod === "pix") {
            responseData.pixQrCode = payment.point_of_interaction?.transaction_data?.qr_code;
            responseData.pixQrCodeBase64 = payment.point_of_interaction?.transaction_data?.qr_code_base64;
        } else if (paymentMethod === "ticket") {
            responseData.ticketUrl = payment.transaction_details?.external_resource_url;
        }

        res.status(200).json(responseData);

    } catch (error) {
        console.error("Erro ao gerar pagamento no Mercado Pago:", error.response?.data || error.message);
        res.status(500).json({ success: false, message: "Falha ao gerar pagamento", error: error.response?.data || error.message });
    }
});

// Rota para o webhook
router.post('/webhook', async (req, res) => {
    try {
        const isValid = await validateWebhookSignature(req);
        if (!isValid) {
            return res.status(403).json({ success: false, message: "Assinatura inválida" });
        }

        const notification = req.body;
        if (notification.type !== "payment") {
            return res.status(200).json({ success: true, message: "Notificação não é de pagamento" });
        }

        const paymentId = notification.data?.id;
        if (!paymentId) {
            return res.status(200).json({ success: true, message: "ID do pagamento não encontrado" });
        }

        const paymentDetails = await getPaymentDetails(paymentId);
        if (paymentDetails) {
            await processPayment(paymentDetails);
        }

        res.status(200).json({ success: true, message: "Webhook processado com sucesso" });

    } catch (error) {
        console.error("Webhook Mercado Pago: Erro ao processar notificação:", error);
        res.status(200).json({ success: false, message: "Erro interno ao processar webhook" });
    }
});

// --- Funções Auxiliares ---

async function saveTransactionAssociation(externalReference, userId, amount, description) {
    const { error } = await supabase
      .from("payment_transactions")
      .insert({ reference_id: externalReference, user_id: userId, amount, description, status: "PENDING" });
    if (error) console.error("Erro ao salvar associação da transação:", error);
}

function createPixPaymentPayload(amount, description, payer, externalReference) {
    return { transaction_amount: amount, description, payment_method_id: "pix", payer, external_reference: externalReference };
}

function createCreditCardPaymentPayload(amount, description, payer, cardData, installments, externalReference) {
    return { transaction_amount: amount, description, payment_method_id: cardData.payment_method_id || "visa", token: cardData.token, installments, payer, external_reference: externalReference };
}

function createTicketPaymentPayload(amount, description, payer, externalReference) {
    return { transaction_amount: amount, description, payment_method_id: "bolbradesco", payer, external_reference: externalReference };
}

async function getPaymentDetails(paymentId) {
    try {
        const response = await axios.get(`${mercadoPagoBaseUrl}/v1/payments/${paymentId}`, { headers: { Authorization: `Bearer ${mercadoPagoAccessToken}` } });
        return response.data;
    } catch (error) {
        console.error(`Erro ao buscar detalhes do pagamento ${paymentId}:`, error.response?.data || error.message);
        return null;
    }
}

async function processPayment(payment) {
    const { id, status, transaction_amount, external_reference, payment_method_id } = payment;

    const { data: transaction } = await supabase.from("payment_transactions").select("user_id").eq("reference_id", external_reference).single();
    if (!transaction) return;

    await supabase.from("payment_transactions").update({ status, charge_id: id.toString(), payment_method: payment_method_id }).eq("reference_id", external_reference);

    if (status === 'approved') {
        await supabase.from("payments").insert({ user_id: transaction.user_id, amount: transaction_amount, status: "completed", transaction_id: id.toString(), payment_method: payment_method_id, reference_id: external_reference });
        // Chamar RPC de crédito de referência se necessário
    }
}

async function validateWebhookSignature(req) {
    if (!webhookSecret) return true; // Pular se não houver secret
    const signature = req.headers['x-signature'];
    const requestId = req.headers['x-request-id'];
    const dataId = req.query["data.id"] || "";
    if (!signature || !requestId) return false;

    const [ts, v1] = signature.split(",").map(part => part.split("=")[1]);
    const template = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const expectedSignature = crypto.createHmac("sha256", webhookSecret).update(template).digest("hex");
    return expectedSignature === v1;
}

module.exports = router;