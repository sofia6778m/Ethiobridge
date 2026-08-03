import { useState } from 'react';
import WorkflowReportList from '../../../../components/workflow/WorkflowReportList';
import WorkflowReportDetail from '../../../../components/workflow/WorkflowReportDetail';

export default function ResolvedReports() {
  const [selectedReport, setSelectedReport] = useState(null);

  if (selectedReport) {
    return <WorkflowReportDetail reportId={selectedReport} onBack={() => setSelectedReport(null)} />;
  }

  return <WorkflowReportList view="resolved" title="Resolved Reports" onSelectReport={setSelectedReport} />;
}
