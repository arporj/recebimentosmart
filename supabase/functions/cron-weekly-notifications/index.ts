import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { processUserDuePayments, corsHeaders } from '../_shared/payment-notification-logic.ts'

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') as string
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') as string
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string

serve(async (req) => {
    // This function is intended to be called by CRON, but can be manually triggered for testing
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        if (!BREVO_API_KEY) throw new Error('BREVO_API_KEY is not set')
        if (!SUPABASE_URL) throw new Error('SUPABASE_URL is not set')
        if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

        // 1. Calculate the horizon (7 days)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const sevenDaysFromNow = new Date(today)
        sevenDaysFromNow.setDate(today.getDate() + 7)
        sevenDaysFromNow.setHours(23, 59, 59, 999)

        console.log(`Starting Weekly Notification job. Checking for payments until ${sevenDaysFromNow.toISOString()}`)

        // 2. Find Users who have at least one client with payment due <= 7 days (or overdue)
        // We do this to avoid fetching all users and checking them one by one.
        // Query: Select distinct user_id from clients where status=true AND next_payment_date <= 7 days

        const { data: userIds, error: userError } = await supabase
            .from('clients')
            .select('user_id')
            .eq('status', true)
            .lte('next_payment_date', sevenDaysFromNow.toISOString())
        // We use .csv() or a transform if we want unique, but JS Set is easier for small batches.
        // Supabase/Postgrest doesn't support 'distinct' easily in simple select without RPC, 
        // but we can just fetch all relevant rows and dedupe in JS.

        if (userError) throw new Error(`Error fetching candidates: ${userError.message}`)

        if (!userIds || userIds.length === 0) {
            console.log('No users found with due payments.')
            return new Response(JSON.stringify({ message: 'No users found with due payments.' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        // Deduplicate user IDs
        const uniqueUserIds = [...new Set(userIds.map((u: any) => u.user_id))]
        console.log(`Found ${uniqueUserIds.length} users to process.`)

        const results = []

        // 3. Process each user
        for (const userId of uniqueUserIds) {
            if (!userId) continue;

            console.log(`Processing user: ${userId}`)
            try {
                const result = await processUserDuePayments(
                    userId,
                    SUPABASE_URL,
                    SUPABASE_SERVICE_ROLE_KEY,
                    BREVO_API_KEY
                )
                results.push({ userId, ...result })
            } catch (err: any) {
                console.error(`Failed to process user ${userId}:`, err)
                results.push({ userId, success: false, error: err.message })
            }
        }

        return new Response(
            JSON.stringify({
                success: true,
                processed: results.length,
                details: results
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )

    } catch (error: any) {
        console.error('Critical Error in cron job:', error)
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
    }
})
