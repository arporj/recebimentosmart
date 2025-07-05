const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL; // Usar VITE_SUPABASE_URL do .env do frontend
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Nova variável de ambiente para a service_role key

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing Supabase URL or Service Role Key in environment variables.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

module.exports = { supabase };