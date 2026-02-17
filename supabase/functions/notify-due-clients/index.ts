import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

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

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

        // 1. Get User Email if targetEmail is not provided
        let recipientEmail = targetEmail
        if (!recipientEmail) {
            const { data: user, error: userError } = await supabase.auth.admin.getUserById(userId)
            if (userError || !user.user) throw new Error('User not found')
            recipientEmail = user.user.email
        }

        // 2. Calculate dates
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const sevenDaysFromNow = new Date(today)
        sevenDaysFromNow.setDate(today.getDate() + 7)
        // Set to end of day
        sevenDaysFromNow.setHours(23, 59, 59, 999)

        // 3. Query Clients
        const { data: clients, error: clientsError } = await supabase
            .from('clients')
            .select('*')
            .eq('user_id', userId)
            .eq('status', true) // Only active clients
            // We want clients where next_payment_date <= 7 days from now
            // AND next_payment_date is not null
            .lte('next_payment_date', sevenDaysFromNow.toISOString())
            .order('next_payment_date', { ascending: true })

        if (clientsError) throw new Error(`Error fetching clients: ${clientsError.message}`)

        if (!clients || clients.length === 0) {
            return new Response(
                JSON.stringify({ message: 'No due payments found for this user.' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
            )
        }

        // 4. Categorize Clients
        const overdueClients: any[] = []
        const upcomingClients: any[] = []

        clients.forEach((client: any) => {
            const paymentDate = new Date(client.next_payment_date)
            // Reset hours for comparison
            paymentDate.setHours(0, 0, 0, 0)

            if (paymentDate < today) {
                overdueClients.push(client)
            } else {
                upcomingClients.push(client)
            }
        })

        // 5. Build HTML Email
        const formatDate = (dateString: string) => {
            if (!dateString) return '-'
            return new Date(dateString).toLocaleDateString('pt-BR')
        }

        const formatCurrency = (amount: number) => {
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount)
        }

        let htmlContent = `
      <div style="font-family: Arial, sans-serif; color: #333;">
        <h2>Relatório de Pagamentos - Recebimento Smart</h2>
        <p>Olá,</p>
        <p>Aqui está o resumo dos clientes com pagamentos pendentes ou próximos do vencimento.</p>
    `

        if (overdueClients.length > 0) {
            htmlContent += `
        <h3 style="color: #d32f2f;">🔴 Pagamentos Atrasados (${overdueClients.length})</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr style="background-color: #fce8e6;">
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Cliente</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Vencimento</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Valor</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Telefone</th>
          </tr>
          ${overdueClients.map(c => `
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;">${c.name}</td>
              <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">${formatDate(c.next_payment_date)}</td>
              <td style="padding: 8px; border: 1px solid #ddd;">${formatCurrency(c.monthly_payment)}</td>
              <td style="padding: 8px; border: 1px solid #ddd;">${c.phone}</td>
            </tr>
          `).join('')}
        </table>
      `
        }

        if (upcomingClients.length > 0) {
            htmlContent += `
        <h3 style="color: #f57c00;">🟠 Vencendo em 7 dias (${upcomingClients.length})</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr style="background-color: #fff3e0;">
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Cliente</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Vencimento</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Valor</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Telefone</th>
          </tr>
          ${upcomingClients.map(c => `
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;">${c.name}</td>
              <td style="padding: 8px; border: 1px solid #ddd;">${formatDate(c.next_payment_date)}</td>
              <td style="padding: 8px; border: 1px solid #ddd;">${formatCurrency(c.monthly_payment)}</td>
              <td style="padding: 8px; border: 1px solid #ddd;">${c.phone}</td>
            </tr>
          `).join('')}
        </table>
      `
        }

        if (overdueClients.length === 0 && upcomingClients.length === 0) {
            htmlContent += `<p>Tudo certo! Você não tem pagamentos pendentes ou vencendo nos próximos 7 dias.</p>`
        }

        htmlContent += `
        <p style="margin-top: 30px; font-size: 12px; color: #888;">
          Este é um e-mail automático do sistema Recebimento Smart.
        </p>
      </div>
    `

        // 6. Send Email using Brevo API
        const emailPayload = {
            sender: { name: 'Recebimento $mart', email: 'no-reply@recebimentosmart.com.br' },
            to: [{ email: recipientEmail }],
            subject: '⚠ Relatório de Pagamentos - Clientes em Atraso/Vencendo',
            htmlContent: htmlContent,
        }

        const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': BREVO_API_KEY,
                'content-type': 'application/json',
            },
            body: JSON.stringify(emailPayload),
        })

        if (!brevoResponse.ok) {
            const errorText = await brevoResponse.text()
            throw new Error(`Error sending email: ${errorText}`)
        }

        return new Response(
            JSON.stringify({ success: true, message: 'Email sent successfully', recipients: { overdue: overdueClients.length, upcoming: upcomingClients.length } }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )

    } catch (error: any) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
    }
})
