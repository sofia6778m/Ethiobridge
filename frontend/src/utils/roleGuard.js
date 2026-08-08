import { useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';

// Roles that may perform citizen-only actions (donate, save, report, pledge).
// Mirrors CITIZEN_ROLES in backend/src/routes/campaignRoutes.js and
// backend/src/routes/donationRoutes.js.
export const CITIZEN_ROLES = ['citizen', 'CITIZEN'];

export const isCitizenRole = (role) => CITIZEN_ROLES.includes(role);

// Build the login URL that bounces back to `returnPath` after sign-in.
// Guards against open redirects: only in-app absolute paths are allowed.
export const buildLoginUrl = (returnPath) => {
  const safe =
    typeof returnPath === 'string' &&
    returnPath.startsWith('/') &&
    !returnPath.startsWith('//')
      ? returnPath
      : '/';
  return `/login?return=${encodeURIComponent(safe)}`;
};

// Reusable guard for citizen-only actions. Returns true only when the current
// user may proceed; otherwise it redirects (guests) or shows a friendly toast
// (staff roles) and returns false so the protected API call never happens.
//
//   const requireCitizen = useCitizenGuard();
//   const onDonate = () => {
//     if (requireCitizen({ message: t('campaign.citizenDonateOnly') })) openModal();
//   };
export function useCitizenGuard() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  return useCallback((opts = {}) => {
    if (!isAuthenticated || !user) {
      const returnPath = opts.returnUrl || `${location.pathname}${location.search}`;
      navigate(buildLoginUrl(returnPath));
      return false;
    }
    if (!isCitizenRole(user.role)) {
      toast.info(opts.message || t('campaign.citizenOnlyAction'));
      return false;
    }
    return true;
  }, [isAuthenticated, user, navigate, location.pathname, location.search, t]);
}
