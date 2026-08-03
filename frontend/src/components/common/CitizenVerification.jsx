import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { infraAPI } from '../../services/api';
import { toast } from 'react-toastify';
import StarRating from './StarRating';

export default function CitizenVerification({ report, onComplete }) {
  const { t } = useTranslation();
  const [verified, setVerified] = useState(null);
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState([]);
  const [videos, setVideos] = useState([]);
  const [rating, setRating] = useState(0);
  const [saving, setSaving] = useState(false);

  if (report.status !== 'Citizen Verification') return null;

  const handleSubmit = async () => {
    if (verified === null) return toast.error(t('common.select') || 'Please select an option');
    setSaving(true);
    try {
      if (verified) {
        await infraAPI.citizenVerify(report._id, { verified: true, note });
        if (rating > 0) {
          await infraAPI.addFeedback(report._id, { rating, feedback: note });
        }
        toast.success(t('dashboard.citizenVerified') || 'Completion confirmed!');
      } else {
        const data = { verified: false, note };
        if (photos.length > 0) {
          const fd = new FormData();
          photos.forEach(f => fd.append('media', f));
          const uploadRes = await infraAPI.addAfterMedia(report._id, fd);
          data.rejectionPhotos = uploadRes.data.report.citizenRejectionPhotos || [];
        }
        if (videos.length > 0) {
          const fd = new FormData();
          videos.forEach(f => fd.append('media', f));
          await infraAPI.addAfterMedia(report._id, fd);
        }
        await infraAPI.citizenVerify(report._id, data);
        toast.success('Report reopened for further work');
      }
      onComplete?.();
    } catch (err) {
      toast.error(err.response?.data?.message || t('dashboard.actionFailed'));
    } finally { setSaving(false); }
  };

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
      <h3 className="font-bold text-amber-800 mb-2">{t('dashboard.citizenVerifyTitle') || 'Verify Completion'}</h3>
      <p className="text-sm text-amber-700 mb-4">
        {t('dashboard.citizenVerifyDesc') || 'The government has marked this work as completed. Please verify if the issue is resolved.'}
      </p>

      <div className="flex gap-3 mb-4">
        <button
          onClick={() => setVerified(true)}
          className={`flex-1 py-2.5 rounded-lg font-semibold text-sm transition-colors ${verified === true ? 'bg-green-600 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
        >
          ✔ {t('dashboard.confirmResolved') || 'Problem Solved'}
        </button>
        <button
          onClick={() => setVerified(false)}
          className={`flex-1 py-2.5 rounded-lg font-semibold text-sm transition-colors ${verified === false ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
        >
          ✘ {t('dashboard.rejectCompletion') || 'Not Resolved'}
        </button>
      </div>

      {verified === false && (
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('dashboard.whyNotResolved') || 'Why is the issue not resolved?'}</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} className="input-field" placeholder={t('dashboard.rejectionReasonPlaceholder') || 'Describe what is still wrong...'} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('dashboard.uploadNewEvidence') || 'Upload new evidence (photos)'}</label>
            <input type="file" accept="image/*" multiple onChange={e => setPhotos(Array.from(e.target.files).slice(0, 5))} className="input-field py-1.5" />
            {photos.length > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {photos.map((f, i) => (
                  <div key={i} className="relative group">
                    <img src={URL.createObjectURL(f)} alt="" className="h-16 w-16 rounded-lg object-cover" />
                    <button onClick={() => setPhotos(p => p.filter((_, j) => j !== i))} className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs hidden group-hover:flex items-center justify-center">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('dashboard.uploadNewVideos') || 'Upload new evidence (videos)'}</label>
            <input type="file" accept="video/mp4,video/mov,video/webm" multiple onChange={e => setVideos(Array.from(e.target.files).slice(0, 3))} className="input-field py-1.5" />
            {videos.length > 0 && (
              <p className="text-xs text-green-600 mt-1">{videos.length} video(s) selected</p>
            )}
          </div>
        </div>
      )}

      {verified === true && (
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('dashboard.rateService') || 'Rate the service'}</label>
            <StarRating rating={rating} onRate={setRating} size="lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('dashboard.feedbackOptional') || 'Feedback (optional)'}</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className="input-field" placeholder={t('dashboard.feedbackPlaceholder') || 'Share your experience...'} />
          </div>
        </div>
      )}

      <button onClick={handleSubmit} disabled={saving || verified === null} className="btn-primary mt-4 w-full">
        {saving ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            {t('dashboard.submitting') || 'Submitting...'}
          </span>
        ) : verified === true ? (t('dashboard.confirmAndRate') || 'Confirm & Submit') : (t('common.submit') || 'Submit')}
      </button>
    </div>
  );
}
