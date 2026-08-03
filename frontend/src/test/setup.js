import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Shared components use react-i18next; keep translations inert in tests.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}));

// jsdom does not implement matchMedia, used by some UI components.
if (typeof window !== 'undefined' && typeof window.matchMedia === 'undefined') {
  window.matchMedia = () => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
  });
}

// jsdom does not implement object URLs, used by the download helper.
if (typeof window !== 'undefined') {
  if (!URL.createObjectURL) {
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  }
  if (!URL.revokeObjectURL) {
    URL.revokeObjectURL = vi.fn();
  }
}
