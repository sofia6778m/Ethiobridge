import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { workflowAPI } from '../../../services/api';
import StatusBadge from '../../../components/common/StatusBadge';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import Pagination from '../../../components/common/Pagination';
import WorkflowReportDetail from '../../../components/workflow/WorkflowReportDetail';

const LEVELS = [
  { key: 'kebele',          label: 'Kebele Level',          shortLabel: 'Kebele',          icon: '🏘️', color: 'from-green-600 to-green-500',    bg: 'bg-green-50 dark:bg-green-900/20',    ring: 'ring-green-200 dark:ring-green-800',    text: 'text-green-700 dark:text-green-400',    bar: 'bg-green-500',    badge: 'bg-green-100 text-green-700' },
  { key: 'woreda',          label: 'Woreda/Sub-City Level', shortLabel: 'Woreda',          icon: '🏙️', color: 'from-blue-600 to-blue-500',      bg: 'bg-blue-50 dark:bg-blue-900/20',      ring: 'ring-blue-200 dark:ring-blue-800',      text: 'text-blue-700 dark:text-blue-400',      bar: 'bg-blue-500',    badge: 'bg-blue-100 text-blue-700' },
  { key: 'zone',            label: 'Zone Level',            shortLabel: 'Zone',             icon: '🗺️', color: 'from-purple-600 to-purple-500',   bg: 'bg-purple-50 dark:bg-purple-900/20',   ring: 'ring-purple-200 dark:ring-purple-800',   text: 'text-purple-700 dark:text-purple-400',   bar: 'bg-purple-500',  badge: 'bg-purple-100 text-purple-700' },
  { key: 'regional_bureau', label: 'Regional Bureau Level', shortLabel: 'Regional Bureau',  icon: '🏛️', color: 'from-orange-600 to-orange-500',   bg: 'bg-orange-50 dark:bg-orange-900/20',   ring: 'ring-orange-200 dark:ring-orange-800',   text: 'text-orange-700 dark:text-orange-400',   bar: 'bg-orange-500',  badge: 'bg-orange-100 text-orange-700' },
  { key: 'federal_ministry',label: 'Federal Ministry Level', shortLabel: 'Federal Ministry', icon: '🏛️', color: 'from-red-600 to-red-500',        bg: 'bg-red-50 dark:bg-red-900/20',        ring: 'ring-red-200 dark:ring-red-800',        text: 'text-red-700 dark:text-red-400',        bar: 'bg-red-500',     badge: 'bg-red-100 text-red-700' },
];

const STATUS_COLORS = {
  'Idle':          'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  'Clear':         'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Processing':    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  'Reviewing':     'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  'High Volume':   'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const SEVERITY_COLORS = {
  Low: 'bg-gray-100 text-gray-700',
  Medium: 'bg-yellow-100 text-yellow-700',
  High: 'bg-orange-100 text-orange-700',
  Critical: 'bg-red-100 text-red-700',
};

const VIEW_TABS = [
  { key: 'incoming',  label: 'Incoming Reports',  icon: '📥', view: 'incoming' },
  { key: 'forwarded', label: 'Forwarded Reports', icon: '➡️', view: 'forwarded' },
  { key: 'resolved',  label: 'Resolved Reports',  icon: '✅', view: 'resolved' },
  { key: 'all',       label: 'All Reports',        icon: '📋', view: 'all' },
];

function FlowArrow() {
  return (
    <div className="flex flex-col items-center py-1">
      <div className="w-0.5 h-6 bg-gradient-to-b from-gray-300 to-gray-400 dark:from-gray-600 dark:to-gray-500" />
      <div className="w-3 h-3 rotate-45 bg-gray-400 dark:bg-gray-500 -mt-1.5" />
    </div>
  );
}

