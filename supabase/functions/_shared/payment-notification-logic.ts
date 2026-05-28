import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export async function processUserDuePayments(
    userId: string,
    supabaseUrl: string,
    supabaseServiceRoleKey: string,
    brevoApiKey: string,
    targetEmail?: string
) {
    if (!userId) throw new Error('userId is required')

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

    // 1. Get User Details
    const { data: user, error: userError } = await supabase.auth.admin.getUserById(userId)
    if (userError || !user.user) {
        console.error(`User not found: ${userId}`, userError)
        return { success: false, error: 'User not found' }
    }

    const recipientEmail = targetEmail || user.user.email
    const userName = user.user.user_metadata?.name || 'Usuário'

    if (!recipientEmail) {
        console.error(`User has no email: ${userId}`)
        return { success: false, error: 'User has no email' }
    }
    // 2. Calcular datas no fuso horário de Brasília (UTC-3)
    const getBrasiliaDateString = (date: Date) => {
        const offset = -3; // Brasília é UTC-3
        const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
        const brDate = new Date(utc + (3600000 * offset));
        return brDate.toISOString().split('T')[0];
    };

    const todayStr = getBrasiliaDateString(new Date());
    
    const sevenDaysFromNowDate = new Date();
    sevenDaysFromNowDate.setDate(sevenDaysFromNowDate.getDate() + 7);
    const sevenDaysFromNowStr = getBrasiliaDateString(sevenDaysFromNowDate);

    // 3. Buscar lançamentos financeiros da tabela 'financial_transactions' do usuário
    // com status = 'pending' e data <= sevenDaysFromNowStr
    const { data: txs, error: txsError } = await supabase
        .from('financial_transactions')
        .select('*, client:clients(*)')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .lte('date', sevenDaysFromNowStr);

    if (txsError) {
        console.error(`Erro ao buscar lançamentos para usuário ${userId}:`, txsError);
        return { success: false, error: txsError.message };
    }

    if (!txs || txs.length === 0) {
        return { success: true, message: 'Nenhum lançamento pendente encontrado', recipients: { overdue: 0, upcoming: 0 } };
    }

    // 4. Filtrar transações com base na integridade de exclusão lógica dos clientes (deleted_at IS NULL)
    const activeTxs = txs.filter((tx: any) => {
        if (tx.client_id) {
            // Se possui client_id, o cliente deve existir e não estar deletado logicamente
            return tx.client && tx.client.deleted_at === null;
        }
        return true; // Lançamentos não vinculados a clientes são mantidos
    });

    if (activeTxs.length === 0) {
        return { success: true, message: 'Nenhum lançamento ativo pendente encontrado', recipients: { overdue: 0, upcoming: 0 } };
    }

    // 5. Ordenar transações sempre pela data
    activeTxs.sort((a: any, b: any) => a.date.localeCompare(b.date));

    // Categorizar em Atrasados e Próximos 7 dias
    const overdueTxs: any[] = [];
    const upcomingTxs: any[] = [];

    activeTxs.forEach((tx: any) => {
        if (tx.date < todayStr) {
            overdueTxs.push(tx);
        } else {
            upcomingTxs.push(tx);
        }
    });

    // 6. Montar o HTML do E-mail com design premium (similar à tela de lançamentos)
    const formatDate = (dateString: string) => {
        if (!dateString) return '-';
        const [year, month, day] = dateString.split('-');
        return `${day}/${month}/${year}`;
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);
    };

    // Função para tratar a Descrição (Cliente) sem duplicar se forem idênticos
    const getFormattedDescription = (tx: any) => {
        const desc = tx.description || 'Sem descrição';
        const clientName = tx.client?.name;
        if (clientName && clientName.trim() !== '' && clientName.toLowerCase() !== desc.toLowerCase()) {
            return `${desc} (${clientName})`;
        }
        return desc;
    };

    let htmlContent = `
  <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #334155; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
    
    <!-- Cabeçalho com Logo Premium -->
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 24px; border-bottom: 1px solid #f1f5f9; padding-bottom: 16px;">
        <img src="https://recebimentosmart.com.br/images/logo.svg" alt="Recebimento Smart" style="height: 32px; vertical-align: middle;" />
        <span style="font-size: 20px; font-weight: 800; vertical-align: middle; color: #0f172a; font-family: 'Segoe UI', Arial, sans-serif;">
            Recebimento <span style="color: #29a8a8;">$mart</span>
        </span>
    </div>
    
    <p style="margin-top: 0; font-size: 14px;">Olá <strong>${userName}</strong>,</p>
    <p style="font-size: 13px;">Aqui está o resumo consolidado das suas contas pendentes em atraso e a vencer nos próximos 7 dias no sistema.</p>
    
    <!-- Indicadores de topo -->
    <div style="margin-bottom: 24px; font-size: 12px;">
        <table style="width: 100%; border-spacing: 12px 0; margin-left: -12px; margin-right: -12px;">
            <tr>
                ${overdueTxs.length > 0 ? `
                <td style="width: 50%; background-color: #fef2f2; border: 1px solid #fee2e2; padding: 12px; border-radius: 12px; text-align: center;">
                    <div style="font-weight: bold; color: #991b1b; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px;">🔴 Contas em Atraso</div>
                    <div style="font-size: 22px; font-weight: 800; color: #ef4444; margin-top: 4px;">${overdueTxs.length}</div>
                </td>
                ` : ''}
                ${upcomingTxs.length > 0 ? `
                <td style="width: 50%; background-color: #fefbeb; border: 1px solid #fef3c7; padding: 12px; border-radius: 12px; text-align: center;">
                    <div style="font-weight: bold; color: #92400e; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px;">🟡 Próximos 7 Dias</div>
                    <div style="font-size: 22px; font-weight: 800; color: #f59e0b; margin-top: 4px;">${upcomingTxs.length}</div>
                </td>
                ` : ''}
            </tr>
        </table>
    </div>

    <!-- Tabela Unificada de Lançamentos -->
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 28px; font-size: 12px;">
      <thead>
        <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0;">
          <th style="padding: 10px 8px; text-align: center; color: #64748b; font-weight: 800; text-transform: uppercase; font-size: 10px; width: 40px;">Status</th>
          <th style="padding: 10px 8px; text-align: left; color: #64748b; font-weight: 800; text-transform: uppercase; font-size: 10px;">Vencimento</th>
          <th style="padding: 10px 8px; text-align: left; color: #64748b; font-weight: 800; text-transform: uppercase; font-size: 10px;">Descrição (Cliente)</th>
          <th style="padding: 10px 8px; text-align: right; color: #64748b; font-weight: 800; text-transform: uppercase; font-size: 10px;">Valor</th>
        </tr>
      </thead>
      <tbody>
        ${activeTxs.map(tx => {
            const isOverdue = tx.date < todayStr;
            const statusBolinha = isOverdue ? '🔴' : '🟡';
            const valFormatted = formatCurrency(Number(tx.amount));
            const isIncome = tx.type === 'income';
            const valColor = isIncome ? '#10b981' : '#ef4444';
            const valSign = isIncome ? '+' : '-';
            
            return `
            <tr style="border-bottom: 1px solid #f1f5f9; ${isOverdue ? 'background-color: #fffafb;' : ''}">
              <td style="padding: 10px 8px; text-align: center; font-size: 14px; vertical-align: middle;">${statusBolinha}</td>
              <td style="padding: 10px 8px; vertical-align: middle; font-weight: ${isOverdue ? 'bold' : 'normal'}; color: ${isOverdue ? '#ef4444' : '#334155'};">${formatDate(tx.date)}</td>
              <td style="padding: 10px 8px; vertical-align: middle;">
                <span style="font-weight: bold; color: #1e293b;">${getFormattedDescription(tx)}</span>
              </td>
              <td style="padding: 10px 8px; text-align: right; vertical-align: middle; font-weight: bold; color: ${valColor}; white-space: nowrap;">
                ${valSign} ${valFormatted}
              </td>
            </tr>
            `;
        }).join('')}
      </tbody>
    </table>

    <div style="text-align: center; margin: 30px 0;">
        <a href="https://recebimentosmart.com.br" style="background-color: #29a8a8; color: white; padding: 12px 28px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 13px; box-shadow: 0 4px 6px -1px rgba(41, 168, 168, 0.25);">
            Acessar Painel Financeiro
        </a>
    </div>
    
    <p style="margin-top: 30px; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 16px; text-align: center;">
      Este é um e-mail automático do sistema Recebimento Smart.
    </p>
  </div>
`;

    // 7. Enviar o e-mail via Brevo API
    const emailPayload = {
        sender: { name: 'Recebimento $mart', email: 'no-reply@recebimentosmart.com.br' },
        to: [{ email: recipientEmail }],
        subject: `⚠ Relatório de Pagamentos - Contas de ${userName}`,
        htmlContent: htmlContent,
    };

    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'api-key': brevoApiKey,
            'content-type': 'application/json',
        },
        body: JSON.stringify(emailPayload),
    });

    if (!brevoResponse.ok) {
        const errorText = await brevoResponse.text();
        console.error(`Erro ao enviar e-mail para ${recipientEmail}: ${errorText}`);
        return { success: false, error: `Erro ao enviar e-mail: ${errorText}` };
    }

    return { 
        success: true, 
        message: 'E-mail semanal de lote enviado com sucesso!', 
        recipients: { overdue: overdueTxs.length, upcoming: upcomingTxs.length } 
    };
}
