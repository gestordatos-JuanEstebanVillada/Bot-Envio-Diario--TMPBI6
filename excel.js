import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';

const REPORTS_DIR = './reportes';
const SHEET_NAME = 'Citas';
const HEADERS = [
  'Especialidad',
  'Médico',
  'Hora',
  'Duración',
  'Fecha Cita',
];

function pick(row, ...keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) {
      return row[key];
    }
  }
  return '';
}

/** Convierte DD/MM/YYYY → Reporte_Citas_YYYY-MM-DD.xlsx */
export function reportDateToFileName(reportDate) {
  const [dd, mm, yyyy] = reportDate.split('/');
  return `Reporte_Citas_${yyyy}-${mm}-${dd}.xlsx`;
}

function autoFitColumns(worksheet) {
  for (let i = 1; i <= HEADERS.length; i++) {
    const column = worksheet.getColumn(i);
    let max = HEADERS[i - 1].length;
    column.eachCell({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? '').length;
      if (len > max) max = len;
    });
    column.width = Math.min(max + 2, 60);
  }
}

/**
 * @param {object[]} rows
 * @param {string} reportDate DD/MM/YYYY
 * @returns {Promise<string>} Ruta absoluta del archivo generado
 */
export async function saveAppointmentsExcel(rows, reportDate) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const fileName = reportDateToFileName(reportDate);
  const filePath = path.resolve(REPORTS_DIR, fileName);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(SHEET_NAME);

  const headerRow = sheet.addRow(HEADERS);
  headerRow.font = { bold: true };

  for (const row of rows) {
    sheet.addRow([
      pick(row, 'ESPECIALIDAD', 'especialidad'),
      pick(row, 'MEDICO', 'medico'),
      pick(row, 'HORA', 'hora'),
      pick(row, 'DURACION', 'duracion'),
      pick(row, 'FECHACITA', 'fechacita'),
    ]);
  }

  autoFitColumns(sheet);

  await workbook.xlsx.writeFile(filePath);
  return filePath;
}