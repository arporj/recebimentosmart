const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// Inicialização do Supabase para Netlify Function
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// Variáveis de ambiente (Netlify Functions as acessam diretamente)
const mercadoPagoAccessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
const mercadoPagoBaseUrl = process.env.MERCADO_PAGO_BASE_URL || "https://api.mercadopago.com";
const webhookUrl = process.env.WEBHOOK_URL;
const webhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;

const app = express();
const router = express.Router();

app.use(express.json());
app.use(cors()); // Permite todas as origens por padrão para funções Netlify

// --- Funções Auxiliares (copiadas de server/routes/mercadoPago.js) ---

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
    console.log('Iniciando processamento do pagamento:', payment);
    const { id, status, transaction_amount, external_reference, payment_method_id } = payment;

    const { data: transaction } = await supabase.from("payment_transactions").select("user_id").eq("reference_id", external_reference).single();
    if (!transaction) {
        console.log('Transação não encontrada para external_reference:', external_reference);
        return;
    }
    console.log('Transação encontrada:', transaction);

    const { error: updateTransactionError } = await supabase.from("payment_transactions").update({ status, charge_id: id.toString(), payment_method: payment_method_id }).eq("reference_id", external_reference);
    if (updateTransactionError) {
        console.error('Erro ao atualizar status da transação:', updateTransactionError);
        return;
    }
    console.log('Status da transação atualizado para:', status);

    if (status === 'approved') {
        console.log('Pagamento aprovado. Inserindo registro de pagamento e atualizando validade.');
        const { error: insertPaymentError } = await supabase.from("payments").insert({ 
            user_id: transaction.user_id, 
            amount: transaction_amount, 
            status: "completed", 
            transaction_id: id.toString(), 
            payment_method: payment_method_id, 
            reference_id: external_reference 
        });
        if (insertPaymentError) {
            console.error('Erro ao inserir registro de pagamento:', insertPaymentError);
            return;
        }
        console.log('Registro de pagamento inserido.');

        const newExpiryDate = new Date();
        newExpiryDate.setDate(newExpiryDate.getDate() + 30);

        const { error: updateProfileError } = await supabase
            .from('profiles')
            .update({ valid_until: newExpiryDate.toISOString() })
            .eq('id', transaction.user_id);

        if (updateProfileError) {
            console.error("Erro ao atualizar a data de validade do usuário:", updateProfileError);
        } else {
            console.log(`Data de validade atualizada para o usuário ${transaction.user_id}: ${newExpiryDate.toISOString()}`);
        }
    }
}

async function validateWebhookSignature(req) {
    if (!webhookSecret) return true;
    const signature = req.headers['x-signature'];
    const requestId = req.headers['x-request-id'];
    const dataId = req.query["data.id"] || "";
    if (!signature || !requestId) return false;

    const [ts, v1] = signature.split(",").map(part => part.split("=")[1]);
    const template = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const expectedSignature = crypto.createHmac("sha256", webhookSecret).update(template).digest("hex");
    return expectedSignature === v1;
}

// --- Rotas (copiadas de server/routes/mercadoPago.js) ---

router.post('/create-preference', async (req, res) => {
    const { title, unit_price, quantity, userId } = req.body;

    if (!title || !unit_price || !quantity || !userId) {
        return res.status(400).json({ success: false, message: "Dados obrigatórios: title, unit_price, quantity, userId" });
    }

    try {
        const preferencePayload = {
            items: [
                {
                    title,
                    unit_price,
                    quantity,
                },
            ],
            payer: {
                // Adicionar dados do pagador se necessário
            },
            back_urls: {
                success: `${process.env.VITE_APP_URL}/payment-success`,
                failure: `${process.env.VITE_APP_URL}/payment-failure`,
                pending: `${process.env.VITE_APP_URL}/payment-pending`,
            },
            auto_return: 'approved',
            external_reference: uuidv4(),
        };

        if (webhookUrl) {
            preferencePayload.notification_url = webhookUrl;
        }

        const response = await axios.post(`${mercadoPagoBaseUrl}/checkout/preferences`, preferencePayload, {
            headers: {
                Authorization: `Bearer ${mercadoPagoAccessToken}`,
                'Content-Type': 'application/json',
            },
        });

        const { id: preferenceId } = response.data;

        await saveTransactionAssociation(preferencePayload.external_reference, userId, unit_price * quantity, title);

        res.status(201).json({ success: true, preferenceId });

    } catch (error) {
        console.error("Erro ao criar preferência no Mercado Pago:", error.response?.data || error.message);
        res.status(500).json({ success: false, message: "Falha ao criar preferência", error: error.response?.data || error.message });
    }
});

