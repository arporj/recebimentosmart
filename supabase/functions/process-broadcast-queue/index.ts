import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { isFuture, parseISO, subDays } from 'npm:date-fns';

// Variáveis de ambiente
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY');
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// Headers CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let supabaseAdmin;
  let broadcast = null;

  try {
    // Validação de secrets
    if (!BREVO_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Uma ou mais secrets (BREVO_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) não foram configuradas.');
    }

    supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Busca o broadcast pendente
    const { data: fetchedBroadcast, error: fetchError } = await supabaseAdmin
      .from('email_broadcasts')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      console.error('Erro ao buscar broadcast pendente:', fetchError);
      throw new Error(`Falha ao buscar broadcast pendente: ${fetchError.message}`);
    }

    if (!fetchedBroadcast) {
      console.log('Nenhum broadcast pendente encontrado. Encerrando.');
      return new Response(JSON.stringify({ message: 'Nenhum broadcast pendente.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    broadcast = fetchedBroadcast;
    console.log(`Iniciando processamento do broadcast ID: ${broadcast.id}, Assunto: "${broadcast.subject}"`);

    // 2. Atualiza o status para 'processing'
    const { error: updateError } = await supabaseAdmin
      .from('email_broadcasts')
      .update({
        status: 'processing',
        processed_at: new Date().toISOString(),
      })
      .eq('id', broadcast.id);

    if (updateError) {
      console.error('Erro ao atualizar status do broadcast para processing:', updateError);
      throw new Error('Falha ao atualizar status do broadcast.');
    }
    console.log('Status do broadcast atualizado para "processing".');

    // 3. Busca usuários e seus e-mails
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, is_admin, valid_until');

    if (profilesError) {
      console.error('Erro ao buscar perfis:', profilesError);
      throw new Error('Falha ao buscar perfis para o broadcast.');
    }

    // Usar o método admin para buscar todos os usuários de forma paginada
    const getAllAuthUsers = async () => {
      let allUsers = [];
      let page = 0;
      const PAGE_SIZE = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: { users: userBatch }, error } = await supabaseAdmin.auth.admin.listUsers({
          page,
          perPage: PAGE_SIZE,
        });

        if (error) {
          console.error(`Erro ao buscar usuários de autenticação (página ${page}):`, error);
          throw new Error('Falha ao buscar usuários de autenticação para o broadcast.');
        }

        if (userBatch.length > 0) {
          allUsers.push(...userBatch);
          page++;
        } else {
          hasMore = false;
        }
      }
      return allUsers;
    };

    const authUsers = await getAllAuthUsers();
    const authUsersMap = new Map(authUsers.map(u => [u.id, u.email]));

    const users = profiles.map(profile => ({
      ...profile,
      email: authUsersMap.get(profile.id)
    })).filter(profile => profile.email !== null && profile.email !== '');

    console.log(`Total de ${users.length} perfis de usuário encontrados com e-mail.`);

    // 4. Filtra usuários ativos
    const twoMonthsAgo = subDays(new Date(), 60);
    const activeUsers = users.filter((profile) => {
      if (profile.is_admin) {
        return true; // Admins sempre recebem
      }
      if (profile.valid_until) {
        try {
          const validUntilDate = parseISO(profile.valid_until);
          // Usuários com assinatura válida (data no futuro) OU expirada há no máximo 2 meses
          return isFuture(validUntilDate) || validUntilDate >= twoMonthsAgo;
        } catch (e) {
          console.warn(`Data 'valid_until' inválida para o perfil ${profile.id}: ${profile.valid_until}`);
          return false;
        }
      }
      return false; // Outros casos não são considerados ativos
    });
    console.log(`Encontrados ${activeUsers.length} usuários ativos para o broadcast.`);

    // Trata caso sem usuários ativos
    if (activeUsers.length === 0) {
      console.log('Nenhum usuário ativo encontrado para este broadcast. Marcando como concluído.');
      await supabaseAdmin
        .from('email_broadcasts')
        .update({
          status: 'completed',
          error_message: 'Nenhum usuário ativo encontrado para enviar.',
        })
        .eq('id', broadcast.id);

      return new Response(
        JSON.stringify({
          success: true,
          message: `Broadcast "${broadcast.subject}" processado. Nenhum usuário ativo para enviar.`,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Envia e-mails em lotes com personalização
    const BATCH_SIZE = 50;
    let emailsSent = 0;
    for (let i = 0; i < activeUsers.length; i += BATCH_SIZE) {
      const batch = activeUsers.slice(i, i + BATCH_SIZE);
      if (batch.length === 0) continue;

      // Prepara o corpo do e-mail genérico com as modificações
      let genericBody = broadcast.body
        // 1. Coloca o nome do sistema em negrito
        .replace(/Recebimento \$mart/g, '<strong>Recebimento $mart</strong>')
        // 2. Remove a frase desnecessária
        .replace('Não se preocupe, você continuará pagando o preço antigo até a data da sua próxima renovação.', '')
        // 3. Adiciona o placeholder para o nome do usuário
        .replace('Olá!', 'Olá, {{params.name}}!');

      // 4. Formata os valores monetários para o padrão brasileiro
      genericBody = genericBody.replace(/R\$ (\d+\.\d{2})/g, (_match, value) => `R$ ${parseFloat(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
      genericBody = genericBody.replace(/R\$ (\d+)(?![\d,])/g, (_match, value) => `R$ ${parseInt(value, 10).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);

      // Prepara os dados para personalização em massa via Brevo
      const recipients = batch.map((user) => ({ email: user.email }));
      const messageVersions = batch.map(user => ({
        to: [{ email: user.email }],
        params: {
          name: user.full_name || 'Cliente' // Usa 'Cliente' como fallback
        }
      }));

      const emailPayload = {
        sender: { name: 'Recebimento $mart', email: 'contato@recebimentosmart.com.br' },
        to: recipients,
        subject: broadcast.subject,
        htmlContent: genericBody, // Corpo do e-mail com placeholders
        messageVersions: messageVersions, // Dados de personalização
      };

      console.log(`Enviando lote ${Math.floor(i / BATCH_SIZE) + 1} com ${recipients.length} destinatários.`);
      const brevoResponse = await fetch(BREVO_API_URL, {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': BREVO_API_KEY,
          'content-type': 'application/json',
        },
        body: JSON.stringify(emailPayload),
      });

      if (!brevoResponse.ok) {
        const errorBody = await brevoResponse.json();
        console.error(`Erro ao enviar lote de e-mails via Brevo (lote ${Math.floor(i / BATCH_SIZE) + 1}):`, errorBody);
        throw new Error(`Falha ao enviar lote de e-mails via Brevo: ${JSON.stringify(errorBody)}`);
      }

      const responseData = await brevoResponse.json();
      console.log(`Resposta da Brevo para o lote ${Math.floor(i / BATCH_SIZE) + 1}:`, responseData);
      emailsSent += batch.length;
      console.log(`Lote ${Math.floor(i / BATCH_SIZE) + 1} enviado com sucesso. Total enviados até agora: ${emailsSent}`);
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Rate limiting
    }

    // 6. Marca o broadcast como concluído
    console.log('Todos os lotes foram processados. Marcando o broadcast como "completed".');
    await supabaseAdmin
      .from('email_broadcasts')
      .update({
        status: 'completed',
        error_message: null, // Limpa mensagens de erro anteriores
      })
      .eq('id', broadcast.id);

    console.log(`Broadcast ID: ${broadcast.id} concluído com sucesso. Total de ${emailsSent} e-mails enviados.`);
    return new Response(
      JSON.stringify({
        success: true,
        message: `Broadcast "${broadcast.subject}" processado. ${emailsSent} e-mails enviados.`,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Erro fatal na função process-broadcast-queue:', err);
    if (supabaseAdmin && broadcast && broadcast.id) {
      await supabaseAdmin
        .from('email_broadcasts')
        .update({
          status: 'failed',
          error_message: err.message,
        })
        .eq('id', broadcast.id);
    }
    // Envia e-mail de alerta para o administrador
    try {
      const alertPayload = {
        sender: { name: 'Recebimento $mart - Alerta', email: 'no-reply@recebimentosmart.com.br' },
        to: [{ email: 'andre@recebimentosmart.com.br' }],
        subject: `ALERTA: Falha no processamento de Broadcast - ID: ${broadcast?.id || 'N/A'}`,
        htmlContent: `
          <p>Ocorreu um erro fatal ao processar um broadcast de e-mails.</p>
          <p><strong>ID do Broadcast:</strong> ${broadcast?.id || 'N/A'}</p>
          <p><strong>Assunto do Broadcast:</strong> ${broadcast?.subject || 'N/A'}</p>
          <p><strong>Mensagem de Erro:</strong> ${err.message}</p>
          <p>Por favor, verifique os logs da função <code>process-broadcast-queue</code> no Supabase para mais detalhes.</p>
        `,
      };

      const alertResponse = await fetch(BREVO_API_URL, {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': BREVO_API_KEY,
          'content-type': 'application/json',
        },
        body: JSON.stringify(alertPayload),
      });

      if (!alertResponse.ok) {
        const alertErrorBody = await alertResponse.json();
        console.error('Erro ao enviar e-mail de alerta via Brevo:', alertErrorBody);
      } else {
        console.log('E-mail de alerta enviado com sucesso.');
      }
    } catch (alertErr) {
      console.error('Erro inesperado ao tentar enviar e-mail de alerta:', alertErr);
    }

    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});