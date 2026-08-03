import { useTheme } from '../../context/ThemeContext';

export default function ThemeToggle({ variant = 'icon' }) {
  const { dark, toggle } = useTheme();

  if (variant === 'full') {
    return (
      <button onClick={toggle}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
        aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
        <span className="text-lg">{dark ? '☀️' : '🌙'}</span>
        <span>{dark ? 'Light' : 'Dark'}</span>
      </button>
    );
  }

  return (
    <button onClick={toggle}
      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
      <span className="text-lg">{dark ? '☀️' : '🌙'}</span>
    </button>
  );
}
