import { useTranslation } from 'react-i18next';

export default function LoadingSpinner({ fullPage = false, size = 'md' }) {
  const { t } = useTranslation();
  const sizes = { sm: 'h-4 w-4', md: 'h-8 w-8', lg: 'h-12 w-12' };

  const spinner = (
    <div className={`animate-spin rounded-full border-4 border-primary-200 dark:border-primary-800 border-t-primary-600 dark:border-t-primary-400 ${sizes[size]}`} />
  );

  if (fullPage) {
    return (
      <div className="fixed inset-0 bg-white dark:bg-gray-900 flex items-center justify-center z-50 transition-colors">
        <div className="flex flex-col items-center gap-3">
          {spinner}
          <p className="text-gray-500 dark:text-gray-400 text-sm">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return <div className="flex justify-center py-8">{spinner}</div>;
}
