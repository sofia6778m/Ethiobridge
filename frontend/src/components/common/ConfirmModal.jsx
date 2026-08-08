// Reusable confirmation dialog. Replaces window.confirm everywhere so
// destructive actions (e.g. deleting an alert) require an explicit,
// style-consistent confirmation.
export default function ConfirmModal({
  open,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  const confirmStyles =
    tone === 'danger'
      ? 'bg-red-600 hover:bg-red-700'
      : 'bg-primary-600 hover:bg-primary-700';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-start gap-3">
            <span className="text-2xl shrink-0 mt-0.5">⚠️</span>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{title}</h3>
              {message && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">{message}</p>
              )}
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="btn-secondary text-sm py-2 px-4 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`${confirmStyles} text-white font-semibold text-sm py-2 px-4 rounded-lg transition-colors disabled:opacity-50 inline-flex items-center gap-2`}
          >
            {loading && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {loading ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
