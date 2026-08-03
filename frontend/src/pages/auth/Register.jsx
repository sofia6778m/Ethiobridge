import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import ThemeToggle from '../../components/common/ThemeToggle';
import { toast } from 'react-toastify';

export default function Register() {
  const { t } = useTranslation();
  const { register } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    role: '',
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    subcity: '',
    organizationName: '',
    organizationType: '',
    skills: '',
  });

  const roleInfo = {
    citizen:    { icon:'👤', label: t('register.roleCitizen'),              desc: t('register.roleCitizenDesc') },
    volunteer:  { icon:'🙋', label: t('register.roleVolunteer'),            desc: t('register.roleVolunteerDesc') },
  };

  const handleChange = (e) => setForm(p => ({ ...p, [e.target.name]: e.target.value }));
  const selectRole = (role) => { setForm(p => ({ ...p, role })); setStep(2); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast.error(t('toast.passwordsDoNotMatch'));
      return;
    }
    if (form.password.length < 6) {
      toast.error(t('toast.passwordTooShort'));
      return;
    }
    setLoading(true);
    try {
      const payload = { ...form, skills: form.skills ? form.skills.split(',').map(s => s.trim()) : [] };
      delete payload.confirmPassword;
      await register(payload);
      toast.success(t('toast.registrationSuccess') + ' Please log in using your email and password.');
      navigate('/login');
    } catch (err) {
      toast.error(err.response?.data?.message || t('toast.registrationFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-primary-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center px-4 py-12 transition-colors">
      <div className="w-full max-w-lg">
        {/* Theme toggle */}
        <div className="fixed top-4 right-4 z-50">
          <ThemeToggle />
        </div>

        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-4">
            <div className="w-12 h-12 rounded-xl bg-primary-600 flex items-center justify-center text-white font-bold text-2xl">E</div>
            <span className="font-bold text-2xl text-primary-700 dark:text-primary-400">EthioBridge</span>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('register.title')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{t('register.subtitle')}</p>
        </div>

        {/* Step 1: Select Role */}
        {step === 1 && (
          <div className="card shadow-lg">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">{t('register.selectRole')}</h2>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(roleInfo).map(([key, info]) => (
                <button
                  key={key}
                  onClick={() => selectRole(key)}
                  className="border-2 border-gray-200 dark:border-gray-600 hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-xl p-4 text-left transition-all group"
                >
                  <div className="text-3xl mb-2">{info.icon}</div>
                  <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm group-hover:text-primary-700 dark:group-hover:text-primary-400">{info.label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{info.desc}</p>
                </button>
              ))}
            </div>
            <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
              {t('register.haveAccount')} <Link to="/login" className="text-primary-600 dark:text-primary-400 font-medium hover:underline">{t('register.signIn')}</Link>
            </p>
          </div>
        )}

        {/* Step 2: Fill Details */}
        {step === 2 && (
          <div className="card shadow-lg">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100 dark:border-gray-700">
              <button onClick={() => setStep(1)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">←</button>
              <div className="flex items-center gap-2">
                <span className="text-2xl">{roleInfo[form.role]?.icon}</span>
                <div>
                  <p className="font-semibold text-gray-800 dark:text-gray-100">{roleInfo[form.role]?.label}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{t('register.fillDetails')}</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('register.fullName')}</label>
                <input name="fullName" required value={form.fullName} onChange={handleChange} className="input-field" placeholder={t('register.fullNamePlaceholder')} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('register.emailAddress')}</label>
                <input name="email" type="email" required value={form.email} onChange={handleChange} className="input-field" placeholder={t('register.emailPlaceholder')} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('register.phoneNumber')}</label>
                <input name="phone" value={form.phone} onChange={handleChange} className="input-field" placeholder={t('register.phonePlaceholder')} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subcity</label>
                <select name="subcity" value={form.subcity} onChange={handleChange} className="input-field">
                  <option value="">Select Subcity</option>
                  <option value="BOLE">Bole</option>
                  <option value="YEKA">Yeka</option>
                  <option value="LEMMI_KURA">Lemmi Kura</option>
                </select>
              </div>

              {form.role === 'volunteer' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('register.skills')}</label>
                  <input name="skills" value={form.skills} onChange={handleChange} className="input-field" placeholder={t('register.skillsPlaceholder')} />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('register.password')}</label>
                <div className="relative">
                  <input name="password" type={showPassword ? 'text' : 'password'} required value={form.password} onChange={handleChange} className="input-field pr-10" placeholder={t('register.passwordPlaceholder')} />
                  <button type="button" onClick={() => setShowPassword(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">{showPassword ? '🙈' : '👁️'}</button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('register.confirmPassword')}</label>
                <input name="confirmPassword" type="password" required value={form.confirmPassword} onChange={handleChange} className="input-field" placeholder={t('register.confirmPlaceholder')} />
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {t('register.registering')}
                  </span>
                ) : t('register.createAccount')}
              </button>
            </form>

            <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-4">
              {t('register.haveAccount')} <Link to="/login" className="text-primary-600 dark:text-primary-400 font-medium hover:underline">{t('register.signIn')}</Link>
            </p>
          </div>
        )}

        <div className="mt-4 text-center">
          <Link to="/" className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">{t('register.backToHome')}</Link>
        </div>
      </div>
    </div>
  );
}
