import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const ease = [0.22, 1, 0.36, 1];

/**
 * Inline, collapsible "meer info" disclosure.
 *
 * Render it as a sibling BELOW a card — never nested inside a card that is
 * itself a <button>/<a>, since this renders its own interactive trigger and
 * nested interactive elements are invalid HTML and break card clicks.
 */
export default function MoreInfo({ label = "Meer info", defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors duration-200 py-1"
      >
        <motion.span
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ duration: 0.25, ease: "easeInOut" }}
          className="flex"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </motion.span>
        {label}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease }}
            className="overflow-hidden"
          >
            <div className="pt-2 pb-1 text-[12.5px] text-muted-foreground leading-relaxed">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
