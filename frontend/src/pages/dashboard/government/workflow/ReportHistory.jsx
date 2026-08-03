import { useState } from 'react';
import WorkflowReportList from '../../../../components/workflow/WorkflowReportList';
import WorkflowReportDetail from '../../../../components/workflow/WorkflowReportDetail';

export default function ReportHistory() {
  const [selectedReport, setSelectedReport] = useState(null);

  if (selectedReport) {
    return <WorkflowReportDetail reportId={selectedReport} onBack={() => setSelectedReport(null)} />;
  }

  return <WorkflowReportList view="history" title="Report History" onSelectReport={setSelectedReport} />;
}
