
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import jwt from 'https://esm.sh/jsonwebtoken@9.0.2';

const JWT_SECRET = Deno.env.get('SUPABASE_JWT_SECRET');

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { targetUserId } = await req.json();
    if (!targetUserId) {
      return new Response(JSON.stringify({ error: 'targetUserId é obrigatório' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // 1. Cria um cliente Supabase a partir do token de autorização do requisitante (o admin)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Cabeçalho de autorização ausente');
    }
    const adminSupabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // 2. Verifica se o requisitante é um admin
    const { data: { user: adminUser }, error: adminError } = await adminSupabaseClient.auth.getUser();
    if (adminError || !adminUser) {
      return new Response(JSON.stringify({ error: 'Não foi possível verificar o usuário administrador.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const { data: adminProfile, error: profileError } = await adminSupabaseClient
      .from('profiles')
      .select('role')
      .eq('id', adminUser.id)
      .single();

    if (profileError || adminProfile?.role !== 'ADMIN') {
      return new Response(JSON.stringify({ error: 'Acesso negado. Somente administradores podem executar esta ação.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      });
    }

    // 3. Cria um cliente com privilégios de admin (service_role) para buscar os dados do usuário-alvo
    const serviceRoleClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: targetUser, error: targetUserError } = await serviceRoleClient.auth.admin.getUserById(targetUserId);

    if (targetUserError || !targetUser) {
        return new Response(JSON.stringify({ error: 'Usuário alvo não encontrado.' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 404,
        });
    }

    // 4. Gera um novo token JWT para o usuário-alvo
    if (!JWT_SECRET) {
        throw new Error('SUPABASE_JWT_SECRET não está definido nas variáveis de ambiente.');
    }

    const payload = {
      sub: targetUser.user.id,
      email: targetUser.user.email,
      role: targetUser.user.role,
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + (60 * 60), // Expira em 1 hora
      iat: Math.floor(Date.now() / 1000),
    };

    const accessToken = jwt.sign(payload, JWT_SECRET);

    return new Response(JSON.stringify({
        accessToken,
        user: targetUser.user
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
