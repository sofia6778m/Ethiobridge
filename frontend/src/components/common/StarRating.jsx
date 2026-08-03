
import { useState } from 'react';

export default function StarRating({ rating = 0, onRate, readonly = false, size = 'md' }) {
  const [hovered, setHovered] = useState(0);

  const sizes = { sm: 'text-lg', md: 'text-2xl', lg: 'text-3xl' };
  const sizeClass = sizes[size] || sizes.md;

  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          onClick={() => onRate?.(star)}
          onMouseEnter={() => !readonly && setHovered(star)}
          onMouseLeave={() => !readonly && setHovered(0)}
          className={`${sizeClass} transition-colors ${readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110'}`}
        >
          <span className={(hovered || rating) >= star ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600'}>
            {(hovered || rating) >= star ? '★' : '☆'}
          </span>
        </button>
      ))}
      {rating > 0 && <span className="ml-2 text-sm text-gray-500 self-center">{rating}/5</span>}
    </div>
  );
}
