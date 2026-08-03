// Shimmer-style placeholder rows shown only on the very first load, so the
// page never flashes a full error popup while data is being fetched.
export default function ListSkeleton({ rows = 5, className = '' }) {
  return (
    <div className={`card overflow-hidden ${className}`} aria-busy="true" aria-label="Loading list">
      <div className="space-y-3 p-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 animate-pulse">
            <div className="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-3 w-1/3 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-3 w-16 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-6 w-20 rounded-full bg-gray-200 dark:bg-gray-700 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
