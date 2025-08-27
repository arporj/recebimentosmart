import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';

// Crie um cliente Supabase com o service_role_key para ter privilégios de admin
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

Deno.serve(async (req) => {
  // Trata a requisição preflight de CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Busca todas as conversas
    const { data: conversations, error: convosError } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .order('created_at', { ascending: false });

    if (convosError) throw convosError;

    // 2. Extrai os IDs de usuário únicos
    const userIds = [...new Set(conversations.map(c => c.user_id))];

    // 3. Busca os perfis correspondentes
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, name')
      .in('id', userIds);

    if (profilesError) throw profilesError;

    // 4. Cria um mapa de perfis para busca rápida
    const profilesMap = new Map(profiles.map(p => [p.id, p]));

    // 5. Combina os dados da conversa com os perfis
    const combinedData = conversations.map(convo => ({
      ...convo,
      profile: profilesMap.get(convo.user_id) || null
    }));

    // Retorna os dados combinados
    return new Response(JSON.stringify(combinedData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Erro na função get-conversations:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
