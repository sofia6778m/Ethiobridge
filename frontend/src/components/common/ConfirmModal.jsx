import { useTranslation } from 'react-i18next';

export default function ConfirmModal({ isOpen, title, message, onConfirm, onCancel, confirmLabel, danger = false }) {
  const { t } = useTranslation();
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-2">{title}</h3>
        <p className="text-sm text-gray-600 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="btn-secondary text-sm px-4 py-2">{t('common.cancel')}</button>
          <button
            onClick={onConfirm}
            className={`text-sm px-4 py-2 rounded-lg font-semibold text-white transition-colors ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-primary-600 hover:bg-primary-700'}`}
          >
            {confirmLabel || t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
