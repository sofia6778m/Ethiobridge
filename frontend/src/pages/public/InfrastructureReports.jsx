import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { infraAPI } from '../../services/api';
import InfrastructureReportForm from '../../components/public/InfrastructureReportForm';
import ReportCard from '../../components/common/ReportCard';
import SearchFilter from '../../components/common/SearchFilter';
import Pagination from '../../components/common/Pagination';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import EthioMap from '../../components/map/EthioMap';

const REGIONS = [
  'Addis Ababa','Oromia','Amhara','Tigray','Somali','Afar','Sidama',
  'Central Ethiopia','South Ethiopia','Southwest Ethiopia','Gambella',
  'Benishangul-Gumuz','Harari','Dire Dawa',
];

const CATEGORIES = [
  { value: 'road_issue',         label: 'Road Issue',         icon: '🛣️', color: 'orange' },
  { value: 'electricity_issue',  label: 'Electricity Issue',  icon: '⚡', color: 'yellow' },
  { value: 'water_supply_issue', label: 'Water Supply Issue', icon: '💧', color: 'blue' },
];

export default function InfrastructureReports() {
  const { t } = useTranslation();

  const FILTER_CATEGORIES = CATEGORIES.map(c => ({ value: c.value, label: c.label }));
  const FILTER_STATUSES = [
    { value: 'Under Review', label: t('dashboard.statusUnderReview', 'Under Review') },
    { value: 'In Progress',  label: t('dashboard.statusInProgress', 'In Progress') },
    { value: 'Resolved',     label: t('dashboard.statusResolved', 'Resolved') },
  ];

  const [showForm, setShowForm] = useState(false);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ category: '', region: '', status: '' });
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [mapMarkers, setMapMarkers] = useState([]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const res = await infraAPI.getPublic({ search, ...filters, page, limit: 9 });
      const fetched = res.data?.reports || [];
      setReports(fetched);
      setPages(res.data?.pages || 1);
      setTotal(res.data?.total || 0);
      setMapMarkers(
        fetched
          .filter(r => r?.latitude && r?.longitude)
          .map(r => ({ ...r, latitude: Number(r.latitude), longitude: Number(r.longitude), type: 'infrastructure' }))
      );
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchReports(); }, [search, filters, page]);

  const handleFilterChange = (name, value) => { setFilters(p => ({ ...p, [name]: value })); setPage(1); };

  const toggleForm = () => setShowForm(p => !p);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 text-white p-6 sm:p-8 lg:p-10 mb-8">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white rounded-full translate-y-1/2 -translate-x-1/4" />
        </div>
        <div className="relative z-10">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold mb-2">{t('infra.title', 'Infrastructure Reports')}</h1>
              <p className="text-primary-100 text-sm sm:text-base max-w-xl">
                {t('infra.desc', 'Browse community-reported infrastructure issues or submit a new report to help improve your area.')}
              </p>
            </div>
            <button
              onClick={toggleForm}
              className="inline-flex items-center gap-2 bg-white text-primary-700 hover:bg-primary-50 font-semibold py-3 px-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 shrink-0"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              {showForm ? t('infra.hideForm', 'Hide Form') : t('infra.submitReport', 'Submit Report')}
            </button>
          </div>
          <div className="flex flex-wrap gap-3 mt-4 text-sm">
            <span className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur rounded-full px-3 py-1">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              {t('infra.heroTotal', '{{count}} Reports', { count: total })}
            </span>
            <span className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur rounded-full px-3 py-1">
              <span className="w-2 h-2 rounded-full bg-yellow-400" />
              {t('infra.heroCategories', '3 Categories')}
            </span>
            <span className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur rounded-full px-3 py-1">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              {t('infra.heroRegions', '14 Regions')}
            </span>
          </div>
        </div>
      </div>

      {/* Submission Form */}
      {showForm && (
        <InfrastructureReportForm
          onClose={() => setShowForm(false)}
          onSuccess={() => { setShowForm(false); fetchReports(); }}
        />
      )}

      {/* Search & Filters */}
      <SearchFilter
        search={search}
        onSearch={(v) => { setSearch(v); setPage(1); }}
        filters={[
          { name: 'category', label: t('infra.allCategories', 'All Categories'), options: FILTER_CATEGORIES },
          { name: 'region',   label: t('infra.allRegions', 'All Regions'),       options: REGIONS.map(r => ({ value: r, label: r })) },
          { name: 'status',   label: t('infra.allStatuses', 'All Statuses'),     options: FILTER_STATUSES },
        ]}
        onFilterChange={handleFilterChange}
        filterValues={filters}
        autocompleteAPI={infraAPI.getPublicAutocomplete}
      />

      {/* Map */}
      {mapMarkers.length > 0 && (
        <div className="mb-6">
          <EthioMap markers={mapMarkers} height="300px" />
        </div>
      )}

      {/* Stats bar */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('infra.verifiedReports', { count: total, defaultValue: '{{count}} verified reports' })}
        </p>
      </div>

      {/* Reports Grid */}
      {loading ? (
        <LoadingSpinner />
      ) : reports.length === 0 ? (
        <EmptyState icon="🏗️" title={t('infra.noReports', 'No reports found')} description={t('infra.adjustFilters', 'Try adjusting your search or filters')} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {reports.map(r => <ReportCard key={r._id} report={r} type="infrastructure" />)}
        </div>
      )}

      <Pagination page={page} pages={pages} onPageChange={setPage} />

      {/* Notice */}
      <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-sm text-blue-700 dark:text-blue-300">
        {t('infra.notice', 'All reports are reviewed by administrators before being made public. Your information helps improve infrastructure across Ethiopia.')}
      </div>
    </div>
  );
}
