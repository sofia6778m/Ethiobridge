import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { infraAPI } from '../../services/api';
import { toast } from 'react-toastify';

export default function ReportComments({ report, userRole, onComplete }) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [saving, setSaving] = useState(false);

  const comments = report.comments || [];
  const canComment = ['citizen', 'government', 'admin', 'ngo'].includes(userRole);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    try {
      await infraAPI.addComment(report._id, { text: text.trim(), isInternal });
      setText('');
      setIsInternal(false);
      toast.success(t('dashboard.commentAdded') || 'Comment added');
      onComplete?.();
    } catch (err) {
      toast.error(err.response?.data?.message || t('dashboard.actionFailed'));
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700">
        {t('dashboard.comments') || 'Comments & Updates'} ({comments.length})
      </h3>

      {comments.length > 0 && (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {comments.map((c, i) => {
            const isAuthor = c.authorRole === userRole;
            return (
              <div key={c._id || i} className={`p-3 rounded-lg text-sm ${isAuthor ? 'bg-blue-50 ml-6' : 'bg-gray-50 mr-6'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-gray-800">{c.authorName}</span>
                  <span className="text-xs text-gray-400">{new Date(c.createdAt).toLocaleString()}</span>
                </div>
                <p className="text-gray-600">{c.text}</p>
                {c.isInternal && <span className="text-xs text-amber-600 mt-1 inline-block">🔒 Internal</span>}
              </div>
            );
          })}
        </div>
      )}

      {canComment && (
        <form onSubmit={handleSubmit} className="border-t border-gray-100 pt-3">
          <textarea value={text} onChange={e => setText(e.target.value)} rows={2} className="input-field text-sm" placeholder={t('dashboard.writeComment') || 'Write a comment...'} />
          <div className="flex items-center justify-between mt-2">
            {['admin', 'government'].includes(userRole) && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isInternal} onChange={e => setIsInternal(e.target.checked)} className="rounded" />
                <span className="text-xs text-gray-500">{t('dashboard.internalNote') || 'Internal note'}</span>
              </label>
            )}
            <button type="submit" disabled={saving || !text.trim()} className="btn-primary text-xs py-1.5 px-4 ml-auto">
              {saving ? '...' : t('dashboard.send') || 'Send'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
