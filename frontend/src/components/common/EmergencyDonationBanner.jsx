import { Link } from 'react-router-dom';
import { FaFire, FaHeart } from 'react-icons/fa';

/**
 * EmergencyDonationBanner
 * ───────────────────────
 * High-visibility red banner shown for urgent public issues / emergency
 * campaigns. Rendered on the donation landing page when active emergency
 * campaigns exist.
 */
export default function EmergencyDonationBanner({ campaigns = [] }) {
  if (!campaigns || campaigns.length === 0) return null;
  const primary = campaigns[0];

  return (
    <section className="bg-gradient-to-r from-red-600 via-red-700 to-red-800 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="shrink-0 w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <FaFire className="text-xl" />
          </span>
          <div className="min-w-0">
            <p className="font-bold text-sm sm:text-base truncate">🚨 Urgent: {primary.title}</p>
            <p className="text-xs text-red-100 truncate">
              {primary.raisedAmount?.toLocaleString()} ETB raised of {primary.goalAmount?.toLocaleString()} ETB goal
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to={`/donate/new?campaign=${primary._id}`}
            className="inline-flex items-center gap-2 bg-white text-red-700 hover:bg-red-50 font-bold text-sm py-2 px-5 rounded-xl shadow-lg transition-all active:scale-95"
          >
            <FaHeart /> Donate Now
          </Link>
          <Link
            to={`/fundraising/${primary._id}`}
            className="text-sm text-red-100 hover:text-white font-medium underline underline-offset-2"
          >
            Learn more
          </Link>
        </div>
      </div>
    </section>
  );
}
