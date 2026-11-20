import fs from 'fs';
import nodemailer from 'nodemailer';
import path from 'path';
import { reportDateToFileName } from './excel.js';

const SEND_MAX_ATTEMPTS = 3;
const SEND_RETRY_DELAY_MS = 2500;

function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pick(row, ...keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) {
      return row[key];
    }
  }
  return '';
}

export function parseEmailRecipients() {
  return (process.env.EMAIL_TO || '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);
}

function countBySpecialty(rows) {
  const counts = new Map();
  for (const row of rows) {
    const specialty =
      pick(row, 'ESPECIALIDAD', 'especialidad') || '(Sin especialidad)';
    counts.set(specialty, (counts.get(specialty) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], 'es')
  );
}

async function getGmailAccessToken() {
  const params = new URLSearchParams({
    client_id: process.env.GMAIL_CLIENT_ID.trim(),
    client_secret: process.env.GMAIL_CLIENT_SECRET.trim(),
    refresh_token: process.env.GMAIL_REFRESH_TOKEN.trim(),
    grant_type: 'refresh_token',
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await response.json();

  if (!response.ok) {
    const detail = data.error_description || data.error || response.statusText;
    throw new Error(
      `No se pudo renovar el token OAuth2 de Gmail: ${detail}. Verifique que GMAIL_USER coincida con la cuenta que generó GMAIL_REFRESH_TOKEN.`
    );
  }

  return data.access_token;
}

function createTransporter(accessToken) {
  const user = process.env.GMAIL_USER.trim();

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    connectionTimeout: 60_000,
    greetingTimeout: 30_000,
    socketTimeout: 120_000,
    auth: {
      type: 'OAuth2',
      user,
      clientId: process.env.GMAIL_CLIENT_ID.trim(),
      clientSecret: process.env.GMAIL_CLIENT_SECRET.trim(),
      refreshToken: process.env.GMAIL_REFRESH_TOKEN.trim(),
      accessToken,
    },
  });
}

function buildExecutiveSummaryHtml(rows, reportDate) {
  const total = rows.length;
  const attachmentName = reportDateToFileName(reportDate);

  if (total === 0) {
    return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, Helvetica, sans-serif; color: #333; line-height: 1.6;">
  <p>Hola,</p>
  <h2 style="color: #1a5276; font-size: 18px;">Resumen ejecutivo — citas del día anterior</h2>
  <p><strong>Fecha del reporte:</strong> ${escapeHtml(reportDate)}</p>
  <p><strong>Total general de citas:</strong> 0</p>
  <p>No hubo citas con estado <strong>P</strong> o <strong>T</strong> en esa fecha.</p>
  <p style="margin-top: 20px; padding: 12px; background-color: #f4f6f7; border-left: 4px solid #1a5276;">
    El detalle completo (sin registros) se encuentra en el archivo Excel adjunto: <strong>${escapeHtml(attachmentName)}</strong>.
  </p>
</body>
</html>`;
  }

  const bySpecialty = countBySpecialty(rows);
  const specialtyRows = bySpecialty
    .map(
      ([name, count]) => `
    <tr>
      <td style="padding: 8px 12px; border: 1px solid #ddd;">${escapeHtml(name)}</td>
      <td style="padding: 8px 12px; border: 1px solid #ddd; text-align: center;">${count}</td>
    </tr>`
    )
    .join('');

  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, Helvetica, sans-serif; color: #333; line-height: 1.6;">
  <p>Hola,</p>
  <h2 style="color: #1a5276; font-size: 18px;">Resumen ejecutivo — citas del día anterior</h2>
  <p><strong>Fecha del reporte:</strong> ${escapeHtml(reportDate)}</p>
  <p><strong>Total general de citas:</strong> ${total}</p>
  <h3 style="font-size: 15px; margin-top: 20px;">Citas por especialidad</h3>
  <table style="border-collapse: collapse; max-width: 480px; font-size: 14px; margin-bottom: 20px;">
    <thead>
      <tr style="background-color: #1a5276; color: #fff;">
        <th style="padding: 10px 12px; border: 1px solid #154360; text-align: left;">Especialidad</th>
        <th style="padding: 10px 12px; border: 1px solid #154360; text-align: center;">Cantidad</th>
      </tr>
    </thead>
    <tbody>
      ${specialtyRows}
    </tbody>
  </table>
  <p style="padding: 12px; background-color: #f4f6f7; border-left: 4px solid #1a5276;">
    El detalle completo de todos los registros está en el archivo Excel adjunto: <strong>${escapeHtml(attachmentName)}</strong>.
  </p>
</body>
</html>`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {object[]} rows
 * @param {string} reportDate DD/MM/YYYY
 * @param {string} excelFilePath Ruta del .xlsx generado
 */
export async function sendAppointmentsReport(rows, reportDate, excelFilePath) {
  const destinatarios = parseEmailRecipients();

  if (destinatarios.length === 0) {
    const error = new Error(
      'EMAIL_TO está vacío o no contiene correos válidos. Configure uno o más destinatarios separados por coma.'
    );
    console.error(`[mailer] ${error.message}`);
    throw error;
  }

  if (!fs.existsSync(excelFilePath)) {
    throw new Error(`No se encontró el archivo Excel adjunto: ${excelFilePath}`);
  }

  const total = rows.length;
  const subject = `Reporte Diario de Citas - ${reportDate} (${total} registros)`;
  const html = buildExecutiveSummaryHtml(rows, reportDate);
  const attachmentFileName = path.basename(excelFilePath);

  const mailOptions = {
    from: process.env.GMAIL_USER.trim(),
    to: destinatarios,
    subject,
    html,
    attachments: [
      {
        filename: attachmentFileName,
        path: excelFilePath,
      },
    ],
  };

  let lastError;

  for (let attempt = 1; attempt <= SEND_MAX_ATTEMPTS; attempt++) {
    let transporter;

    try {
      const accessToken = await getGmailAccessToken();
      transporter = createTransporter(accessToken);

      const info = await transporter.sendMail(mailOptions);

      console.log(
        `[mailer] Correo enviado a ${destinatarios.join(', ')} (messageId: ${info.messageId})`
      );

      return { info, destinatarios };
    } catch (err) {
      lastError = err;
      console.error(
        `[mailer] Intento ${attempt}/${SEND_MAX_ATTEMPTS} fallido: ${err.message}`
      );

      if (attempt < SEND_MAX_ATTEMPTS) {
        await sleep(SEND_RETRY_DELAY_MS * attempt);
      }
    } finally {
      if (transporter) {
        transporter.close();
      }
    }
  }

  throw lastError;
}