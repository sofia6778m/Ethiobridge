import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import LanguageSelector from '../common/LanguageSelector';
import ThemeToggle from '../common/ThemeToggle';
import NotificationBell from '../common/NotificationBell';

export default function DashboardLayout({ children, navItems, title }) {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    toast.success(t('toast.loggedOut'));
    navigate('/');
  };

  const isActive = (path) => {
    if (path === '/dashboard') return location.pathname === path;
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex transition-colors">
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 h-full w-64 bg-white dark:bg-gray-800 border-r border-gray-100 dark:border-gray-700 shadow-sm z-40 flex flex-col transition-transform duration-300
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:static lg:z-auto`}>

        <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="w-9 h-9 rounded-lg bg-primary-600 flex items-center justify-center text-white font-bold text-lg">E</div>
          <Link to="/" className="font-bold text-lg text-primary-700 dark:text-primary-400">EthioBridge</Link>
        </div>

        <div className="px-4 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-700 dark:text-primary-400 font-bold overflow-hidden shrink-0">
              {user?.profileImage
                ? <img src={user.profileImage} alt="" className="w-full h-full object-cover" />
                : user?.fullName?.[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{user?.fullName}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{user?.role}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            // Section header — renders a non-link divider label for visual grouping
            if (item.sectionHeader) {
              return (
                <div key={`header-${item.path}`} className="pt-3 pb-1 px-2">
                  <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                    {item.label}
                  </p>
                </div>
              );
            }
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`sidebar-link ${item.indent ? 'pl-7' : ''} ${isActive(item.path) ? 'active' : ''}`}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="text-sm">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-gray-100 dark:border-gray-700">
          <div className="mb-1">
            <ThemeToggle variant="full" />
          </div>
          <Link to="/" className="sidebar-link mb-1">
            <span>🌐</span><span className="text-sm">{t('nav.publicSite')}</span>
          </Link>
          <button onClick={handleLogout} className="sidebar-link w-full text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20">
            <span>🚪</span><span className="text-sm">{t('nav.logout')}</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-0">
        <header className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-20 transition-colors">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
              <div className="space-y-1">
                <span className="block h-0.5 w-5 bg-gray-700 dark:bg-gray-300" />
                <span className="block h-0.5 w-5 bg-gray-700 dark:bg-gray-300" />
                <span className="block h-0.5 w-5 bg-gray-700 dark:bg-gray-300" />
              </div>
            </button>
            <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{title}</h1>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <ThemeToggle />
            <LanguageSelector variant="dashboard" />
            <span className="text-sm text-gray-500 dark:text-gray-400 hidden sm:block capitalize">{user?.role} {t('dashboard.portalSuffix')}</span>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
