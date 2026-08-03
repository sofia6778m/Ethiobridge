// Small inline indicator used during background refreshes — keeps the existing
// data on screen while quietly letting the user know new data is being fetched.
export default function InlineLoader({ text = 'Refreshing…' }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400" role="status">
      <span className="w-3.5 h-3.5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      {text}
    </span>
  );
}
