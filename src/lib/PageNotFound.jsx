import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';

export default function PageNotFound() {
  const location = useLocation();
  const pageName = location.pathname.substring(1);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 premium-gradient relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[40%] -right-[20%] w-[600px] h-[600px] rounded-full bg-gradient-to-br from-rose-100/30 to-transparent blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="text-center relative z-10"
      >
        <div className="text-[80px] font-bold tracking-tighter text-foreground/10 leading-none mb-4">
          404
        </div>

        <h2 className="text-[22px] font-bold tracking-tight text-foreground mb-2">
          Pagina niet gevonden
        </h2>
        <p className="text-muted-foreground text-[13px] mb-8">
          De pagina <span className="font-semibold text-foreground/70">"{pageName}"</span> bestaat niet.
        </p>

        <a
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-foreground text-background text-[13px] font-semibold transition-all duration-200 hover:opacity-90 active:scale-[0.98]"
        >
          <ArrowLeft className="w-4 h-4" />
          Ga naar Home
        </a>
      </motion.div>
    </div>
  );
}
