import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';
import EmergencyAlertBanner from '../common/EmergencyAlertBanner';

export default function PublicLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900 transition-colors">
      <Navbar />
      <EmergencyAlertBanner />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
