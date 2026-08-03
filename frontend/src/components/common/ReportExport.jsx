import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { infraAPI } from '../../services/api';
import { toast } from 'react-toastify';

export default function ReportExport({ filters = {}, reportId = null }) {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const downloadBlob = (response, defaultName) => {
    const contentDisposition = response.headers?.['content-disposition'];
    let filename = defaultName;
    if (contentDisposition) {
      const match = contentDisposition.match(/filename=([^;]+)/);
      if (match) filename = match[1].replace(/"/g, '');
    }
    const blob = new Blob([response.data]);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleExport = async (format) => {
    setExporting(true);
    setShowMenu(false);
    try {
      if (format === 'pdf-single' && reportId) {
        const response = await infraAPI.exportPDF(reportId);
        downloadBlob(response, `report-${reportId}.pdf`);
      } else if (format === 'pdf') {
        const response = await infraAPI.exportBulkPDF(filters);
        downloadBlob(response, `reports-bulk-${Date.now()}.pdf`);
      } else if (format === 'excel') {
        const response = await infraAPI.exportExcel(filters);
        downloadBlob(response, `reports-${Date.now()}.xls`);
      } else if (format === 'csv') {
        const params = { format: 'csv', ...filters };
        const response = await infraAPI.export(params);
        const blob = new Blob([response.data], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reports-${Date.now()}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
      } else if (format === 'json') {
        const params = { format: 'json', ...filters };
        const response = await infraAPI.export(params);
        const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reports-${Date.now()}.json`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
      toast.success(t('dashboard.exportSuccess') || 'Export downloaded successfully');
    } catch (err) {
      toast.error(t('dashboard.exportFailed') || 'Export failed');
    } finally { setExporting(false); }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        disabled={exporting}
        className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1"
      >
        {exporting ? (
          <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <span>📥</span>
        )}
        {t('dashboard.export') || 'Export'}
      </button>

      {showMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 py-1 min-w-[180px]">
            {reportId && (
              <button onClick={() => handleExport('pdf-single')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
                <span>📄</span> PDF (This Report)
              </button>
            )}
            <button onClick={() => handleExport('pdf')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
              <span>📑</span> PDF (All Filtered)
            </button>
            <button onClick={() => handleExport('excel')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
              <span>📊</span> Excel (.xls)
            </button>
            <button onClick={() => handleExport('csv')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
              <span>📄</span> CSV
            </button>
            <button onClick={() => handleExport('json')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
              <span>📋</span> JSON
            </button>
          </div>
        </>
      )}
    </div>
  );
}
