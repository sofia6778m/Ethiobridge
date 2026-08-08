import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { campaignAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { CAMPAIGN_CATEGORIES, CAMPAIGN_LEVELS } from '../../../utils/campaignMeta';
import LoadingSpinner from '../../../components/common/LoadingSpinner';

export default function CampaignForm({ listPath }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const editId = new URLSearchParams(location.search).get('edit');

  // Scope locking — subcity / woreda admins can only create campaigns inside
  // their own administrative unit. System admins & government see everything.
  const isGlobal = ['admin', 'ADMIN', 'government'].includes(user?.role);
  const isWoredaAdmin = ['woreda_admin', 'WOREDA_ADMIN', 'woreda', 'WOREDA_HEAD'].includes(user?.role);
  const lockedLevel = !isGlobal ? (isWoredaAdmin ? 'woreda' : 'subcity') : null;
  const lockedLocation = !isGlobal;

  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'other',
    campaignLevel: lockedLevel || 'subcity',
    goalAmount: '',
    endDate: '',
    location: {
      region: 'Addis Ababa',
      subcity: user?.subcity || '',
      woreda: isWoredaAdmin ? user?.woredaName || '' : '',
    },
    image: '',
  });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editId) return;
    setLoading(true);
    campaignAPI.manage({ limit: 50 })
      .then((res) => {
        const found = (res.data?.data?.campaigns || []).find((c) => c._id === editId);
        if (!found) { toast.error(t('campaign.notFound')); return; }
        setForm({
          title: found.title,
          description: found.description,
          category: found.category,
          campaignLevel: lockedLevel || found.campaignLevel,
          goalAmount: found.goalAmount,
          endDate: found.endDate ? found.endDate.slice(0, 10) : '',
          location: lockedLocation
            ? {
                region: 'Addis Ababa',
                subcity: user?.subcity || found.location?.subcity || '',
                woreda: isWoredaAdmin ? user?.woredaName || found.location?.woreda || '' : '',
              }
            : found.location || {},
          image: found.image || '',
        });
        setImagePreview(found.image || null);
      })
      .catch((e) => toast.error(e.response?.data?.message || t('campaign.loadFailed')))
      .finally(() => setLoading(false));
  }, [editId, t]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name.startsWith('location.')) {
      if (lockedLocation) return;
      setForm((p) => ({ ...p, location: { ...p.location, [name.split('.')[1]]: value } }));
    } else if (name === 'campaignLevel') {
      if (lockedLevel) return;
      setForm((p) => ({ ...p, [name]: value }));
    } else {
      setForm((p) => ({ ...p, [name]: value }));
    }
  };

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim() || !Number(form.goalAmount) || Number(form.goalAmount) <= 0) {
      toast.error(t('campaign.fillRequired'));
      return;
    }
    setSaving(true);
    try {
      const data = new FormData();
      data.append('title', form.title.trim());
      data.append('description', form.description.trim());
      data.append('category', form.category);
      data.append('campaignLevel', form.campaignLevel);
      data.append('goalAmount', String(Number(form.goalAmount)));
      if (form.endDate) data.append('endDate', form.endDate);
      data.append('location', JSON.stringify(form.location));
      if (imageFile) data.append('image', imageFile);

      if (editId) {
        await campaignAPI.update(editId, data);
        toast.success(t('campaign.updated'));
      } else {
        await campaignAPI.create(data);
        toast.success(t('campaign.created'));
      }
      navigate(listPath);
    } catch (err) {
      toast.error(err.response?.data?.message || t('campaign.actionFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
        {editId ? '✏️ ' : '🎗️ '}{editId ? t('campaign.editCampaign') : t('campaign.createCampaign')}
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t('campaign.formSubtitle')}</p>

      <form onSubmit={handleSubmit} className="card p-6 space-y-4">
        <div>
          <label className="form-label">{t('campaign.title')} *</label>
          <input name="title" value={form.title} onChange={handleChange} maxLength={120} className="input-field" placeholder={t('campaign.titlePlaceholder')} />
        </div>

        <div>
          <label className="form-label">{t('campaign.description')} *</label>
          <textarea name="description" value={form.description} onChange={handleChange} rows={6} className="input-field" placeholder={t('campaign.descriptionPlaceholder')} />
          <p className="text-xs text-gray-400 mt-1">{t('campaign.descriptionHint')}</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="form-label">{t('campaign.category')}</label>
            <select name="category" value={form.category} onChange={handleChange} className="input-field">
              {CAMPAIGN_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">{t('campaign.level')}</label>
            <select name="campaignLevel" value={form.campaignLevel} onChange={handleChange} className="input-field" disabled={!!editId || !!lockedLevel}>
              {CAMPAIGN_LEVELS.map((l) => (
                <option key={l} value={l}>{l[0].toUpperCase() + l.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>

        {lockedLocation && (
          <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
            ℹ️ {t('campaign.scopeLockHint')}
          </p>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="form-label">{t('campaign.goalAmount')} *</label>
            <input name="goalAmount" type="number" min="1" value={form.goalAmount} onChange={handleChange} className="input-field" placeholder="50,000" />
          </div>
          <div>
            <label className="form-label">{t('campaign.endDate')}</label>
            <input name="endDate" type="date" value={form.endDate} onChange={handleChange} className="input-field" />
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label className="form-label">{t('campaign.region')}</label>
            <input name="location.region" value={form.location.region || ''} onChange={handleChange} className="input-field" disabled={lockedLocation} />
          </div>
          <div>
            <label className="form-label">{t('campaign.subcity')}</label>
            <input name="location.subcity" value={form.location.subcity || ''} onChange={handleChange} className="input-field" disabled={lockedLocation} />
          </div>
          <div>
            <label className="form-label">{t('campaign.woreda')}</label>
            <input name="location.woreda" value={form.location.woreda || ''} onChange={handleChange} className="input-field" disabled={lockedLocation} />
          </div>
        </div>

        <div>
          <label className="form-label">{t('campaign.image')}</label>
          <input type="file" accept="image/*" onChange={handleFile} className="input-field p-2" />
          {imagePreview && (
            <img src={imagePreview} alt="" className="mt-3 h-32 object-cover rounded-xl" />
          )}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" disabled={saving} className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-semibold py-2.5 px-6 rounded-lg transition-colors">
            {saving ? t('common.saving') : editId ? t('common.save') : t('campaign.createCampaign')}
          </button>
          <button type="button" onClick={() => navigate(listPath)} className="btn-secondary py-2.5 px-6">{t('common.cancel')}</button>
        </div>
      </form>
    </div>
  );
}
