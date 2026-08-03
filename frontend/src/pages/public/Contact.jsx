import { useState } from 'react';
import { toast } from 'react-toastify';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { publicAPI } from '../../services/api';

export default function Contact() {
  const { t } = useTranslation();
  const [form, setForm] = useState({ fullName:'', email:'', phone:'', subject:'', message:'' });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await publicAPI.submitContact(form);
      toast.success(t('toast.messageSent'));
      setForm({ fullName:'', email:'', phone:'', subject:'', message:'' });
    } catch (err) {
      toast.error(err.response?.data?.message || t('toast.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (e) => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  return (
    <div>
      <section className="bg-gradient-to-r from-primary-700 to-primary-600 text-white py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold mb-4">{t('contact.headerTitle')}</h1>
          <p className="text-primary-100 text-lg">{t('contact.headerDesc')}</p>
        </div>
      </section>

      <section className="py-16 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Contact Info */}
          <div className="space-y-5">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('contact.getInTouch')}</h2>
            {[
              { icon:'📞', label:t('contact.phoneLabel'),          value:'+251 911 000 000', sub:t('contact.phoneSub') },
              { icon:'✉️', label:t('contact.emailLabel'),          value:'info@zda.et', sub:t('contact.emailSub') },
              { icon:'🛠️', label:t('contact.techSupportLabel'),   value:'support@zda.et', sub:t('contact.techSupportSub') },
              { icon:'🤝', label:t('contact.partnershipsLabel'),   value:'partners@zda.et', sub:t('contact.partnershipsSub') },
              { icon:'📍', label:t('contact.addressLabel'), value:t('contact.addressValue'), sub:t('contact.addressSub') },
              { icon:'🌐', label:t('contact.websiteLabel'),        value:t('contact.websiteValue'), sub:t('contact.websiteSub') },
            ].map((c) => (
              <div key={c.label} className="flex gap-3 items-start">
                <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center text-lg shrink-0">{c.icon}</div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{c.label}</p>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{c.value}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{c.sub}</p>
                </div>
              </div>
            ))}

            {/* Social Media */}
            <div>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{t('contact.followUs')}</p>
              <div className="flex gap-2">
                {['Facebook','Telegram','LinkedIn','YouTube'].map((s) => (
                  <a key={s} href="#" className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xs text-gray-600 dark:text-gray-400 hover:bg-primary-600 hover:text-white transition-colors font-bold" title={s}>
                    {s[0]}
                  </a>
                ))}
              </div>
            </div>

            {/* Quick Links */}
            <div>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{t('contact.quickHelp')}</p>
              <ul className="space-y-1 text-sm">
                {[{ to:'/faq', label:t('contact.helpReport') }, { to:'/faq', label:t('contact.helpTrack') }, { to:'/register', label:t('contact.helpRegister') }, { to:'/privacy-policy', label:t('contact.helpPrivacy') }].map(l => (
                  <li key={l.label}><Link to={l.to} className="text-primary-600 hover:underline">{l.label}</Link></li>
                ))}
              </ul>
            </div>
          </div>

          {/* Contact Form */}
          <div className="lg:col-span-2 card">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">{t('contact.sendMessage')}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('contact.fullName')}</label>
                  <input name="fullName" required value={form.fullName} onChange={handleChange} className="input-field" placeholder={t('contact.fullNamePlaceholder')} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('contact.emailAddress')}</label>
                  <input name="email" type="email" required value={form.email} onChange={handleChange} className="input-field" placeholder={t('contact.emailPlaceholder')} />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('contact.phoneNumber')}</label>
                  <input name="phone" value={form.phone} onChange={handleChange} className="input-field" placeholder={t('contact.phonePlaceholder')} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('contact.subject')}</label>
                  <select name="subject" required value={form.subject} onChange={handleChange} className="input-field">
                    <option value="">{t('contact.selectSubject')}</option>
                    <option>{t('contact.subjectGeneral')}</option>
                    <option>{t('contact.subjectTech')}</option>
                    <option>{t('contact.subjectPartnership')}</option>
                    <option>{t('contact.subjectFeedback')}</option>
                    <option>{t('contact.subjectReport')}</option>
                    <option>{t('contact.subjectComplaint')}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('contact.messageLabel')}</label>
                <textarea name="message" required value={form.message} onChange={handleChange} rows={5} className="input-field" placeholder={t('contact.messagePlaceholder')} />
              </div>
              <button type="submit" disabled={submitting} className="btn-primary w-full py-3">
                {submitting ? t('contact.sending') : t('contact.sendBtn')}
              </button>
            </form>
          </div>
        </div>

        {/* Map placeholder */}
        <div className="mt-10 bg-gray-100 dark:bg-gray-700 rounded-xl h-48 flex items-center justify-center">
          <div className="text-center text-gray-500 dark:text-gray-400">
            <p className="text-3xl mb-2">🗺️</p>
            <p className="font-medium">{t('contact.mapTitle')}</p>
            <p className="text-sm">{t('contact.mapDesc')}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
