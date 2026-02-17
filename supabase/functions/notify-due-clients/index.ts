import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { processUserDuePayments, corsHeaders } from '../_shared/payment-notification-logic.ts'

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') as string
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') as string
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!BREVO_API_KEY) throw new Error('BREVO_API_KEY is not set')
    if (!SUPABASE_URL) throw new Error('SUPABASE_URL is not set')
    if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')

    const { userId, targetEmail } = await req.json()

    if (!userId) {
      throw new Error('userId is required')
    }

    const result = await processUserDuePayments(
      userId,
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      BREVO_API_KEY,
      targetEmail
    )

    if (!result.success && result.error) {
      throw new Error(result.error)
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
