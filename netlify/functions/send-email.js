
// netlify/functions/send-email.js
import nodemailer from 'nodemailer';

// Helper to build the response with CORS headers
const buildResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    'Access-Control-Allow-Origin': '*', // Allow requests from any origin
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  },
  body: JSON.stringify(body),
});

export async function handler(event) {
  // Handle preflight CORS request for browsers
  if (event.httpMethod === 'OPTIONS') {
    return buildResponse(204, {});
  }

  // Ensure it's a POST request
  if (event.httpMethod !== 'POST') {
    return buildResponse(405, { success: false, message: 'Method Not Allowed' });
  }

  try {
    const data = JSON.parse(event.body);

    // Basic validation
    if (!data.subject || !data.comment || !data.from || !data.name || !data.type) {
      return buildResponse(400, { success: false, message: 'Missing required fields' });
    }

    // Nodemailer transporter setup using environment variables
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10),
      secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_FROM_EMAIL,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    const { subject, comment, from, name, type } = data;
    const recipient_email = process.env.RECIPIENT_EMAIL;

    if (!recipient_email) {
        console.error('Recipient email (RECIPIENT_EMAIL) is not configured.');
        return buildResponse(500, { success: false, message: 'Server configuration error.' });
    }

    // Email content
    const mailOptions = {
      from: `"${name}" <${process.env.SMTP_FROM_EMAIL}>`,
      to: recipient_email,
      replyTo: from,
      subject: `[${type}] ${subject}`,
      text: `
Novo feedback recebido do RecebimentoSmart:

Tipo: ${type}
Assunto: ${subject}

Comentário:
${comment}

---
Enviado por: ${name}
E-mail: ${from}
      `,
    };

    // Send the email
    await transporter.sendMail(mailOptions);

    return buildResponse(200, { success: true, message: 'Feedback sent successfully!' });

  } catch (error) {
    console.error('Error sending email:', error);
    return buildResponse(500, { success: false, message: 'Internal Server Error. Could not send feedback.' });
  }
}
