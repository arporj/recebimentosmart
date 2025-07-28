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

// Rota para buscar o nome de quem indicou através do código
router.get('/referrer-info/:referralCode', async (req, res) => {
    const { referralCode } = req.params;
    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('name')
            .eq('referral_code', referralCode)
            .single();

        if (error || !profile) {
            return res.status(404).json({ success: false, message: "Código de indicação não encontrado." });
        }

        res.status(200).json({ success: true, name: profile.name });

    } catch (error) {
        console.error("Erro ao buscar informações do indicador:", error.message);
        res.status(500).json({ success: false, message: "Falha ao buscar informações do indicador." });
    }
});

// Rota para obter detalhes do pagamento
router.get('/payment-details/:userId', async (req, res) => {
    const { userId } = req.params;
    let baseFee = 35; // Valor padrão caso não encontre no DB
    let initialDiscount = 0;

    try {
        // Buscar o preço da assinatura do banco de dados
        const { data: settings, error: settingsError } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'subscription_price')
            .single();

        if (settingsError) console.error("Erro ao buscar subscription_price:", settingsError.message);
        if (settings && settings.value) {
            baseFee = parseFloat(settings.value);
        }

        // Verificar se este usuário foi indicado e se é o primeiro pagamento dele
        // Verificar se este usuário foi indicado e se é o primeiro pagamento dele
        const { data: referralCredit, error: referralError } = await supabase
            .from('referral_credits')
            .select('status')
            .eq('referred_user_id', userId)
            .single();

        // Se o usuário foi indicado e o crédito ainda está pendente, aplica o desconto inicial
        if (referralCredit && referralCredit.status === 'pending') {
            initialDiscount = baseFee * 0.20; // 20% de desconto
        }

        // Contar quantos créditos por indicação o usuário tem para usar
        const { count: paidReferrals, error: creditsError } = await supabase
            .from('referral_credits')
            .select('id', { count: 'exact' })
            .eq('referrer_user_id', userId)
            .eq('status', 'credited');

        if (creditsError) throw creditsError;

        const referralCreditsValue = (paidReferrals || 0) * (baseFee * 0.20);
        const totalDiscount = initialDiscount + referralCreditsValue;
        const amountToPay = Math.max(0, baseFee - totalDiscount);

        res.status(200).json({
            success: true,
            baseFee,
            totalCredits: totalDiscount,
            amountToPay,
            creditsUsed: paidReferrals || 0,
            initialDiscount: initialDiscount > 0
        });

    } catch (error) {
        console.error("Erro ao buscar detalhes de pagamento:", error.message);
        res.status(500).json({ success: false, message: "Falha ao buscar detalhes de pagamento", error: error.message });
    }
});

// Rota para obter estatísticas de indicação
router.get('/referral-stats/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        // 1. Obter o código de indicação do usuário
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('referral_code')
            .eq('id', userId)
            .single();

        if (profileError) throw profileError;

        const referralLink = `https://www.recebimentosmart.com.br/cadastro?ref=${profile.referral_code}`;

        // 2. Contar total de usuários cadastrados com o código
        const { count: totalRegistered, error: totalError } = await supabase
            .from('referrals') // Alterado para a tabela 'referrals'
            .select('*', { count: 'exact', head: true })
            .eq('referrer_id', userId); // Alterado para 'referrer_id'

        if (totalError) throw totalError;

        // 3. Contar total de usuários que pagaram (status 'credited' ou 'used')
        const { count: totalPaid, error: paidError } = await supabase
            .from('referral_credits')
            .select('*', { count: 'exact', head: true })
            .eq('referrer_user_id', userId)
            .in('status', ['credited', 'used']);
        
        if (paidError) throw paidError;

        // 4. Contar créditos disponíveis (status 'credited')
        const { count: availableCredits, error: creditsError } = await supabase
            .from('referral_credits')
            .select('*', { count: 'exact', head: true })
            .eq('referrer_user_id', userId)
            .eq('status', 'credited');

        if (creditsError) throw creditsError;

        res.status(200).json({
            success: true,
            referralLink,
            totalRegistered: totalRegistered || 0,
            totalPaid: totalPaid || 0,
            availableCredits: availableCredits || 0,
        });

    } catch (error) {
        console.error("Erro ao buscar estatísticas de indicação:", error.message);
        res.status(500).json({ success: false, message: "Falha ao buscar estatísticas de indicação", error: error.message });
    }
});


// Rota para gerar um novo pagamento
router.post('/generate-payment', async (req, res) => {
    const { 
        amount, 
        description, 
        userId, 
        customerData
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

        const paymentPayload = createPixPaymentPayload(amount, description, payer, externalReference);

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
            paymentMethod: 'pix',
            pixQrCode: payment.point_of_interaction?.transaction_data?.qr_code,
            pixQrCodeBase64: payment.point_of_interaction?.transaction_data?.qr_code_base64
        };

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
        // Insere o registro de pagamento
        await supabase.from("payments").insert({ 
            user_id: transaction.user_id, 
            amount: transaction_amount, 
            status: "completed", 
            transaction_id: id.toString(), 
            payment_method: payment_method_id, 
            reference_id: external_reference 
        });

        // Calcula a nova data de validade (30 dias a partir de hoje)
        const newExpiryDate = new Date();
        newExpiryDate.setDate(newExpiryDate.getDate() + 30);

        // Atualiza o perfil do usuário com a nova data de validade
        const { error: updateError } = await supabase
            .from('profiles')
            .update({ valid_until: newExpiryDate.toISOString() })
            .eq('id', transaction.user_id);

        if (updateError) {
            console.error("Erro ao atualizar a data de validade do usuário:", updateError);
        } else {
            console.log(`Data de validade atualizada para o usuário ${transaction.user_id}: ${newExpiryDate.toISOString()}`);
        }

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
