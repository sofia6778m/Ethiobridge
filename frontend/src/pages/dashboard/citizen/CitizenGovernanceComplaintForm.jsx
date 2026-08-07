import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { notifyComplaintsChanged } from '../../../services/complaintService';
import GovernanceComplaintForm from '../../../components/governance/GovernanceComplaintForm';

export default function CitizenGovernanceComplaintForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [submitted, setSubmitted] = useState(null);

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="card text-center animate-fade-in">
          <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">Complaint Submitted Successfully</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            Your public complaint has been submitted to the Subcity Governance Office.
          </p>
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-6 py-4 mb-6">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Your Tracking ID</p>
            <p className="text-2xl font-bold text-amber-700 dark:text-amber-300 font-mono">{submitted.trackingId}</p>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
            Save this tracking ID and the phone number you submitted with to check your complaint status. You will also receive SMS updates if you provided contact information.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/dashboard/citizen/my-complaints" className="btn-primary py-2.5 px-6">
              Go to My Complaints
            </Link>
            <button type="button" onClick={() => navigate('/dashboard/citizen')} className="btn-secondary py-2.5 px-6">
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-5">
        <Link
          to="/dashboard/citizen/create-report"
          className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-3 transition-colors"
        >
          ← Back to report types
        </Link>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Signed in as <span className="font-medium text-gray-700 dark:text-gray-200">{user?.fullName || user?.email}</span>. Your name and contact details are auto-filled — edit them if needed.
        </p>
      </div>

      <GovernanceComplaintForm
        user={user}
        onSuccess={(c) => { notifyComplaintsChanged(); setSubmitted(c); }}
        backLink={<Link to="/dashboard/citizen/create-report" className="btn-secondary">Cancel</Link>}
      />
    </div>
  );
}
