import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Film, Scissors, Music2, Type, Sparkles, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Video Lite Editor — Edição rápida, leve e offline" },
      { name: "description", content: "Importe, corte, junte, adicione texto e música, exporte em MP4. Tudo no navegador." },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: Film, title: "Importar", desc: "MP4, MOV, AVI, MKV, WEBM" },
  { icon: Scissors, title: "Cortar & Juntar", desc: "Trim preciso e concatenação rápida" },
  { icon: Type, title: "Texto", desc: "Sobreposição com fonte, cor e posição" },
  { icon: Music2, title: "Música", desc: "Mixe áudio de fundo com controle de volume" },
];

function Landing() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="bg-grid absolute inset-0 opacity-40" />
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[900px] -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: "radial-gradient(closest-side, color-mix(in oklab, var(--primary) 35%, transparent), transparent)" }}
      />

      <nav className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
            <Film className="h-4 w-4" />
          </div>
          <span className="font-display text-sm font-semibold tracking-tight">VIDEO LITE EDITOR</span>
        </div>
        <Link to="/editor" className="text-sm text-muted-foreground hover:text-foreground">Abrir editor →</Link>
      </nav>

      <section className="relative z-10 mx-auto max-w-4xl px-6 pt-20 pb-16 text-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur"
        >
          <Sparkles className="h-3 w-3 text-primary" /> Funciona offline no seu navegador
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="mt-6 font-display text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl"
        >
          Edição de vídeo<br />
          <span style={{ color: "var(--primary)" }}>simples e rápida.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.25 }}
          className="mx-auto mt-5 max-w-xl text-base text-muted-foreground"
        >
          Importe, corte, junte clipes, adicione texto e música. Exporte em MP4 sem instalar nada.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-9 flex flex-wrap items-center justify-center gap-3"
        >
          <Link
            to="/editor"
            className="glow-primary inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition hover:opacity-95"
          >
            Novo Projeto <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/editor"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card/60 px-5 py-3 text-sm font-medium text-foreground backdrop-blur transition hover:bg-card"
          >
            Abrir Projeto
          </Link>
        </motion.div>
      </section>

      <section className="relative z-10 mx-auto grid max-w-5xl grid-cols-2 gap-3 px-6 pb-24 sm:grid-cols-4">
        {features.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 + i * 0.08 }}
            className="rounded-xl border border-border bg-card/60 p-4 backdrop-blur"
          >
            <f.icon className="h-5 w-5 text-primary" />
            <div className="mt-3 text-sm font-medium">{f.title}</div>
            <div className="mt-1 text-xs text-muted-foreground">{f.desc}</div>
          </motion.div>
        ))}
      </section>
    </main>
  );
}
