import { AnimatePresence, motion } from 'framer-motion';

export default function CollapsibleForm({ open, title, subtitle, children }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="collapsible-form"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
          className="overflow-hidden"
        >
          <div className="card p-5">
            {title && (
              <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">{title}</h3>
            )}
            {subtitle && (
              <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2 mb-4">{subtitle}</p>
            )}
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
