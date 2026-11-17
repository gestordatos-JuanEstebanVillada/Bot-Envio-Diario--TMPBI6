import 'dotenv/config';
import cron from 'node-cron';
import { fetchYesterdayAppointments } from './db.js';
import { saveAppointmentsExcel } from './excel.js';
import { sendAppointmentsReport } from './mailer.js';

const TIMEZONE = process.env.TIMEZONE || 'America/Bogota';
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '0 7 * * *';

function log(message, level = 'INFO') {
  const ts = new Date().toLocaleString('es-CO', {
    timeZone: TIMEZONE,
    dateStyle: 'short',
    timeStyle: 'medium',
  });
  console.log(`[${ts}] [${level}] ${message}`);
}

function getYesterdayLabelBogota() {
  const todayInTz = new Date(
    new Date().toLocaleString('en-US', { timeZone: TIMEZONE })
  );
  const yesterday = new Date(todayInTz);
  yesterday.setDate(yesterday.getDate() - 1);

  const dd = String(yesterday.getDate()).padStart(2, '0');
  const mm = String(yesterday.getMonth() + 1).padStart(2, '0');
  const yyyy = yesterday.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function resolveReportDate(rows) {
  if (rows.length > 0) {
    const first = rows[0];
    const fromRow =
      first.FECHACITA ?? first.fechacita ?? first.Fechacita;
    if (fromRow) {
      return String(fromRow);
    }
  }
  return getYesterdayLabelBogota();
}

async function runDailyReport(trigger = 'manual') {
  log(`Iniciando envío de reporte (origen: ${trigger})…`);

  try {
    log('Consultando citas del día anterior en Oracle…');
    const rows = await fetchYesterdayAppointments();
    const reportDate = resolveReportDate(rows);

    log(`Registros obtenidos: ${rows.length}. Fecha del reporte: ${reportDate}`);

    log('Generando archivo Excel en ./reportes…');
    const excelPath = await saveAppointmentsExcel(rows, reportDate);
    log(`Excel guardado: ${excelPath}`);

    log('Enviando correo con resumen ejecutivo y adjunto…');
    const info = await sendAppointmentsReport(rows, reportDate, excelPath);

    log(
      `Correo enviado correctamente a ${process.env.EMAIL_TO} (messageId: ${info.messageId})`
    );
  } catch (err) {
    log(`Error en el proceso de reporte: ${err.message}`, 'ERROR');
    if (err.stack) {
      console.error(err.stack);
    }
  }
}

function validateEnv() {
  const required = [
    'SCSE_DB_USER',
    'SCSE_DB_PASSWD',
    'SCSE_DB_IP',
    'SCSE_DB_PORT',
    'SCSE_DB_DATABASE',
    'GMAIL_USER',
    'GMAIL_CLIENT_ID',
    'GMAIL_CLIENT_SECRET',
    'GMAIL_REFRESH_TOKEN',
    'EMAIL_TO',
  ];

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Variables de entorno faltantes: ${missing.join(', ')}`
    );
  }
}

async function main() {
  validateEnv();

  log('Bot de reporte TMPBI6 iniciado');
  log(`Zona horaria: ${TIMEZONE} | Cron: ${CRON_SCHEDULE}`);

  await runDailyReport('arranque-inmediato');

  if (!cron.validate(CRON_SCHEDULE)) {
    throw new Error(`CRON_SCHEDULE inválido: ${CRON_SCHEDULE}`);
  }

  cron.schedule(
    CRON_SCHEDULE,
    () => {
      runDailyReport('cron-programado');
    },
    { timezone: TIMEZONE }
  );

  log(
    `Programación activa: todos los días a las 07:00 (${TIMEZONE}). El proceso permanece en ejecución.`
  );
}

main().catch((err) => {
  log(`Fallo fatal al iniciar: ${err.message}`, 'ERROR');
  console.error(err);
  process.exit(1);
});