function LevelCard({ level, stats, onClick, isActive }) {
  const s = stats || { total: 0, pending: 0, resolved: 0, escalated: 0, status: 'Idle' };
  const totalForBar = s.total || 1;
  const pendingPct = Math.round((s.pending / totalForBar) * 100);
  const resolvedPct = Math.round((s.resolved / totalForBar) * 100);
  const escalatedPct = Math.round((s.escalated / totalForBar) * 100);

  return (
    <button onClick={onClick}
      className={`w-full ${level.bg} rounded-2xl p-5 text-left hover:shadow-lg transition-all duration-200 ring-1 ${level.ring} ${isActive ? 'ring-2 shadow-lg' : 'hover:ring-2'} group cursor-pointer`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${level.color} flex items-center justify-center text-2xl text-white shadow-md`}>
            {level.icon}
          </div>
          <div>
            <h3 className={`font-bold text-base ${level.text}`}>{level.label}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[s.status] || STATUS_COLORS['Idle']}`}>
              {s.status}
            </span>
          </div>
        </div>
        <span className="text-xs text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors">
          {isActive ? 'Viewing →' : 'View Details →'}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-3">
        {[
          { label: 'Total',      value: s.total,      color: 'text-gray-800 dark:text-gray-100' },
          { label: 'Pending',    value: s.pending,     color: 'text-yellow-600 dark:text-yellow-400' },
          { label: 'Resolved',   value: s.resolved,    color: 'text-green-600 dark:text-green-400' },
          { label: 'Escalated',  value: s.escalated,   color: 'text-blue-600 dark:text-blue-400' },
        ].map(item => (
          <div key={item.label} className="text-center">
            <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500 w-14 text-right">Pending</span>
          <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-yellow-400 rounded-full transition-all" style={{ width: `${pendingPct}%` }} />
          </div>
          <span className="text-[10px] text-gray-400 w-8">{pendingPct}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500 w-14 text-right">Resolved</span>
          <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-green-400 rounded-full transition-all" style={{ width: `${resolvedPct}%` }} />
          </div>
          <span className="text-[10px] text-gray-400 w-8">{resolvedPct}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500 w-14 text-right">Escalated</span>
          <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-blue-400 rounded-full transition-all" style={{ width: `${escalatedPct}%` }} />
          </div>
          <span className="text-[10px] text-gray-400 w-8">{escalatedPct}%</span>
        </div>
      </div>
    </button>
  );
}

function LevelTabs({ activeLevel, onSelect }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
      {LEVELS.map(level => (
        <button
          key={level.key}
          onClick={() => onSelect(level.key)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-200 shrink-0 ${
            activeLevel === level.key
              ? `bg-gradient-to-r ${level.color} text-white shadow-md`
              : `${level.bg} ${level.text} hover:shadow-md`
          }`}>
          <span className="text-base">{level.icon}</span>
          <span>{level.shortLabel}</span>
        </button>
      ))}
    </div>
  );
}

function ReportTable({ level, view, onSelectReport }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState('');

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const params = { level, page, limit: 12 };
      if (view === 'incoming') params.view = 'incoming';
      else if (view === 'resolved') params.view = 'resolved';
      else if (view === 'forwarded') params.view = 'forwarded';
      else if (view === 'all') params.view = 'history';
      if (search) params.search = search;
      const res = await workflowAPI.getReports(params);
      setReports(res.data.reports);
      setPages(res.data.pages);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [level, view, page, search]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  useEffect(() => { setPage(1); }, [view]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <form onSubmit={e => { e.preventDefault(); setPage(1); fetchReports(); }} className="flex gap-2">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search reports..." className="input-field flex-1" />
        <button type="submit" className="btn-primary text-sm px-4">Search</button>
      </form>

      {reports.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-gray-500 dark:text-gray-400">No reports found</p>
        </div>
      ) : (
        <>
          <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700/50 text-left">
                    <th className="px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">Report ID</th>
                    <th className="px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">Title</th>
                    <th className="px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">Category</th>
                    <th className="px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">Severity</th>
                    <th className="px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">Status</th>
                    <th className="px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">Date</th>
                    <th className="px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                  {reports.map(r => (
                    <tr key={r._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-primary-600 dark:text-primary-400">{r.reportId}</td>
                      <td className="px-4 py-3 text-gray-800 dark:text-gray-200 max-w-[200px] truncate">{r.title}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-xs">{r.category}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEVERITY_COLORS[r.severityLevel]}`}>{r.severityLevel}</span>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{new Date(r.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => onSelectReport(r._id)}
                          className="text-primary-600 hover:text-primary-800 dark:text-primary-400 text-xs font-medium">
                          View →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination page={page} pages={pages} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}

function LevelDetailView({ level }) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const cfg = LEVELS.find(l => l.key === level);
  const [stats, setStats] = useState(null);
  const [levelStats, setLevelStats] = useState({ total: 0, pending: 0, resolved: 0, escalated: 0 });
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState(searchParams.get('view') || 'incoming');
  const [selectedReport, setSelectedReport] = useState(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await workflowAPI.getStats();
      const allStats = res.data.stats;
      setStats(allStats);
      const ls = allStats[level];
      setLevelStats(typeof ls === 'object' && ls !== null ? ls : { total: 0, pending: 0, resolved: 0, escalated: 0 });
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [level]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  useEffect(() => {
    const v = searchParams.get('view');
    if (v && VIEW_TABS.find(t => t.key === v)) setActiveView(v);
  }, [searchParams]);

  const handleViewChange = (viewKey) => {
    setActiveView(viewKey);
    setSearchParams({ level, view: viewKey }, { replace: true });
  };

  if (loading) return <LoadingSpinner />;
  if (!cfg) return null;

  if (selectedReport) {
    return (
      <WorkflowReportDetail
        reportId={selectedReport}
        onBack={() => setSelectedReport(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className={`bg-gradient-to-r ${cfg.color} rounded-2xl p-6 text-white`}>
        <div className="flex items-center gap-3">
          <span className="text-3xl">{cfg.icon}</span>
          <div>
            <h2 className="text-xl font-bold">{cfg.label}</h2>
            <p className="text-white/80 text-sm">Reports currently at {cfg.shortLabel} level — awaiting action</p>
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl bg-white/20">{cfg.icon}</div>
          <div>
            <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{levelStats.total}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Reports at {cfg.shortLabel}</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl bg-green-100 dark:bg-green-900/30">✅</div>
          <div>
            <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{stats?.resolved ?? 0}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Resolved (all levels)</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl bg-red-100 dark:bg-red-900/30">🚨</div>
          <div>
            <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{stats?.critical ?? 0}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Critical (active)</p>
          </div>
        </div>
      </div>

      <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-xl p-1 overflow-x-auto">
        {VIEW_TABS.map(tab => (
          <button key={tab.key} onClick={() => handleViewChange(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              activeView === tab.key
                ? 'bg-white dark:bg-gray-600 text-gray-800 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}>
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <ReportTable level={level} view={activeView} onSelectReport={setSelectedReport} />
    </div>
  );
}

function WorkflowOverview({ onSelectLevel }) {
  const { t } = useTranslation();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await workflowAPI.getStats();
        setStats(res.data.stats);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  if (loading) return <LoadingSpinner />;

  const totalReports = stats?.total ?? 0;
  const totalResolved = stats?.resolved ?? 0;
  const totalCritical = stats?.critical ?? 0;

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-indigo-700 via-blue-700 to-blue-600 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl">📋</div>
          <div>
            <h2 className="text-xl font-bold">All-Level Workflow Overview</h2>
            <p className="text-blue-100 text-sm">Complete view of report escalation from citizen submission to federal level</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4">
          {[
            { label: 'Total Reports',  value: totalReports,  icon: '📊' },
            { label: 'Resolved',       value: totalResolved, icon: '✅' },
            { label: 'Critical Active',value: totalCritical, icon: '🚨' },
          ].map(item => (
            <div key={item.label} className="bg-white/10 rounded-xl p-3 text-center">
              <p className="text-xl">{item.icon}</p>
              <p className="text-2xl font-bold">{item.value}</p>
              <p className="text-xs text-blue-100">{item.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-full">
          <span className="text-sm">📝</span>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Citizen Report Submitted</span>
        </div>
        <div className="flex-1 h-px bg-gradient-to-r from-gray-300 to-transparent dark:from-gray-600" />
      </div>

      <div className="space-y-0">
        {LEVELS.map((level, i) => (
          <div key={level.key}>
            {i > 0 && <FlowArrow />}
            <LevelCard
              level={level}
              stats={stats?.[level.key]}
              onClick={() => onSelectLevel(level.key)}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-4 py-2 bg-green-100 dark:bg-green-900/30 rounded-full">
          <span className="text-sm">✅</span>
          <span className="text-sm font-semibold text-green-700 dark:text-green-400">Case Closed / Resolved</span>
        </div>
        <div className="flex-1 h-px bg-gradient-to-r from-green-300 to-transparent dark:from-green-700" />
      </div>

      <div className="card">
        <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Workflow Legend</h4>
        <div className="flex flex-wrap gap-4 text-xs text-gray-600 dark:text-gray-400">
          {[
            { icon: '⏳', label: 'Pending', desc: 'Reports awaiting review at this level' },
            { icon: '✅', label: 'Resolved', desc: 'Reports resolved at this level' },
            { icon: '↗️', label: 'Escalated', desc: 'Reports forwarded to the next level' },
            { icon: '🔴', label: 'High Volume', desc: 'Level has more than 20 pending reports' },
            { icon: '🟡', label: 'Reviewing', desc: 'Level has 11-20 pending reports' },
            { icon: '🟢', label: 'Processing', desc: 'Level has 1-10 pending reports' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-1.5">
              <span>{item.icon}</span>
              <span className="font-medium">{item.label}:</span>
              <span>{item.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function GovWorkflowPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeLevel = searchParams.get('level');

  const handleSelectLevel = (levelKey) => {
    setSearchParams({ level: levelKey });
  };

  const handleBackToOverview = () => {
    setSearchParams({});
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">📋</span>
          <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">
            All-Level Workflow
          </h1>
          {activeLevel && (
            <>
              <span className="text-gray-400">/</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {LEVELS.find(l => l.key === activeLevel)?.label || activeLevel}
              </span>
            </>
          )}
        </div>
        {activeLevel && (
          <button onClick={handleBackToOverview}
            className="text-sm text-primary-600 hover:text-primary-800 dark:text-primary-400 font-medium flex items-center gap-1">
            ← Back to Overview
          </button>
        )}
      </div>

      <LevelTabs activeLevel={activeLevel} onSelect={handleSelectLevel} />

      {activeLevel ? (
        <LevelDetailView key={activeLevel} level={activeLevel} />
      ) : (
        <WorkflowOverview onSelectLevel={handleSelectLevel} />
      )}
    </div>
  );
}
