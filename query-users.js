// Script para consultar os e-mails dos usuários que criaram campos personalizados
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

// Configurações do Supabase (as mesmas usadas no projeto)
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'http://localhost:54321';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

// Criar cliente Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

async function getUserEmails() {
  try {
    // IDs dos usuários do print
    const userIds = [
      '40599fe8-f73a-48b8-8342-d27f3e5c9c9c',
      '00bb6d82-18d4-4dd7-874f-6a769e9a9c9c',
      '9eaf1feb-6c9b-4d27-91bc-b0279e9a9c9c'
    ];
    
    // Consultar os campos personalizados para verificar quais usuários realmente têm campos
    const { data: customFields, error: cfError } = await supabase
      .from('custom_fields')
      .select('user_id')
      .in('user_id', userIds);
    
    if (cfError) {
      console.error('Erro ao consultar campos personalizados:', cfError);
      return;
    }
    
    // Extrair os IDs únicos dos usuários que realmente têm campos personalizados
    const activeUserIds = [...new Set(customFields.map(cf => cf.user_id))];
    
    console.log('IDs dos usuários que criaram campos personalizados:');
    console.log(activeUserIds);
    
    // Consultar os perfis dos usuários
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username, full_name')
      .in('id', activeUserIds);
    
    if (profilesError) {
      console.error('Erro ao consultar perfis:', profilesError);
      return;
    }
    
    console.log('\nInformações dos usuários que criaram campos personalizados:');
    profiles.forEach(profile => {
      console.log(`ID: ${profile.id}`);
      console.log(`Username: ${profile.username || 'N/A'}`);
      console.log(`Nome completo: ${profile.full_name || 'N/A'}`);
      console.log('---');
    });
    
  } catch (err) {
    console.error('Erro:', err);
  }
}

// Executar a função
getUserEmails();

// Para ES modules, você pode exportar a função
export { getUserEmails };