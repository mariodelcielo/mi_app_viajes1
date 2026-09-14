/**
 * BACKEND para la app de Gestión de Viajes.
 * Este script se pega en Extensiones > Apps Script DENTRO de tu Google Sheet,
 * y se publica como "Aplicación web". Es lo que permite que la app del celular
 * pueda LEER y ESCRIBIR de verdad en tu planilla (antes solo podía leer).
 *
 * IMPORTANTE: cambiá el PIN de abajo por uno propio antes de publicar.
 */

const PIN_CORRECTO = 'CAMBIA-ESTE-PIN-1234'; // <-- elegí tu propio código secreto

function doGet(e) {
  return handleRequest(e.parameter);
}

function doPost(e) {
  const params = JSON.parse(e.postData.contents);
  return handleRequest(params);
}

function handleRequest(params) {
  let result;
  try {
    if (params.action === 'consultaPiloto') {
      // acción pública: no pide PIN, para que cada piloto consulte SU PROPIA cuenta
      result = consultaPiloto(params.numero, params.nombre);
    } else if (params.pin !== PIN_CORRECTO) {
      result = { error: 'PIN incorrecto' };
    } else if (params.action === 'getAll') {
      result = getAllData();
    } else if (params.action === 'saveAll') {
      result = saveAllData(JSON.parse(params.data));
    } else {
      result = { error: 'Acción no reconocida' };
    }
  } catch (err) {
    result = { error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('No existe la hoja llamada: ' + name);
  return sheet;
}

function sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1)
    .filter(row => row.some(cell => cell !== '' && cell !== null))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      return obj;
    });
}

function objectsToSheet(sheet, objects) {
  const headers = sheet.getDataRange().getValues()[0];
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
  }
  if (!objects || objects.length === 0) return;
  const rows = objects.map(obj => headers.map(h => (obj[h] !== undefined ? obj[h] : '')));
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

function getAllData() {
  return {
    pilotos: sheetToObjects(getSheet('Pilotos')),
    lotes: sheetToObjects(getSheet('Lotes')),
    viajes: sheetToObjects(getSheet('Viajes')),
    config: sheetToObjects(getSheet('Configuracion')),
    tramos: sheetToObjects(getSheet('TramosDescuento')),
    pagos: sheetToObjects(getSheet('Pagos')),
    historialPrecios: sheetToObjects(getSheet('HistorialPrecios')),
    servidor: new Date().toISOString()
  };
}

function saveAllData(state) {
  if (state.pilotos) objectsToSheet(getSheet('Pilotos'), state.pilotos);
  if (state.lotes) objectsToSheet(getSheet('Lotes'), state.lotes);
  if (state.viajes) objectsToSheet(getSheet('Viajes'), state.viajes);
  if (state.pagos) objectsToSheet(getSheet('Pagos'), state.pagos);
  if (state.config) objectsToSheet(getSheet('Configuracion'), state.config);
  if (state.historialPrecios) objectsToSheet(getSheet('HistorialPrecios'), state.historialPrecios);
  return { ok: true, guardado: new Date().toISOString() };
}

// Consulta pública y acotada: un piloto solo puede ver SU PROPIA cuenta,
// aportando su Número Y su Nombre (evita que alguien espíe con solo probar números).
function consultaPiloto(numero, nombreParcial) {
  const pilotos = sheetToObjects(getSheet('Pilotos'));
  const nombreBuscado = String(nombreParcial || '').toLowerCase().trim();
  const piloto = pilotos.find(p =>
    String(p.Numero) === String(numero) &&
    String(p.Nombre || '').toLowerCase().includes(nombreBuscado) &&
    nombreBuscado.length > 0
  );
  if (!piloto) return { error: 'No encontramos esa cuenta. Revisá el número y el nombre.' };

  const lotesPiloto = sheetToObjects(getSheet('Lotes')).filter(l => String(l.Numero) === String(numero));
  const saldo = lotesPiloto.reduce((acc, l) => acc + (Number(l.Saldo_Disponible) || 0), 0);
  const viajesPiloto = sheetToObjects(getSheet('Viajes'))
    .filter(v => String(v.Numero) === String(numero))
    .slice(-5).reverse();

  return {
    numero: piloto.Numero,
    nombre: piloto.Nombre,
    alias: piloto.Alias || '',
    saldo: saldo,
    deuda: Number(piloto.Deuda) || 0,
    viajesLibres: Number(piloto.ViajesLibres) || 0,
    ultimosViajes: viajesPiloto.map(v => ({
      fecha: v.Fecha, origen: v.Origen, total: v.Total, gratis: v.Gratis
    }))
  };
}
