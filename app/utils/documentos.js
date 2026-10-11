import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';

/**
 * Generacion de documentos: factura en PDF y reportes en PDF y Excel (RF33, RF39).
 */
const VERDE = '#1E7B34';
const GRIS = '#555555';

export const pesos = (v) => '$ ' + Number(v || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const aBuffer = (doc) => new Promise((resolve, reject) => {
  const partes = [];
  doc.on('data', (p) => partes.push(p));
  doc.on('end', () => resolve(Buffer.concat(partes)));
  doc.on('error', reject);
  doc.end();
});

const encabezado = (doc, titulo, subtitulo) => {
  doc.rect(0, 0, doc.page.width, 70).fill(VERDE);
  doc.fillColor('#FFFFFF').fontSize(18).font('Helvetica-Bold').text('AGROSERVICES P&D S.A.S.', 40, 18);
  doc.fontSize(9).font('Helvetica').text('Sistema Integrado de Gestion AGROSERVICES (SIGA) - Madrid, Cundinamarca', 40, 42);
  doc.fillColor('#000000').fontSize(15).font('Helvetica-Bold').text(titulo, 40, 90);
  if (subtitulo) doc.fontSize(9).font('Helvetica').fillColor(GRIS).text(subtitulo, 40, 110);
  doc.fillColor('#000000');
  doc.y = 132;
};

// Tabla simple con salto de pagina
const tabla = (doc, columnas, filas, { x = 40, anchoTotal } = {}) => {
  const ancho = anchoTotal || doc.page.width - 80;
  const pesosCol = columnas.map((c) => c.ancho || 1);
  const suma = pesosCol.reduce((a, b) => a + b, 0);
  const anchos = pesosCol.map((p) => (p / suma) * ancho);
  const fila = (valores, negrita, fondo) => {
    const alturas = valores.map((v, i) => doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
      .heightOfString(String(v ?? ''), { width: anchos[i] - 8 }));
    const alto = Math.max(...alturas) + 8;
    if (doc.y + alto > doc.page.height - 50) { doc.addPage(); doc.y = 40; }
    const y = doc.y;
    if (fondo) doc.rect(x, y, ancho, alto).fill(fondo).fillColor(negrita && fondo === VERDE ? '#FFFFFF' : '#000000');
    let cx = x;
    valores.forEach((v, i) => {
      doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
        .fillColor(negrita && fondo === VERDE ? '#FFFFFF' : '#000000')
        .text(String(v ?? ''), cx + 4, y + 4, { width: anchos[i] - 8, align: columnas[i].alinear || 'left' });
      cx += anchos[i];
    });
    doc.moveTo(x, y + alto).lineTo(x + ancho, y + alto).strokeColor('#DDDDDD').stroke();
    doc.y = y + alto;
  };
  fila(columnas.map((c) => c.titulo), true, VERDE);
  filas.forEach((f, i) => fila(columnas.map((c) => (c.formato ? c.formato(f[c.campo], f) : f[c.campo])), false, i % 2 ? '#F5F8F5' : null));
  doc.fillColor('#000000');
};

export const facturaPDF = (f, detalles, pagos = []) => {
  const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
  encabezado(doc, `Factura de venta ${f.numero_factura}`, `Emitida el ${f.fecha_emision} - Vence el ${f.fecha_vencimiento} - ${f.forma_pago}`);
  doc.fontSize(10).font('Helvetica-Bold').text('Cliente', 40, doc.y);
  doc.font('Helvetica').fontSize(9)
    .text(`${f.nombre_cliente} - NIT/CC ${f.documento}`)
    .text(`${f.direccion || ''} ${f.ciudad || ''}`.trim())
    .text(`${f.email || ''} ${f.telefono ? '- ' + f.telefono : ''}`);
  if (f.numero_contrato) doc.text(`Contrato: ${f.numero_contrato}`);
  doc.moveDown(0.8);
  tabla(doc, [
    { titulo: 'Descripcion', campo: 'descripcion', ancho: 5 },
    { titulo: 'Cantidad', campo: 'cantidad', ancho: 1.2, alinear: 'right' },
    { titulo: 'Valor unitario', campo: 'valor_unitario', ancho: 1.8, alinear: 'right', formato: pesos },
    { titulo: 'Subtotal', campo: 'subtotal', ancho: 1.8, alinear: 'right', formato: pesos }
  ], detalles);
  doc.moveDown(0.6);
  const x = doc.page.width - 240;
  const linea = (et, v, negrita) => {
    const y = doc.y;
    doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).text(et, x, y, { width: 100 });
    doc.text(pesos(v), x + 100, y, { width: 100, align: 'right' });
  };
  linea('Subtotal', f.subtotal);
  linea(`IVA ${Number(f.porcentaje_iva)} %`, f.impuesto_iva);
  linea('Total', f.total, true);
  linea('Saldo', f.saldo, true);
  doc.moveDown(1);
  doc.x = 40;
  doc.font('Helvetica').fontSize(9).fillColor(GRIS).text(`Estado: ${f.estado}${f.observaciones ? ' - ' + f.observaciones : ''}`, 40);
  if (pagos.length) {
    doc.moveDown(0.8).fillColor('#000000').font('Helvetica-Bold').fontSize(10).text('Pagos recibidos', 40);
    tabla(doc, [
      { titulo: 'Fecha', campo: 'fecha_pago', ancho: 1.5 },
      { titulo: 'Medio', campo: 'medio_pago', ancho: 1.5 },
      { titulo: 'Referencia', campo: 'referencia', ancho: 2 },
      { titulo: 'Valor', campo: 'valor', ancho: 1.5, alinear: 'right', formato: pesos }
    ], pagos);
  }
  doc.moveDown(1.5).fontSize(7).fillColor(GRIS)
    .text('Documento generado por SIGA. Representacion grafica de la factura; no reemplaza la factura electronica validada por la DIAN.', 40);
  return aBuffer(doc);
};

