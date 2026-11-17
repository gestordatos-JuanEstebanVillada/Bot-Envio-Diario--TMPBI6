import nodemailer from 'nodemailer';
import path from 'path';
import { reportDateToFileName } from './excel.js';

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

function createTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: process.env.GMAIL_USER,
      clientId: process.env.GMAIL_CLIENT_ID,
      clientSecret: process.env.GMAIL_CLIENT_SECRET,
      refreshToken: process.env.GMAIL_REFRESH_TOKEN,
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

/**
 * @param {object[]} rows
 * @param {string} reportDate DD/MM/YYYY
 * @param {string} excelFilePath Ruta del .xlsx generado
 */
export async function sendAppointmentsReport(rows, reportDate, excelFilePath) {
  const total = rows.length;
  const subject = `Reporte Diario de Citas - ${reportDate} (${total} registros)`;
  const html = buildExecutiveSummaryHtml(rows, reportDate);
  const attachmentFileName = path.basename(excelFilePath);

  const transporter = createTransporter();

  const info = await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: process.env.EMAIL_TO,
    subject,
    html,
    attachments: [
      {
        filename: attachmentFileName,
        path: excelFilePath,
      },
    ],
  });

  return info;
}