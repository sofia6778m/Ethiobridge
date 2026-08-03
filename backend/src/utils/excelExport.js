const generateExcelXML = (reports) => {
  const header = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Infrastructure Reports">
  <Table>
   <Row>
    <Cell><Data ss:Type="String">Report ID</Data></Cell>
    <Cell><Data ss:Type="String">Title</Data></Cell>
    <Cell><Data ss:Type="String">Category</Data></Cell>
    <Cell><Data ss:Type="String">Severity</Data></Cell>
    <Cell><Data ss:Type="String">Status</Data></Cell>
    <Cell><Data ss:Type="String">Region</Data></Cell>
    <Cell><Data ss:Type="String">Zone</Data></Cell>
    <Cell><Data ss:Type="String">Woreda</Data></Cell>
    <Cell><Data ss:Type="String">Kebele</Data></Cell>
    <Cell><Data ss:Type="String">Submitted By</Data></Cell>
    <Cell><Data ss:Type="String">Assigned To</Data></Cell>
    <Cell><Data ss:Type="String">Organization</Data></Cell>
    <Cell><Data ss:Type="String">Date Reported</Data></Cell>
    <Cell><Data ss:Type="String">Resolved Date</Data></Cell>
    <Cell><Data ss:Type="String">Rating</Data></Cell>
   </Row>`;

  const rows = reports.map(r => `
   <Row>
    <Cell><Data ss:Type="String">${escapeXml(r.reportId || '')}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(r.title || '')}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(r.category || '')}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(r.severityLevel || '')}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(r.status || '')}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(r.region || '')}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(r.zone || '')}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(r.woreda || '')}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(r.kebele || '')}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(r.submittedBy?.fullName || '')}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(r.assignedTo?.fullName || '')}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(r.autoAssignedOrganization || '')}</Data></Cell>
    <Cell><Data ss:Type="String">${r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''}</Data></Cell>
    <Cell><Data ss:Type="String">${r.resolvedAt ? new Date(r.resolvedAt).toLocaleDateString() : ''}</Data></Cell>
    <Cell><Data ss:Type="String">${r.rating || ''}</Data></Cell>
   </Row>`).join('');

  const footer = `
  </Table>
 </Worksheet>
</Workbook>`;

  return header + rows + footer;
};

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

module.exports = { generateExcelXML };