router.post('/generate-payment-mp', async (req, res) => {
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

router.post('/webhook', async (req, res) => {
    console.log('--- INÍCIO DO WEBHOOK (Netlify Function) ---');
    console.log('Webhook recebido (body):', req.body);
    console.log('Headers do Webhook:', req.headers);
    try {
        const isValid = await validateWebhookSignature(req);
        if (!isValid) {
            console.warn('Webhook: Assinatura inválida ou secreta não configurada.');
            return res.status(403).json({ success: false, message: "Assinatura inválida ou secreta não configurada" });
        }

        const notification = req.body;
        console.log('Webhook: Tipo de notificação recebida:', notification.type);

        if (notification.type !== "payment") {
            console.log('Webhook: Notificação não é de pagamento, ignorando.');
            return res.status(200).json({ success: true, message: "Notificação não é de pagamento" });
        }

        const paymentId = notification.data?.id;
        if (!paymentId) {
            console.warn('Webhook: ID do pagamento não encontrado na notificação.');
            return res.status(200).json({ success: true, message: "ID do pagamento não encontrado" });
        }

        console.log(`Webhook: Processando pagamento com ID: ${paymentId}`);
        const paymentDetails = await getPaymentDetails(paymentId);

        if (paymentDetails) {
            console.log('Webhook: Detalhes do pagamento obtidos, iniciando processamento...');
            await processPayment(paymentDetails);
        } else {
            console.warn(`Webhook: Não foi possível obter detalhes para o pagamento ID: ${paymentId}`);
        }

        res.status(200).json({ success: true, message: "Webhook processado com sucesso" });

    } catch (error) {
        console.error("Webhook Mercado Pago: Erro ao processar notificação:", error.message, error.stack);
        res.status(200).json({ success: false, message: "Erro interno ao processar webhook" });
    }
});

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
        const { data: settings, error: settingsError } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'subscription_price')
            .single();

        if (settingsError) console.error("Erro ao buscar subscription_price:", settingsError.message);
        if (settings && settings.value) {
            baseFee = parseFloat(settings.value);
        }

        const { data: referralCredit, error: referralError } = await supabase
            .from('referral_credits')
            .select('status')
            .eq('referred_user_id', userId)
            .single();

        if (referralCredit && referralCredit.status === 'pending') {
            initialDiscount = baseFee * 0.20;
        }

        const { count: paidReferrals, error: creditsError } = await supabase
            .from('referral_credits')
            .select('*', { count: 'exact', head: true })
            .eq('referrer_user_id', userId)
            .in('status', ['credited', 'used']);
        
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
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('referral_code')
            .eq('id', userId)
            .single();

        if (profileError) throw profileError;

        const referralLink = `https://www.recebimentosmart.com.br/cadastro?ref=${profile.referral_code}`;

        const { count: totalRegistered, error: totalError } = await supabase
            .from('referrals')
            .select('*', { count: 'exact', head: true })
            .eq('referrer_id', userId);

        if (totalError) throw totalError;

        const { count: totalPaid, error: paidError } = await supabase
            .from('referral_credits')
            .select('*', { count: 'exact', head: true })
            .eq('referrer_user_id', userId)
            .in('status', ['credited', 'used']);
        
        if (paidError) throw paidError;

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


app.use('/', router); // Monta as rotas na raiz do aplicativo Express

module.exports.handler = serverless(app);