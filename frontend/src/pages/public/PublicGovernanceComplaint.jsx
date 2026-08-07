import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import GovernanceComplaintForm from '../../components/governance/GovernanceComplaintForm';

export default function PublicGovernanceComplaint() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [submitted, setSubmitted] = useState(null);

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="card text-center animate-fade-in">
          <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">Complaint Submitted Successfully</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            Your complaint has been submitted to the Subcity Governance Office.
          </p>
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-6 py-4 mb-6">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Your Tracking ID</p>
            <p className="text-2xl font-bold text-amber-700 dark:text-amber-300 font-mono">{submitted.trackingId}</p>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
            Save this tracking ID and the phone number you submitted with to check your complaint status. You will also receive SMS updates if you provided contact information.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              to={`/track/governance/${submitted.trackingId}`}
              className="btn-primary py-2.5 px-6 inline-flex items-center gap-2"
            >
              Track Complaint
            </Link>
            <button type="button" onClick={() => navigate('/')} className="btn-secondary py-2.5 px-6">Back to Home</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-700 text-white p-6 sm:p-8 lg:p-10 mb-8">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white rounded-full translate-y-1/2 -translate-x-1/4" />
        </div>
        <div className="relative z-10">
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">Service Public Complaint</h1>
          <p className="text-emerald-100 text-sm sm:text-base max-w-xl">
            Report misconduct, corruption, service delays, or poor service by government offices. Your complaint is investigated by the Subcity Governance Office.
          </p>
          <div className="flex flex-wrap gap-3 mt-4 text-sm">
            <span className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur rounded-full px-3 py-1">
              <span className="w-2 h-2 rounded-full bg-green-400" /> Per-Office Categories
            </span>
            <span className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur rounded-full px-3 py-1">
              <span className="w-2 h-2 rounded-full bg-yellow-400" /> Anonymous Option
            </span>
            <span className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur rounded-full px-3 py-1">
              <span className="w-2 h-2 rounded-full bg-blue-400" /> Subcity Investigation
            </span>
          </div>
        </div>
      </div>

      <div className="mb-5">
        {isAuthenticated ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            You are signed in as <span className="font-medium text-gray-700 dark:text-gray-200">{user?.fullName || user?.email}</span>. Your name and contact details are auto-filled. Prefer to manage complaints from your dashboard?{' '}
            <Link to="/dashboard/citizen/my-complaints" className="text-emerald-600 dark:text-emerald-400 font-medium">Open My Complaints</Link>.
          </p>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            <Link to="/login" className="text-emerald-600 dark:text-emerald-400 font-medium">Sign in</Link> to track your complaints from your dashboard, or continue anonymously below.
          </p>
        )}
      </div>

      <GovernanceComplaintForm
        user={isAuthenticated ? user : null}
        onSuccess={(c) => setSubmitted(c)}
        backLink={<Link to="/" className="btn-secondary">Cancel</Link>}
      />

      <div className="mt-6 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 text-sm text-emerald-700 dark:text-emerald-300">
        <strong>Note:</strong> Complaints are handled by the Subcity Governance Office for the subcity you select. You will receive updates via SMS and can check your status any time with your tracking ID.
      </div>
    </div>
  );
}
