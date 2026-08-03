import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { workflowAPI } from '../../services/api';

export default function ResolveModal({ report, isOpen, onClose, onSuccess, isFederal = false }) {
  const { t } = useTranslation();
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const actionLabel = isFederal ? 'Close Case' : 'Resolve Report';
  const description = isFederal
    ? 'This will permanently close the case. This action cannot be undone.'
    : 'Mark this report as resolved at your administrative level.';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (isFederal) {
        await workflowAPI.closeCase(report._id, { comment });
      } else {
        await workflowAPI.resolveReport(report._id, { comment });
      }
      toast.success(isFederal ? 'Case closed successfully' : 'Report resolved successfully');
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to ${isFederal ? 'close' : 'resolve'}`);
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className={`px-6 py-4 border-b border-gray-100 dark:border-gray-700 ${isFederal ? 'bg-red-50 dark:bg-red-900/20' : 'bg-green-50 dark:bg-green-900/20'} rounded-t-2xl`}>
          <h3 className={`text-lg font-semibold ${isFederal ? 'text-red-800 dark:text-red-300' : 'text-green-800 dark:text-green-300'}`}>
            {actionLabel}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{description}</p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {isFederal ? 'Closing Notes' : 'Resolution Notes'} *
            </label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={4}
              className="input-field text-sm"
              placeholder={isFederal ? 'Provide final closing notes...' : 'Describe how the issue was resolved...'}
              required
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={submitting || !comment.trim()}
              className={`flex-1 font-semibold py-2 px-4 rounded-lg text-white ${isFederal ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'} disabled:opacity-50`}>
              {submitting ? 'Processing...' : actionLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
