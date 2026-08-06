/**
 * FormSection — reusable card section for multi-section forms.
 *
 * Must be defined at MODULE scope (it is) so its identity is stable across
 * renders. Inline component definitions inside a form body cause React to remount
 * the whole section on every keystroke, which drops focus while typing.
 */
export default function FormSection({ icon, title, subtitle, children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden ${className}`}>
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40">
        <span className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-lg shrink-0">{icon}</span>
        <div>
          <h3 className="font-bold text-gray-900 dark:text-gray-100">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
        </div>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </section>
  );
}
