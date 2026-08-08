const PDFDocument = require('pdfkit');

// CSV / PDF export helpers for the campaign + donation module. The controllers
// build the file name + headers and call these to produce the payload, matching
// the pattern used by alertController.exportAlerts (CSV via plain string) and
// the complaint export utils (PDF via pdfkit).

const fileStamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

const csvValue = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

// ── Campaigns ────────────────────────────────────────────────────────────────

const CAMPAIGN_CSV_HEADER = [
  'Title', 'Level', 'Category', 'Region', 'Subcity', 'Woreda', 'Status',
  'Goal (ETB)', 'Raised (ETB)', 'In-Kind Pledges', 'Created By', 'Created At', 'End Date',
].join(',');

const campaignRow = (c) =>
  [
    csvValue(c.title),
    c.campaignLevel || '',
    c.category || '',
    csvValue(c.location?.region || ''),
    csvValue(c.location?.subcity || ''),
    csvValue(c.location?.woreda || ''),
    c.status || '',
    c.goalAmount ?? '',
    c.raisedAmount ?? 0,
    c.inKindPledges ?? 0,
    csvValue(c.createdByName || ''),
    c.createdAt ? new Date(c.createdAt).toISOString() : '',
    c.endDate ? new Date(c.endDate).toISOString() : '',
  ].join(',');

const buildCampaignCSV = (campaigns) =>
  [CAMPAIGN_CSV_HEADER, ...campaigns.map(campaignRow)].join('\n');

const buildCampaignPDF = (campaigns, res) => {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="campaigns-${fileStamp()}.pdf"`);
  doc.pipe(res);

  doc.fontSize(18).text('EthioBridge — Campaign Report', { align: 'center' });
  doc.moveDown();

  campaigns.forEach((c, i) => {
    doc.fontSize(11).text(`${i + 1}. ${c.title}  (${c.status})`);
    doc.fontSize(9).text(
      `Level: ${c.campaignLevel}  |  Category: ${c.category}  |  ${c.location?.subcity || ''} / ${c.location?.woreda || ''}`
    );
    doc.fontSize(9).text(`Goal: ETB ${c.goalAmount}  |  Raised: ETB ${c.raisedAmount || 0}  |  In-kind pledges: ${c.inKindPledges || 0}`);
    doc.fontSize(9).text(`Created by: ${c.createdByName || ''}  |  ${c.createdAt ? new Date(c.createdAt).toISOString() : ''}`);
    doc.moveDown(0.6);
  });

  doc.end();
};

// ── Donations ────────────────────────────────────────────────────────────────

const DONATION_CSV_HEADER = [
  'Reference', 'Campaign', 'Type', 'Payment Method', 'Donor Name', 'Donor Phone',
  'Amount (ETB)', 'Items', 'Anonymous', 'Status', 'Donation Date',
].join(',');

const donationRow = (d) =>
  [
    csvValue(d.donationRef),
    csvValue(d.campaignTitle || (d.campaign && d.campaign.title) || ''),
    d.type || '',
    d.paymentMethod || '',
    csvValue(d.isAnonymous ? 'Anonymous' : d.donorName),
    d.isAnonymous ? '' : csvValue(d.donorPhone),
    d.amount ?? '',
    csvValue((d.items || []).map((it) => `${it.name} x${it.quantity}`).join('; ')),
    d.isAnonymous ? 'yes' : 'no',
    d.status || '',
    d.createdAt ? new Date(d.createdAt).toISOString() : '',
  ].join(',');

const buildDonationCSV = (donations) =>
  [DONATION_CSV_HEADER, ...donations.map(donationRow)].join('\n');

const buildDonationPDF = (donations, res) => {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="donations-${fileStamp()}.pdf"`);
  doc.pipe(res);

  doc.fontSize(18).text('EthioBridge — Donations Report', { align: 'center' });
  doc.moveDown();

  donations.forEach((d, i) => {
    doc.fontSize(11).text(`${i + 1}. ${d.donationRef}  (${d.status})`);
    doc.fontSize(9).text(`Campaign: ${d.campaignTitle || (d.campaign && d.campaign.title) || ''}  |  Type: ${d.type}  |  Method: ${d.paymentMethod}`);
    doc.fontSize(9).text(
      d.type === 'money'
        ? `Amount: ETB ${d.amount}`
        : `Items: ${(d.items || []).map((it) => `${it.name} x${it.quantity}`).join('; ') || '—'}`
    );
    doc.fontSize(9).text(`Donor: ${d.isAnonymous ? 'Anonymous' : d.donorName}  |  ${d.createdAt ? new Date(d.createdAt).toISOString() : ''}`);
    doc.moveDown(0.6);
  });

  doc.end();
};

module.exports = {
  fileStamp,
  buildCampaignCSV,
  buildCampaignPDF,
  buildDonationCSV,
  buildDonationPDF,
};
