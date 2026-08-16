"use client";

import { send } from "process";
import { useEffect, useRef, useState, type ReactNode } from "react";

// --- HOOKS & UTILS ---
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => e.isIntersecting && (setShown(true), io.disconnect()),
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return { ref, shown };
}

function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const { ref, shown } = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(20px)" : "translateY(0)",
        transition: `opacity 0.8s ease ${delay}ms, transform 0.8s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

// --- DATA STRUCTURES ---
const NAV = [
  { id: "about", label: "About" },
  { id: "services", label: "Services" },
  { id: "work", label: "Work" },
  { id: "skills", label: "Skills" },
  { id: "testimonials", label: "Testimonials" },
  { id: "contact", label: "Contact" },
];

const SERVICES = [
  { title: "Academic Writing", desc: "Dissertations, theses, journal articles, and literature reviews built on rigorous research and tight argumentation.", icon: "✒️" },
  { title: "Content Writing", desc: "Long-form blog posts, thought leadership, and editorial features written for clarity and resonance.", icon: "📝" },
  { title: "Research", desc: "Primary and secondary research, systematic reviews, and structured synthesis of complex source material.", icon: "🔍" },
  { title: "Editing & Proofreading", desc: "Developmental edits, line edits, and meticulous proofreading aligned with APA, MLA, Chicago and Harvard styles.", icon: "📚" },
];

const WORK = [
  {
    cat: "Academic",
    title: "The Impact of Nurse Burnout on Patient Safety and Care Quality: A Systematic Review",
    abstract: "A systematic review investigating the relationship between nurse burnout, patient safety, and quality of care. Examines how emotional exhaustion, depersonalisation, and reduced professional efficacy affect clinical performance, communication, and safety behaviours including medication errors, missed care, and adverse events.",
    link: "https://docs.google.com/document/d/133UjUFpw9VoOsuqZvDF5Mnz_uz7GM1zucBQCEDtAWyc/edit?usp=sharing"
  },
  {
    cat: "Content",
    title: "Kanye West and the Power Structure of the Music Industry",
    abstract: "A media and entertainment analysis exploring Kanye West's claims about ownership, corporate control, and financial power in the music industry, covering major record labels, artist ownership, fashion corporations, and the broader debate around creative independence.",
    link: "https://docs.google.com/document/d/1MSGxoTu6A0_zSCa-dH70U9AjaMvmPG55dQuiEcUm4hQ/edit?usp=sharing"
  },
  {
    cat: "Academic",
    title: "Cross-Cultural Leadership Between Dutch Headquarters and Chinese Operations",
    abstract: "An analysis of leadership challenges in multicultural business environments. Applies cross-cultural frameworks; Hofstede, GLOBE, and Cultural Intelligence, to examine how Dutch and Chinese cultural differences affect leadership, communication, motivation, and negotiation.",
    link: "https://docs.google.com/document/d/1ejOqJ9t1RRvet4KelNgSY7IE5zq8uTRg1xufZTHjwZk/edit?usp=sharing"
  },
  {
    cat: "Research",
    title: "Cybersecurity Risk Assessment for a Charity Organisation",
    abstract: "A cybersecurity evaluation for a small charity (Need4Help), covering network security, access control, cryptography, endpoint security, and physical security. Analyses threats such as phishing, shared computer risks, and unpatched vulnerabilities, with framework recommendations.",
    link: "https://docs.google.com/document/d/1XpB-YtqS2v8i7w7SzsRk0R7gDXNGckkcZjBUB3B966M/edit?usp=sharing"
  },
  {
    cat: "Academic",
    title: "Person-Centred Care in Health and Social Care",
    abstract: "An examination of person-centred care principles in health and social care practice. Covers professional values, empathy, equality, diversity, and legal frameworks including the Care Act 2014 and Mental Capacity Act 2005, with a case study on autonomy, beneficence, and patient dignity.",
    link: "https://docs.google.com/document/d/17tYqvliqZq2JBdJDcFxAHhS-DezlpjCE40aGF0mCBE0/edit?usp=sharing"
  },
];

const CATS = ["All", "Academic", "Research", "Content"]; // Updated "Blog"/"Technical" to match tags found in your actual WORK array

const SKILLS = [
  { group: "Citation Styles", items: ["APA 7", "MLA 9", "Chicago", "Harvard", "Vancouver"] },
  { group: "Tools", items: ["Zotero", "Mendeley", "Google Scholar", "MS Word", "LaTeX", "Grammarly Premium"] },
  { group: "Methods", items: ["Systematic Review", "Thematic Analysis", "Qualitative Coding", "Meta-Synthesis"] },
  { group: "Subject Areas", items: ["Humanities", "Social Sciences", "Education", "Public Health", "Technology Ethics", "Business"] },
];

const TESTIMONIALS = [
  { quote: "Amara's editing transformed my dissertation. Her feedback was rigorous, kind, and exactly what I needed before submission.", name: "Dr. Helena Mwangi", role: "PhD Candidate, University of Edinburgh" },
  { quote: "The clearest, most beautifully-argued whitepaper our team has ever commissioned. She understood our brief better than we did.", name: "Marcus Liang", role: "Director of Research, Civic Lab" },
  { quote: "Reliable, deeply intelligent, and a genuine pleasure to work with. I now send every long-form project her way.", name: "Sade Adekunle", role: "Editor-in-Chief, Lantern Magazine" },
];

const STATS = [
  { n: "50+", l: "Research Papers" },
  { n: "2", l: "Years Experience" },
  { n: "30+", l: "Happy Clients" },
];

// --- MAIN PORTFOLIO COMPONENT ---
export default function Portfolio() {
  const [filter, setFilter] = useState("All");
  const [open, setOpen] = useState(false);
  const filtered = filter === "All" ? WORK : WORK.filter((w) => w.cat === filter);
 const send = (e:any) => {
    e.preventDefault();
          
          // Safely extract values using the element IDs
          const target = e.currentTarget;
          const name = target.querySelector('#name')?.value || '';
          const email = target.querySelector('#email')?.value || '';
          const type = target.querySelector('#type')?.value || '';
          const msg = target.querySelector('#msg')?.value || '';

          // Format the message for WhatsApp
          const whatsappNumber = "2349134878316"; 
          const textMessage = `Hello! New project inquiry:\n\n*Name:* ${name}\n*Email:* ${email}\n*Project Type:* ${type}\n\n*Message:* ${msg}`;
          
          // Encode and open the WhatsApp link
          const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(textMessage)}`;
          window.open(whatsappUrl, '_blank');
        }
 
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* NAV */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <a href="#top" className="font-serif text-xl font-semibold tracking-tight">
            Adebisi <span className="text-gold">Feranmi</span>
          </a>
          <nav className="hidden items-center gap-8 md:flex">
            {NAV.map((n) => (
              <a key={n.id} href={`#${n.id}`} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                {n.label}
              </a>
            ))}
            <a href="#contact" className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-all hover:shadow-gold">
              Hire me
            </a>
          </nav>
          <button onClick={() => setOpen(!open)} className="md:hidden" aria-label="Menu">
            <div className="space-y-1.5">
              <span className="block h-0.5 w-6 bg-foreground" />
              <span className="block h-0.5 w-6 bg-foreground" />
              <span className="block h-0.5 w-6 bg-foreground" />
            </div>
          </button>
        </div>
        {open && (
          <div className="border-t border-border bg-background md:hidden">
            <div className="flex flex-col px-6 py-4">
              {NAV.map((n) => (
                <a key={n.id} href={`#${n.id}`} onClick={() => setOpen(false)} className="py-2 text-sm text-muted-foreground">
                  {n.label}
                </a>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* HERO */}
      <section id="top" className="relative overflow-hidden bg-gradient-warm pt-32 pb-24 md:pt-44 md:pb-32">
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-gold/20 blur-3xl animate-float" />
        <div className="absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-navy/10 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-6">
          <div className="grid items-center gap-12">
            <div>
              <Reveal>
                <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-gold/40 bg-card/60 px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-gold" /> Available for new projects
                </p>
              </Reveal>
              <Reveal delay={100}>
                <h1 className="font-serif text-5xl leading-[1.05] text-balance md:text-7xl">
                  Adebisi <em className="font-medium text-gold">Oluwaferanmi</em> <br className="hidden md:block" />
                  <em className="font-medium">Michael</em>.
                </h1>
              </Reveal>
              <Reveal delay={200}>
                <p className="mt-8 max-w-xl text-lg leading-relaxed text-muted-foreground">
                  I'm Adebisi Feranmi, an academic and content writer helping scholars, publications, and thoughtful brands turn complex ideas into clear, beautifully-argued writing.
                </p>
              </Reveal>
              <Reveal delay={300}>
                <div className="mt-10 flex flex-wrap gap-4">
                  <a href="#work" className="rounded-full bg-primary px-7 py-3.5 text-sm font-medium text-primary-foreground shadow-soft transition-all hover:translate-y-[-2px] hover:shadow-gold">
                    View my work
                  </a>
                  <a href="#contact" className="group inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-7 py-3.5 text-sm font-medium transition-all hover:border-gold">
                    Contact me
                    <span className="transition-transform group-hover:translate-y-0.5">↓</span>
                  </a>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="border-y border-border bg-card">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 py-12 md:grid-cols-4">
          {STATS.map((s, i) => (
            <Reveal key={s.l} delay={i * 80}>
              <div className="text-center">
                <div className="font-serif text-4xl font-semibold text-gold md:text-5xl">{s.n}</div>
                <div className="mt-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">{s.l}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ABOUT */}
      <Section id="about" eyebrow="About" title="A writer who reads closely, thinks slowly, and ships on time.">
        <div className="grid gap-12 md:grid-cols-[1fr_1.3fr]">
          <Reveal>
            <div className="sticky top-28 rounded-3xl bg-gradient-warm p-8 shadow-soft">
              <div className="font-serif text-2xl">Adebisi Feranmi</div>
              <div className="mt-6 space-y-3 text-sm">
                <Row label="Based" value="Ibadan, Nigeria" />
                <Row label="Languages" value="English" />
                <Row label="Response" value="Within 24 hours" />
                <Row label="Rates" value="Project-based" />
              </div>
            </div>
          </Reveal>
          <Reveal delay={150}>
            <div className="space-y-5 text-sm leading-relaxed text-muted-foreground">
              <p>I am a versatile academic writer with over 2 years of experience in academic research, writing, editing, and proofreading. I have strong skills in research methodology, manuscript preparation, critical analysis, citation management, dissertation writing, and report writing.</p>
              <p>With a background in Nursing Science and healthcare, I can support academic projects in medical, clinical, public health, nursing, and health science-related disciplines. I am committed to producing scholarly, original, and well-referenced content that meets client requirements, academic guidelines, and deadlines.</p>
              <p>I value clear communication, accuracy, originality, timely delivery, and client satisfaction. My goal is to help students, researchers, and professionals develop polished academic work that meets rigorous scholarly standards.</p>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* SERVICES */}
      <Section id="services" eyebrow="Services" title="What I do" muted>
        <div className="grid gap-6 md:grid-cols-2">
          {SERVICES.map((s, i) => (
            <Reveal key={s.title} delay={i * 100}>
              <div className="group relative h-full overflow-hidden rounded-2xl border border-border bg-card p-8 transition-all hover:-translate-y-1 hover:border-gold hover:shadow-soft">
                <div className="mb-5 text-3xl">{s.icon}</div>
                <h3 className="font-serif text-2xl">{s.title}</h3>
                <p className="mt-3 leading-relaxed text-muted-foreground">{s.desc}</p>
                <div className="absolute bottom-0 left-0 h-1 w-0 bg-gold transition-all duration-500 group-hover:w-full" />
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* FEATURED + WORK */}
      <Section id="work" eyebrow="Selected Work" title="Featured writing & research">
        <Reveal>
          <div className="mb-10 flex flex-wrap gap-2">
            {CATS.map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={`rounded-full border px-5 py-2 text-sm transition-all ${
                  filter === c
                    ? "border-gold bg-gold text-ink shadow-gold"
                    : "border-border bg-card text-muted-foreground hover:border-gold/60 hover:text-foreground"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </Reveal>
        <div className="grid gap-6 md:grid-cols-2">
          {filtered.map((w, i) => (
            <Reveal key={w.title} delay={i * 80}>
              <article className="group flex h-full flex-col rounded-2xl border border-border bg-card p-8 transition-all hover:border-gold hover:shadow-soft">
                <div className="mb-4 flex items-center justify-between">
                  <span className="rounded-full bg-secondary px-3 py-1 text-xs uppercase tracking-wider text-secondary-foreground">{w.cat}</span>
                </div>
                <h3 className="font-serif text-2xl leading-snug transition-colors group-hover:text-gold">{w.title}</h3>
                <p className="mt-4 flex-1 leading-relaxed text-muted-foreground">{w.abstract}</p>
                <a href={w.link} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-foreground">
                  View sample <span className="transition-transform group-hover:translate-x-1">→</span>
                </a>
              </article>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* SKILLS */}
      <Section id="skills" eyebrow="Toolkit" title="Skills & tools I work with" muted>
        <div className="grid gap-6 md:grid-cols-2">
          {SKILLS.map((s, i) => (
            <Reveal key={s.group} delay={i * 100}>
              <div className="rounded-2xl border border-border bg-card p-8">
                <h3 className="font-serif text-xl text-gold">{s.group}</h3>
                <div className="mt-5 flex flex-wrap gap-2">
                  {s.items.map((it) => (
                    <span key={it} className="rounded-lg border border-border bg-background px-3.5 py-1.5 text-sm text-foreground">
                      {it}
                    </span>
                  ))}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* TESTIMONIALS */}
      <Section id="testimonials" eyebrow="Testimonials" title="What people say">
        <div className="grid gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <Reveal key={t.name} delay={i * 100}>
              <div className="flex h-full flex-col justify-between rounded-2xl border border-border bg-card p-8">
                <p className="italic leading-relaxed text-muted-foreground">"{t.quote}"</p>
                <div className="mt-6">
                  <div className="font-serif font-medium">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.role}</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* CONTACT */}
    <section id="contact" className="bg-gradient-ink py-24 text-cream md:py-32">
  <div className="mx-auto grid max-w-6xl gap-16 px-6 md:grid-cols-[1fr_1.1fr]">
    <Reveal>
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-gold">Get in touch</p>
        <h2 className="mt-4 font-serif text-4xl leading-tight md:text-5xl">
          Have a project that deserves careful writing?
        </h2>
        <p className="mt-6 max-w-md text-cream/70">
          Tell me a little about the work — a dissertation chapter, a feature, a research brief — and I'll get back within a day.
        </p>
        <div className="mt-10 space-y-3 text-sm">
          <a href="mailto:feranmim92@gmail.com" className="block gold-underline text-cream">feranmim92@gmail.com</a>
          <div className="text-cream/60">Ibadan, Nigeria · GMT</div>
        </div>
      </div>
    </Reveal>
    <Reveal delay={150}>
      <form
        onSubmit={send}
        className="rounded-3xl border border-cream/10 bg-cream/5 p-8 backdrop-blur md:p-10"
      >
        <div className="grid gap-5">
          <Field label="Your name" id="name" />
          <Field label="Email" id="email" type="email" />
          <Field label="Project type" id="type" placeholder="Academic, content, research..." />
          <div>
            <label htmlFor="msg" className="text-xs uppercase tracking-[0.18em] text-cream/60">Tell me about it</label>
            <textarea id="msg" rows={5} required className="mt-2 w-full rounded-xl border border-cream/15 bg-transparent px-4 py-3 text-cream outline-none transition-colors placeholder:text-cream/30 focus:border-gold" />
          </div>
          <button onClick={send} className="mt-2 rounded-full bg-gold px-7 py-3.5 text-sm font-semibold text-ink shadow-gold transition-transform hover:-translate-y-0.5">
            Send message
          </button>
        </div>
      </form>
    </Reveal>
  </div>
</section>
    </div>
  );
}

// --- SUB-COMPONENTS ---
function Section({ id, eyebrow, title, children, muted = false }: { id: string; eyebrow: string; title: string; children: ReactNode; muted?: boolean }) {
  return (
    <section id={id} className={`${muted ? "bg-muted/40" : ""} py-24 md:py-32`}>
      <div className="mx-auto max-w-6xl px-6">
        <Reveal>
          <p className="text-xs uppercase tracking-[0.25em] text-gold">{eyebrow}</p>
          <h2 className="mt-4 max-w-3xl font-serif text-4xl leading-tight text-balance md:text-5xl">{title}</h2>
          <div className="mt-4 h-px w-16 bg-gold" />
        </Reveal>
        <div className="mt-14">{children}</div>
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border/60 pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function Field({ label, id, type = "text", placeholder }: { label: string; id: string; type?: string; placeholder?: string }) {
  return (
    <div>
      <label htmlFor={id} className="text-xs uppercase tracking-[0.18em] text-cream/60">{label}</label>
      <input id={id} type={type} required placeholder={placeholder} className="mt-2 w-full rounded-xl border border-cream/15 bg-transparent px-4 py-3 text-cream outline-none transition-colors placeholder:text-cream/30 focus:border-gold" />
    </div>
  );
}