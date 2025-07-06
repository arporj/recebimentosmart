// netlify/functions/contact-form.js
import nodemailer from 'nodemailer';

const buildResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  },
  body: JSON.stringify(body),
});

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return buildResponse(204, {});
  }

  if (event.httpMethod !== 'POST') {
    return buildResponse(405, { success: false, message: 'Method Not Allowed' });
  }

  // --- Start Debugging ---
  console.log("--- Environment Variables Received by Function ---");
  console.log("RECIPIENT_EMAIL:", process.env.RECIPIENT_EMAIL ? "Exists" : "MISSING or EMPTY");
  console.log("SMTP_HOST:", process.env.SMTP_HOST ? "Exists" : "MISSING or EMPTY");
  console.log("SMTP_PORT:", process.env.SMTP_PORT ? "Exists" : "MISSING or EMPTY");
  console.log("SMTP_FROM_EMAIL:", process.env.SMTP_FROM_EMAIL ? "Exists" : "MISSING or EMPTY");
  console.log("SMTP_PASSWORD:", process.env.SMTP_PASSWORD ? "Exists" : "MISSING or EMPTY");
  console.log("-------------------------------------------------");
  // --- End Debugging ---

  try {
    // --- More Specific Validation ---
    if (!process.env.RECIPIENT_EMAIL) {
      return buildResponse(500, { success: false, message: 'Configuration Error: RECIPIENT_EMAIL is not set.' });
    }
    if (!process.env.SMTP_HOST) {
      return buildResponse(500, { success: false, message: 'Configuration Error: SMTP_HOST is not set.' });
    }
    if (!process.env.SMTP_PORT) {
      return buildResponse(500, { success: false, message: 'Configuration Error: SMTP_PORT is not set.' });
    }
    if (!process.env.SMTP_FROM_EMAIL) {
      return buildResponse(500, { success: false, message: 'Configuration Error: SMTP_FROM_EMAIL is not set.' });
    }
    if (!process.env.SMTP_PASSWORD) {
      return buildResponse(500, { success: false, message: 'Configuration Error: SMTP_PASSWORD is not set.' });
    }
    // --- End Validation ---

    const data = JSON.parse(event.body);

    if (!data.subject || !data.comment || !data.from || !data.name || !data.type) {
      return buildResponse(400, { success: false, message: 'Client Error: Missing required fields in request body.' });
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER, // Using SMTP_USER for authentication
        pass: process.env.SMTP_PASSWORD,
      },
    });

    const { subject, comment, from, name, type } = data;

    const mailOptions = {
      from: `"RecebimentoSmart Feedback" <${process.env.SMTP_USER}>`,
      to: process.env.RECIPIENT_EMAIL,
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

    await transporter.sendMail(mailOptions);

    return buildResponse(200, { success: true, message: 'Feedback sent successfully!' });

  } catch (error) {
    console.error('--- UNCAUGHT ERROR ---');
    console.error('Error object:', error);
    console.error('----------------------');
    return buildResponse(500, { success: false, message: `An unexpected error occurred: ${error.message}` });
  }
}