// Reporte tabular generico en PDF
export const reportePDF = ({ titulo, subtitulo, columnas, filas, resumen = [] }) => {
  const doc = new PDFDocument({ size: 'LETTER', layout: columnas.length > 6 ? 'landscape' : 'portrait', margin: 40 });
  encabezado(doc, titulo, subtitulo);
  if (resumen.length) {
    resumen.forEach(([et, v]) => doc.font('Helvetica-Bold').fontSize(9).text(`${et}: `, 40, doc.y, { continued: true }).font('Helvetica').text(String(v)));
    doc.moveDown(0.6);
  }
  tabla(doc, columnas, filas);
  doc.moveDown(1).fontSize(7).fillColor(GRIS).text(`Generado por SIGA el ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`, 40);
  return aBuffer(doc);
};

// Reporte tabular generico en Excel
export const reporteExcel = async ({ titulo, subtitulo, columnas, filas, resumen = [] }) => {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'SIGA';
  const hoja = libro.addWorksheet(titulo.slice(0, 30));
  hoja.addRow([titulo]).font = { bold: true, size: 14 };
  if (subtitulo) hoja.addRow([subtitulo]).font = { italic: true, color: { argb: 'FF555555' } };
  resumen.forEach(([et, v]) => hoja.addRow([et, v]));
  hoja.addRow([]);
  const cab = hoja.addRow(columnas.map((c) => c.titulo));
  cab.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E7B34' } };
  });
  filas.forEach((f) => hoja.addRow(columnas.map((c) => {
    const v = f[c.campo];
    return c.numerico && v !== null && v !== undefined ? Number(v) : (v ?? '');
  })));
  columnas.forEach((c, i) => {
    const col = hoja.getColumn(i + 1);
    col.width = Math.max(12, Math.min(45, (c.ancho || 1) * 12));
    if (c.numerico) col.numFmt = c.moneda ? '"$" #,##0' : '#,##0.##';
  });
  return Buffer.from(await libro.xlsx.writeBuffer());
};
