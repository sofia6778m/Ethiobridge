import { useTranslation } from 'react-i18next';

export default function Pagination({ page, pages, onPageChange }) {
  const { t } = useTranslation();
  if (pages <= 1) return null;

  const range = [];
  for (let i = 1; i <= pages; i++) range.push(i);

  return (
    <div className="flex items-center justify-center gap-1 mt-6">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
      >
        {t('common.previous')}
      </button>
      {range.map((p) => (
        <button
          key={p}
          onClick={() => onPageChange(p)}
          className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
            p === page
              ? 'bg-primary-600 text-white'
              : 'border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}
        >
          {p}
        </button>
      ))}
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page === pages}
        className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
      >
        {t('common.next')}
      </button>
    </div>
  );
}
