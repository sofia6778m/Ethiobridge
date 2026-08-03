import { useTranslation } from 'react-i18next';

export default function BeforeAfterGallery({ report }) {
  const { t } = useTranslation();
  const beforePhotos = report.photos || [];
  const afterPhotos = report.afterPhotos || [];
  const beforeVideos = report.videos || [];
  const afterVideos = report.afterVideos || [];

  const hasAny = beforePhotos.length || afterPhotos.length || beforeVideos.length || afterVideos.length;
  if (!hasAny) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">{t('dashboard.beforeAfterGallery') || 'Before & After Gallery'}</h3>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Before */}
        <div>
          <p className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-2">
            {t('dashboard.beforeRepair') || 'Before Repair'} ({beforePhotos.length + beforeVideos.length})
          </p>
          {beforePhotos.length > 0 ? (
            <div className="flex gap-2 flex-wrap">
              {beforePhotos.map((p, i) => (
                <img key={i} src={p} alt="" className="h-24 w-24 rounded-lg object-cover border-2 border-red-200" />
              ))}
            </div>
          ) : <p className="text-xs text-gray-400">No photos</p>}
          {beforeVideos.length > 0 && (
            <div className="flex gap-2 mt-2 flex-wrap">
              {beforeVideos.map((v, i) => (
                <video key={i} src={v} controls className="h-24 rounded-lg border-2 border-red-200" />
              ))}
            </div>
          )}
        </div>

        {/* After */}
        <div>
          <p className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-2">
            {t('dashboard.afterRepair') || 'After Repair'} ({afterPhotos.length + afterVideos.length})
          </p>
          {afterPhotos.length > 0 ? (
            <div className="flex gap-2 flex-wrap">
              {afterPhotos.map((p, i) => (
                <img key={i} src={p} alt="" className="h-24 w-24 rounded-lg object-cover border-2 border-green-200" />
              ))}
            </div>
          ) : <p className="text-xs text-gray-400">No photos yet</p>}
          {afterVideos.length > 0 && (
            <div className="flex gap-2 mt-2 flex-wrap">
              {afterVideos.map((v, i) => (
                <video key={i} src={v} controls className="h-24 rounded-lg border-2 border-green-200" />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
