/**
 * donationExport.js
 * ─────────────────
 * CSV, Excel (SpreadsheetML) and PDF export of donation records for the admin
 * and local-government (subcity / woreda) dashboards. CSV and Excel are plain
 * text streams usable in Excel / LibreOffice; PDF is rendered with pdfkit.
 */
const PDFDocument = require('pdfkit');

const escapeXml = (str) =>
  String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const csvCell = (value) => {
  const str = String(value ?? '');
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
};

const donationRow = (d) => ({
  reference: d.referenceNumber || d.receiptNumber || '',
  donor: d.isAnonymous ? 'Anonymous' : (d.fullName || d.donorName || ''),
  phone: d.phone || '',
  email: d.email || d.donorEmail || '',
  amount: d.amount ?? 0,
  currency: d.currency || 'ETB',
  campaign: d.campaign?.title || (typeof d.campaign === 'string' ? d.campaign : ''),
  paymentMethod: d.paymentMethodName || d.paymentMethod || '',
  verificationStatus: d.verificationStatus || '',
  paymentStatus: d.paymentStatus || '',
  rejectionReason: d.rejectionReason || '',
  createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : '',
  verifiedAt: d.verifiedAt ? new Date(d.verifiedAt).toISOString() : '',
});

const donationsToCsv = (donations) => {
  const headers = ['Reference', 'Donor', 'Phone', 'Email', 'Amount', 'Currency', 'Campaign', 'Payment Method', 'Verification Status', 'Payment Status', 'Rejection Reason', 'Submitted At', 'Verified At'];
  const rows = [headers.join(',')];
  for (const d of donations) {
    const r = donationRow(d);
    rows.push([r.reference, r.donor, r.phone, r.email, r.amount, r.currency, r.campaign, r.paymentMethod, r.verificationStatus, r.paymentStatus, r.rejectionReason, r.createdAt, r.verifiedAt].map(csvCell).join(','));
  }
  return rows.join('\r\n');
};

const donationsToExcel = (donations) => {
  const headers = ['Reference', 'Donor', 'Phone', 'Email', 'Amount', 'Currency', 'Campaign', 'Payment Method', 'Verification Status', 'Payment Status', 'Rejection Reason', 'Submitted At', 'Verified At'];
  const headerRow = headers.map((h) => `<Cell><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`).join('');
  const body = donations.map((d) => {
    const r = donationRow(d);
    const cells = [r.reference, r.donor, r.phone, r.email, r.amount, r.currency, r.campaign, r.paymentMethod, r.verificationStatus, r.paymentStatus, r.rejectionReason, r.createdAt, r.verifiedAt]
      .map((v) => `<Cell><Data ss:Type="${typeof v === 'number' ? 'Number' : 'String'}">${escapeXml(v)}</Data></Cell>`)
      .join('');
    return `<Row>${cells}</Row>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Donations">
  <Table>
   <Row>${headerRow}</Row>
   ${body}
  </Table>
 </Worksheet>
</Workbook>`;
};

// ── PDF report (portrait A4 table via pdfkit) ─────────────────────────────────
const donationsToPdf = async (donations, { title = 'Donation Report' } = {}) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - 80;
      const colWidths = [105, 110, 90, 100, 80, 55];
      const lefts = [];
      let x = 40;
      for (const w of colWidths) { lefts.push(x); x += w; }
      const colCenter = (i, text) => {
        const w = colWidths[i];
        const tw = doc.widthOfString(text);
        return lefts[i] + Math.max(0, (w - tw) / 2);
      };

      doc.font('Helvetica-Bold').fontSize(18).fillColor('#14532D').text(title, { align: 'center' });
      doc.font('Helvetica').fontSize(10).fillColor('#4B5563')
        .text(`EthioBridge Municipal Platform — Generated ${new Date().toLocaleString()}`, { align: 'center' });
      doc.moveDown(0.6);

      if (donations.length === 0) {
        doc.font('Helvetica').fontSize(12).fillColor('#6B7280').text('No donations found.', { align: 'center' });
        doc.end();
        return;
      }

      const headers = ['Reference', 'Donor', 'Phone', 'Amount (ETB)', 'Campaign', 'Status'];
      const rowHeight = 20;
      const headerY = doc.y;

      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#FFFFFF');
      for (let i = 0; i < headers.length; i++) {
        doc.rect(lefts[i], headerY - 4, colWidths[i], rowHeight).fill('#14532D');
      }
      for (let i = 0; i < headers.length; i++) {
        doc.fillColor('#FFFFFF').text(headers[i], colCenter(i, headers[i]), headerY);
      }

      doc.font('Helvetica').fontSize(8).fillColor('#111827');
      let rowIndex = 0;
      for (const d of donations) {
        if (doc.y > doc.page.height - 70) {
          doc.addPage();
        }
        const values = [
          d.referenceNumber || d.receiptNumber || '',
          d.isAnonymous ? 'Anonymous' : (d.fullName || d.donorName || ''),
          d.phone || '',
          String(Number(d.amount ?? 0).toLocaleString()),
          d.campaign?.title || (typeof d.campaign === 'string' ? d.campaign : ''),
          d.verificationStatus || d.paymentStatus || '',
        ];
        const y = doc.y;
        const bg = rowIndex % 2 === 0 ? '#F9FAFB' : '#FFFFFF';
        doc.rect(40, y - 2, pageWidth, rowHeight).fill(bg);
        for (let i = 0; i < values.length; i++) {
          doc.fillColor('#111827').text(String(values[i]).slice(0, 40), colCenter(i, values[i].slice(0, 40)), y, { width: colWidths[i], lineBreak: false });
        }
        doc.moveDown();
        rowIndex++;
      }

      const total = donations.reduce((s, d) => s + (d.amount ?? 0), 0);
      doc.moveDown();
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#14532D')
        .text(`Total: ${Number(total).toLocaleString()} ETB (${donations.length} donation(s))`, { align: 'right' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = { donationsToCsv, donationsToExcel, donationsToPdf };
