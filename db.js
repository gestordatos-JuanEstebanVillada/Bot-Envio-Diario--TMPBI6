import oracledb from 'oracledb';

const APPOINTMENTS_SQL = `
SELECT
    especialidad,
    medico,
    TO_CHAR(hora, 'HH12:MI AM') AS hora,
    TO_CHAR(duracion, 'MI:SS') AS duracion,
    TO_CHAR(fechacita, 'DD/MM/YYYY') AS fechacita
FROM tmpbi6
WHERE TRUNC(fechacita) = TRUNC(SYSDATE) - 1
  AND citest IN ('P', 'T')
ORDER BY especialidad ASC, tmpbi6.hora ASC
`;

function getConnectString() {
  const { SCSE_DB_IP, SCSE_DB_PORT, SCSE_DB_DATABASE } = process.env;
  return `${SCSE_DB_IP}:${SCSE_DB_PORT}/${SCSE_DB_DATABASE}`;
}

/**
 * @returns {Promise<Array<{
 *   ESPECIALIDAD?: string;
 *   MEDICO?: string;
 *   HORA?: string;
 *   DURACION?: string;
 *   FECHACITA?: string;
 *   especialidad?: string;
 *   medico?: string;
 *   hora?: string;
 *   duracion?: string;
 *   fechacita?: string;
 * }>>}
 */
export async function fetchYesterdayAppointments() {
  let connection;

  try {
    connection = await oracledb.getConnection({
      user: process.env.SCSE_DB_USER,
      password: process.env.SCSE_DB_PASSWD,
      connectString: getConnectString(),
    });

    const result = await connection.execute(APPOINTMENTS_SQL, [], {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });

    return result.rows ?? [];
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (closeErr) {
        console.error(
          `[${new Date().toISOString()}] Error al cerrar conexión Oracle:`,
          closeErr.message
        );
      }
    }
  }
}