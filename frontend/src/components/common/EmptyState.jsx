import { useTranslation } from 'react-i18next';

export default function EmptyState({ icon = '📭', title, description }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-5xl mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-1">{title || t('common.noResults')}</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">{description || t('common.nothingToShow')}</p>
    </div>
  );
}
