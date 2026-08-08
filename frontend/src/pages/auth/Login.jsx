import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { getRoleDashboard } from '../../utils/roleRoutes';
import ThemeToggle from '../../components/common/ThemeToggle';
import { toast } from 'react-toastify';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const { t } = useTranslation();
  const { login, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form,         setForm]         = useState({ email: '', password: '' });
  const [loading,      setLoading]      = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // error: null | { message, isLockout, retryAfterMinutes }
  const [error, setError] = useState(null);

  // After sign-in, honor a ?return= URL (e.g. /login?return=/campaigns/:id) so
  // users bounce straight back to the page they were on. Only in-app paths are
  // allowed to prevent open redirects.
  const getRedirectTarget = () => {
    const raw = new URLSearchParams(location.search).get('return');
    if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw;
    return null;
  };

  // If the user is already logged in, send them straight to their dashboard
  // (or back to the requested page when a safe ?return= is present).
  useEffect(() => {
    if (isAuthenticated && user) {
      navigate(getRedirectTarget() || getRoleDashboard(user), { replace: true });
    }
  }, [isAuthenticated, user, navigate, location.search]);

  const handleChange = (e) => {
    setForm(p => ({ ...p, [e.target.name]: e.target.value }));
    // Clear inline error as soon as the user edits a field
    if (error) setError(null);
  };

  const validate = () => {
    const email = form.email.trim();
    if (!email) {
      setError({ message: t('login.emailRequired'), isLockout: false });
      return false;
    }
    if (!EMAIL_RE.test(email)) {
      setError({ message: t('login.invalidEmail'), isLockout: false });
      return false;
    }
    if (!form.password) {
      setError({ message: t('login.passwordRequired'), isLockout: false });
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (loading) return;
    setLoading(true);
    setError(null);

    if (!validate()) {
      setLoading(false);
      return;
    }

    try {
      const loggedInUser = await login(form.email.trim(), form.password);

      // ✅ Only one success notification
      toast.success(t('toast.welcomeBack', { name: loggedInUser.fullName }));
      navigate(getRoleDashboard(loggedInUser), { replace: true });

    } catch (err) {
      // Network / server unreachable — err.response is undefined
      if (!err.response) {
        console.error('[LOGIN] Network or server error:', err?.message);
        setError({ message: t('login.networkError'), isLockout: false });
        return;
      }

      const data              = err.response.data;
      const msg               = data?.message || t('toast.loginFailed');
      const isLockout         = err.response.status === 429;
      const retryAfterMinutes = data?.retryAfterMinutes ?? null;

      console.warn('[LOGIN] Authentication rejected:', err.response.status, data?.message);
      // ❌ Show ONLY the inline banner — no toast — to prevent duplicates
      setError({
        message: msg,
        isLockout,
        retryAfterMinutes,
        isDeactivated: /deactivated/i.test(msg),
      });

    } finally {
      setLoading(false);
    }
  };

  const isLocked = error?.isLockout === true;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-primary-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center px-3 sm:px-4 py-8 sm:py-12 transition-colors overflow-y-auto">
      <div className="w-full max-w-sm sm:max-w-md mx-auto">

        <div className="fixed top-3 right-3 sm:top-4 sm:right-4 z-50">
          <ThemeToggle />
        </div>

        {/* Logo + heading */}
        <div className="text-center mb-6 sm:mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-3 sm:mb-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-primary-600 flex items-center justify-center text-white font-bold text-xl sm:text-2xl">E</div>
            <span className="font-bold text-xl sm:text-2xl text-primary-700 dark:text-primary-400">EthioBridge</span>
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{t('login.welcome')}</h1>
          <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 mt-1">{t('login.subtitle')}</p>
        </div>

        <div className="card shadow-lg p-5 sm:p-6">

          {/* ── Inline error / lockout / deactivated banner ─────────────────── */}
          {error && (
            <div className={`mb-4 p-3 rounded-lg border text-sm flex items-start gap-2 ${
              isLocked
                ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-300'
                : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
            }`}>
              <span className="text-base shrink-0 mt-0.5">{isLocked ? '🔒' : '⚠️'}</span>
              <div>
                <p className="font-medium leading-snug">{error.message}</p>
                {isLocked && error.retryAfterMinutes != null && (
                  <p className="mt-1 text-xs opacity-80">
                    You can try again in{' '}
                    <strong>{error.retryAfterMinutes} minute{error.retryAfterMinutes !== 1 ? 's' : ''}</strong>.
                    No page refresh needed — just wait, then enter your password again.
                  </p>
                )}
                {error.isDeactivated && (
                  <p className="mt-1 text-xs opacity-80">
                    This account has been deactivated by an administrator. If you are the system
                    administrator, contact your technical team or use the recovery process to
                    reactivate it.
                  </p>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4 sm:space-y-5">

            {/* Email */}
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('login.emailLabel')}
              </label>
              <input
                id="login-email" name="email" type="email" required autoComplete="email"
                value={form.email} onChange={handleChange} disabled={loading}
                className="input-field text-sm sm:text-base disabled:opacity-60"
                placeholder={t('login.emailPlaceholder')}
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('login.passwordLabel')}
              </label>
              <div className="relative">
                <input
                  id="login-password" name="password" type={showPassword ? 'text' : 'password'} required autoComplete="current-password"
                  value={form.password} onChange={handleChange} disabled={loading}
                  className="input-field pr-10 text-sm sm:text-base disabled:opacity-60"
                  placeholder={t('login.passwordPlaceholder')}
                />
                <button type="button" onClick={() => setShowPassword(p => !p)} disabled={loading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg">
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || isLocked}
              className="btn-primary w-full py-2.5 sm:py-3 text-sm sm:text-base font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {t('login.signingIn')}
                </span>
              ) : isLocked ? (
                `🔒 Locked — try again in ${error.retryAfterMinutes} min`
              ) : (
                t('login.signIn')
              )}
            </button>

          </form>

          <div className="mt-5 sm:mt-6 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('login.noAccount')}{' '}
              <Link to="/register" className="text-primary-600 dark:text-primary-400 font-medium hover:underline">
                {t('login.registerHere')}
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-4 text-center">
          <Link to="/" className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            {t('login.backToHome')}
          </Link>
        </div>

      </div>
    </div>
  );
}
