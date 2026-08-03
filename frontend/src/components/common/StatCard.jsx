const darkMap = {
  'bg-blue-100': 'dark:bg-blue-900/30', 'bg-purple-100': 'dark:bg-purple-900/30',
  'bg-yellow-100': 'dark:bg-yellow-900/30', 'bg-teal-100': 'dark:bg-teal-900/30',
  'bg-pink-100': 'dark:bg-pink-900/30', 'bg-orange-100': 'dark:bg-orange-900/30',
  'bg-green-100': 'dark:bg-green-900/30', 'bg-red-100': 'dark:bg-red-900/30',
  'bg-primary-100': 'dark:bg-primary-900/30',
};
const iconDarkMap = {
  'text-blue-600': 'dark:text-blue-400', 'text-purple-600': 'dark:text-purple-400',
  'text-yellow-600': 'dark:text-yellow-400', 'text-teal-600': 'dark:text-teal-400',
  'text-pink-600': 'dark:text-pink-400', 'text-orange-600': 'dark:text-orange-400',
  'text-green-600': 'dark:text-green-400', 'text-red-600': 'dark:text-red-400',
  'text-primary-600': 'dark:text-primary-400',
};

export default function StatCard({ icon, label, value, color = 'bg-primary-100', iconColor = 'text-primary-600', trend }) {
  const darkBg = darkMap[color] || '';
  const darkIcon = iconDarkMap[iconColor] || '';
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 ${color} ${darkBg}`}>
        <span className={`${iconColor} ${darkIcon}`}>{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{value ?? '—'}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{label}</p>
        {trend && <p className={`text-xs font-medium mt-0.5 ${trend > 0 ? 'text-green-600' : 'text-red-500'}`}>{trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%</p>}
      </div>
    </div>
  );
}
