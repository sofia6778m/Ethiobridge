import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { emergencyAPI } from '../../services/api';
import ReportCard from '../../components/common/ReportCard';
import SearchFilter from '../../components/common/SearchFilter';
import Pagination from '../../components/common/Pagination';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import EthioMap from '../../components/map/EthioMap';

const REGIONS = ['Addis Ababa','Oromia','Amhara','Tigray','Somali','Afar','Sidama','Central Ethiopia','South Ethiopia','Southwest Ethiopia','Gambella','Benishangul-Gumuz','Harari','Dire Dawa'];

export default function EmergencyRequests() {
  const { t } = useTranslation();
  const TYPES = [
    {v:'Flood',l:t('filterOptions.flood')},{v:'Fire',l:t('filterOptions.fire')},
    {v:'Landslide',l:t('filterOptions.landslide')},{v:'Drought',l:t('filterOptions.drought')},
    {v:'Food Shortage',l:t('filterOptions.foodShortage')},{v:'Medical Emergency',l:t('filterOptions.medicalEmergency')},
    {v:'Disease Outbreak',l:t('filterOptions.diseaseOutbreak')},{v:'Other',l:t('filterOptions.other')},
  ];
  const STATUSES = [
    {v:'Under Review',l:t('dashboard.statusUnderReview')},{v:'Active',l:t('dashboard.statusActive')},
    {v:'In Progress',l:t('dashboard.statusInProgress')},{v:'Resolved',l:t('dashboard.statusResolved')},
  ];
  const PRIORITIES = [
    {v:'High',l:t('filterOptions.high')},{v:'Medium',l:t('filterOptions.medium')},{v:'Low',l:t('filterOptions.low')},
  ];
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ emergencyType:'', region:'', status:'', priorityLevel:'' });
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [mapMarkers, setMapMarkers] = useState([]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const res = await emergencyAPI.getPublic({ search, ...filters, page, limit: 9 });
      setReports(res.data.reports);
      setPages(res.data.pages);
      setTotal(res.data.total);
      setMapMarkers(res.data.reports.filter(r => r.latitude && r.longitude).map(r => ({ ...r, type: 'emergency' })));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchReports(); }, [search, filters, page]);

  const handleFilterChange = (name, value) => { setFilters(p => ({ ...p, [name]: value })); setPage(1); };

  const urgentReports = reports.filter(r => r.priorityLevel === 'High' || r.urgencyLevel === 'Critical');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">{t('emergency.title')}</h1>
        <p className="text-gray-500 dark:text-gray-400">{t('emergency.desc')}</p>
      </div>

      <SearchFilter
        search={search}
        onSearch={(v) => { setSearch(v); setPage(1); }}
        filters={[
          { name:'emergencyType', label: t('emergency.allTypes'),     options: TYPES },
          { name:'region',        label: t('emergency.allRegions'),   options: REGIONS.map(r => ({ value:r, label:r })) },
          { name:'status',        label: t('emergency.allStatuses'),  options: STATUSES },
          { name:'priorityLevel', label: t('emergency.allPriorities'),options: PRIORITIES },
        ]}
        onFilterChange={handleFilterChange}
        filterValues={filters}
      />

      {/* Urgent Banner */}
      {urgentReports.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6">
          <p className="text-red-700 font-semibold text-sm">{t('emergency.urgentBanner', { count: urgentReports.length })}</p>
        </div>
      )}

      {mapMarkers.length > 0 && (
        <div className="mb-8">
          <EthioMap markers={mapMarkers} height="300px" />
        </div>
      )}

      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t('emergency.verifiedRequests', { count: total })}</p>

      {loading ? <LoadingSpinner /> : reports.length === 0
        ? <EmptyState icon="🚨" title={t('emergency.noRequests')} description={t('emergency.adjustFilters')} />
        : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {reports.map(r => <ReportCard key={r._id} report={r} type="emergency" />)}
          </div>
        )}

      <Pagination page={page} pages={pages} onPageChange={setPage} />

      <div className="mt-8 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-700">
        <strong>{t('emergency.notice')}</strong>
      </div>
    </div>
  );
}
