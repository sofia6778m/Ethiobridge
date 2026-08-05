/**
 * donationCertificates.js
 * ───────────────────────
 * Printable "Certificate of Appreciation" issued to a donor once their
 * donation is verified. Rendered as a landscape A4 PDF with pdfkit and
 * streamed to the client (never persisted).
 */
const PDFDocument = require('pdfkit');

const GOLD = '#C9A227';
const DARK_GREEN = '#14532D';
const INK = '#1F2937';

const buildCertificate = async ({ donation, campaign }) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const W = doc.page.width;
      const H = doc.page.height;

      // Outer border
      doc.rect(18, 18, W - 36, H - 36).lineWidth(3).strokeColor(GOLD).stroke();
      doc.rect(24, 24, W - 48, H - 48).lineWidth(1).strokeColor('#E5E7EB').stroke();

      const donorName = donation.isAnonymous ? 'Anonymous Friend of EthioBridge' : (donation.fullName || donation.donorName || 'Donor');

      // Header
      doc.fontSize(30).font('Helvetica-Bold').fillColor(DARK_GREEN).text('Certificate of Appreciation', 0, 70, { align: 'center', width: W });
      doc.moveDown(0.5);
      doc.fontSize(12).font('Helvetica').fillColor(INK).text('EthioBridge Municipal Service Platform — Ethiopia', { align: 'center', width: W });
      doc.moveDown(2);

      doc.fontSize(14).font('Helvetica').fillColor(INK).text('This certificate is proudly presented to', { align: 'center', width: W });
      doc.moveDown(0.5);
      doc.fontSize(26).font('Helvetica-Bold').fillColor(GOLD).text(donorName, { align: 'center', width: W });
      doc.moveDown(0.5);

      doc.fontSize(14).font('Helvetica').fillColor(INK).text(
        `in recognition of a generous donation of ${Number(donation.amount || 0).toLocaleString()} ETB`,
        { align: 'center', width: W }
      );
      doc.moveDown(0.4);
      doc.fontSize(13).font('Helvetica').fillColor(INK).text(
        `toward "${campaign.title}"`,
        { align: 'center', width: W }
      );
      doc.moveDown(2);

      // Reference block
      const metaY = 360;
      doc.fontSize(11).font('Helvetica-Bold').fillColor(DARK_GREEN).text('Donation Reference', 120, metaY, { width: (W / 2) - 180, align: 'center' });
      doc.font('Helvetica').fillColor(INK).fontSize(12).text(donation.referenceNumber || donation.receiptNumber || '', 120, metaY + 18, { width: (W / 2) - 180, align: 'center' });

      doc.font('Helvetica-Bold').fillColor(DARK_GREEN).fontSize(11).text('Verification Date', (W / 2) + 30, metaY, { width: (W / 2) - 180, align: 'center' });
      doc.font('Helvetica').fillColor(INK).fontSize(12).text(
        donation.verifiedAt ? new Date(donation.verifiedAt).toLocaleDateString() : new Date(donation.createdAt).toLocaleDateString(),
        (W / 2) + 30, metaY + 18, { width: (W / 2) - 180, align: 'center' }
      );

      // Signature line
      doc.moveTo(160, H - 110).lineTo(320, H - 110).strokeColor(INK).lineWidth(1).stroke();
      doc.fontSize(10).font('Helvetica').fillColor(INK).text('Municipal Finance Office', 160, H - 104, { width: 160, align: 'center' });

      doc.moveTo(W - 320, H - 110).lineTo(W - 160, H - 110).stroke();
      doc.text('Chairperson', W - 320, H - 104, { width: 160, align: 'center' });

      doc.fontSize(9).font('Helvetica').fillColor('#9CA3AF').text(
        `Verified donation · EthioBridge · Reference ${donation.referenceNumber || ''} · Thank you for building Ethiopia 🇪🇹`,
        0, H - 40, { align: 'center', width: W }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = { buildCertificate };
