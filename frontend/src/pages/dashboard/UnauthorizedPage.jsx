import { useNavigate } from 'react-router-dom';

// Friendly fallback shown when an authenticated user has no dashboard for their
// role (or hits a dashboard they are not allowed to see). No scary "Access
// Denied" toast — just clear actions to recover.
export default function UnauthorizedPage() {
  const navigate = useNavigate();

  const goHome = () => {
    navigate('/');
  };

  const goToLogin = () => {
    window.location.href = '/login';
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          You don&apos;t have access to this dashboard
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Your account role isn&apos;t set up for this section yet. Please sign in again or
          contact your administrator if you believe this is a mistake.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={goHome}
            className="btn-primary px-5 py-2 text-sm font-semibold"
          >
            Go to Home
          </button>
          <button
            type="button"
            onClick={goToLogin}
            className="btn-secondary px-5 py-2 text-sm font-semibold"
          >
            Sign In Again
          </button>
        </div>
      </div>
    </div>
  );
}
