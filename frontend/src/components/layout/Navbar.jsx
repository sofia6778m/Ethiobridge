import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import LanguageSelector from '../common/LanguageSelector';
import ThemeToggle from '../common/ThemeToggle';
import { getRoleDashboard } from '../../utils/roleRoutes';

export default function Navbar() {
  const { isAuthenticated, user, logout } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);

  const navLinks = [
    { to: '/',               label: t('nav.home') },
    { to: '/about',          label: t('nav.about') },
    { to: '/news',           label: t('nav.news') },
    { to: '/campaigns',      label: t('nav.campaigns') },
    { to: '/faq',            label: t('nav.faq') },
    { to: '/contact',        label: t('nav.contact') },
  ];

  const handleLogout = () => {
    logout();
    toast.success(t('toast.loggedOut'));
    navigate('/');
    setDropOpen(false);
  };

  // Single source of truth for the "Dashboard" link — mirrors roleRoutes.js so
  // every role (including subcity_admin / woreda_admin / department_officer)
  // is routed to the dashboard it actually has access to.
  const dashboardPath = getRoleDashboard(user);

  return (
    <nav className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-100 dark:border-gray-700 sticky top-0 z-40 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <div className="w-9 h-9 rounded-lg bg-primary-600 flex items-center justify-center text-white font-bold text-lg">E</div>
            <span className="font-bold text-xl text-primary-700 dark:text-primary-400">EthioBridge</span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden lg:flex items-center gap-1">
            {navLinks.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.to === '/'}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive ? 'text-primary-700 bg-primary-50 dark:text-primary-400 dark:bg-primary-900/30' : 'text-gray-600 hover:text-primary-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:text-primary-400 dark:hover:bg-gray-700'}`
                }>
                {l.label}
              </NavLink>
            ))}
          </div>

          {/* Right side: Theme + Language + Auth */}
          <div className="hidden lg:flex items-center gap-3">
            <ThemeToggle />
            <LanguageSelector variant="navbar" />
            {isAuthenticated ? (
              <div className="relative">
                <button onClick={() => setDropOpen(!dropOpen)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-700 dark:text-primary-400 font-semibold text-sm overflow-hidden">
                    {user?.profileImage
                      ? <img src={user.profileImage} alt="" className="w-full h-full object-cover" />
                      : user?.fullName?.[0]?.toUpperCase()}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100 leading-none">{user?.fullName}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{user?.role}</p>
                  </div>
                  <span className="text-gray-400 text-xs">▼</span>
                </button>
                {dropOpen && (
                  <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 py-1 z-50">
                    <Link to={dashboardPath} onClick={() => setDropOpen(false)} className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">📊 {t('nav.dashboard')}</Link>
                    <Link to={`${dashboardPath}/profile`} onClick={() => setDropOpen(false)} className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">👤 {t('nav.profile')}</Link>
                    <hr className="my-1 border-gray-100 dark:border-gray-700" />
                    <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">🚪 {t('nav.logout')}</button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link to="/login" className="btn-secondary text-sm py-2 px-4">{t('nav.login')}</Link>
                <Link to="/register" className="btn-primary text-sm py-2 px-4">{t('nav.register')}</Link>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <button onClick={() => setMenuOpen(!menuOpen)} className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <div className="space-y-1.5">
              <span className={`block h-0.5 w-6 bg-gray-700 dark:bg-gray-300 transition-transform ${menuOpen ? 'translate-y-2 rotate-45' : ''}`} />
              <span className={`block h-0.5 w-6 bg-gray-700 dark:bg-gray-300 transition-opacity ${menuOpen ? 'opacity-0' : ''}`} />
              <span className={`block h-0.5 w-6 bg-gray-700 dark:bg-gray-300 transition-transform ${menuOpen ? '-translate-y-2 -rotate-45' : ''}`} />
            </div>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="lg:hidden border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 space-y-1">
          {navLinks.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.to === '/'} onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-lg text-sm font-medium ${isActive ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'}`
              }>
              {l.label}
            </NavLink>
          ))}
          <div className="pt-2 border-t border-gray-100 dark:border-gray-700 pb-2 flex items-center justify-between">
            <LanguageSelector variant="navbar" />
            <ThemeToggle />
          </div>
          <div className="flex gap-2 pt-1">
            {isAuthenticated ? (
              <>
                <Link to={dashboardPath} onClick={() => setMenuOpen(false)} className="btn-primary text-sm flex-1 text-center py-2">{t('nav.dashboard')}</Link>
                <button onClick={handleLogout} className="btn-secondary text-sm flex-1 py-2">{t('nav.logout')}</button>
              </>
            ) : (
              <>
                <Link to="/login" onClick={() => setMenuOpen(false)} className="btn-secondary text-sm flex-1 text-center py-2">{t('nav.login')}</Link>
                <Link to="/register" onClick={() => setMenuOpen(false)} className="btn-primary text-sm flex-1 text-center py-2">{t('nav.register')}</Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
