import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import InfrastructureReportForm from '../../components/public/InfrastructureReportForm';

export default function PublicInfrastructureReport() {
  const navigate = useNavigate();
  const [submitted, setSubmitted] = useState(null);

  if (submitted) {
    const trackingId = submitted.reportId || submitted.report?.reportId || '';
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <div className="card text-center animate-fade-in">
          <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">Report Submitted Successfully</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            Your infrastructure report has been received and routed to the responsible department.
          </p>
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl px-6 py-4 mb-6">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Your Tracking ID</p>
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-300 font-mono tracking-wider">{trackingId}</p>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
            Save this tracking ID to check your report status. Anonymous submissions can only be tracked with this ID.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/track-report" className="btn-primary py-2.5 px-6 inline-flex items-center gap-2">
              Track Report
            </Link>
            <button type="button" onClick={() => navigate('/')} className="btn-secondary py-2.5 px-6">Back to Home</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 text-white p-6 sm:p-8 lg:p-10 mb-8">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white rounded-full translate-y-1/2 -translate-x-1/4" />
        </div>
        <div className="relative z-10">
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">Infrastructure Report</h1>
          <p className="text-blue-100 text-sm sm:text-base max-w-xl">
            Report damaged roads, bridges, water supply, electricity, drainage, schools, hospitals, and other public infrastructure. No account needed.
          </p>
          <div className="flex flex-wrap gap-3 mt-4 text-sm">
            <span className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur rounded-full px-3 py-1">
              <span className="w-2 h-2 rounded-full bg-green-400" /> Anonymous Submission
            </span>
            <span className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur rounded-full px-3 py-1">
              <span className="w-2 h-2 rounded-full bg-yellow-400" /> Free Tracking ID
            </span>
            <span className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur rounded-full px-3 py-1">
              <span className="w-2 h-2 rounded-full bg-blue-400" /> Routed to the Responsible Office
            </span>
          </div>
        </div>
      </div>

      <div className="mb-5">
        <Link to="/report" className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-3 transition-colors">
          ← Back to report types
        </Link>
      </div>

      <InfrastructureReportForm
        onClose={() => navigate('/report')}
        onSuccess={(data) => setSubmitted(data)}
      />

      <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-sm text-blue-700 dark:text-blue-300">
        <strong>Note:</strong> Reports are reviewed by administrators before being published. You can check progress any time with your tracking ID on the{' '}
        <Link to="/track-report" className="font-semibold underline">track report</Link> page.
      </div>
    </div>
  );
}
