import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowRight, BarChart3, Building2, CalendarDays, Check, FileSignature, Globe, Mail, MapPin, Menu, ShieldCheck, Users } from "lucide-react"
import { getOrgContext, homeFor } from "@/lib/org"
import "./landing.css"

export const dynamic = "force-dynamic"
export const metadata = {
  title: { absolute: "Success Management – drift, vagter og tilbud samlet ét sted" },
  description: "Administrationssystem til servicevirksomheder: vagtplan, GPS-check-ind, timer, tilbud, mail og statistik. Flere virksomheder, ét login.",
  robots: { index: true, follow: true },
}

const nav = [
  ["#funktioner", "Funktioner"],
  ["#saadan", "Sådan virker det"],
  ["#priser", "Priser"],
  ["#kontakt", "Kontakt"],
]

const features = [
  { icon: CalendarDays, title: "Vagtplan", text: "Månedskalender med træk-valg af dage, faste gentagelser og ledige vagter, medarbejderne selv kan tage." },
  { icon: MapPin, title: "GPS-check-ind", text: "Medarbejderne tjekker ind og ud på telefonen. Du ser med det samme, hvis nogen er langt fra stedet." },
  { icon: FileSignature, title: "Tilbud", text: "Flotte tilbud med jeres logo. Kunden åbner et link, gemmer som PDF og accepterer online." },
  { icon: Mail, title: "Mail og indbakke", text: "Henvendelser fra hjemmesiden, jeres svar og kundens svar samlet i én tråd – med signatur og banner." },
  { icon: BarChart3, title: "Timer og statistik", text: "Timer pr. medarbejder med eksport til løn og cookieløs besøgsstatistik fra hjemmesiden." },
  { icon: Building2, title: "Flere virksomheder", text: "Hver virksomhed har egne data, brugere, farver og afsender. Skift mellem dem med ét klik." },
]

const steps = [
  { n: "01", title: "Opret virksomheden", text: "Logo, farver, CVR og afsender. Systemet klæder sig om til jeres brand." },
  { n: "02", title: "Forbind hjemmesiden", text: "Kontaktformular og statistik sendes ind med en API-nøgle – også fra Wix og WordPress." },
  { n: "03", title: "Invitér teamet", text: "Medarbejdere får en mail, vælger adgangskode og ser deres vagter på telefonen." },
]

const plans = [
  { name: "Start", price: "Kontakt os", text: "Til den mindre virksomhed", items: ["Op til 5 medarbejdere", "Vagtplan og check-ind", "Tilbud og mail"] },
  { name: "Pro", price: "Kontakt os", text: "Mest valgt", items: ["Ubegrænset medarbejdere", "Eget maildomæne", "Hjemmeside-API og statistik", "Prioriteret support"], featured: true },
  { name: "Koncern", price: "Kontakt os", text: "Flere virksomheder", items: ["Flere selskaber, ét login", "Fælles overblik", "Opsætning og import"] },
]

export default async function Home() {
  const ctx = await getOrgContext()
  if (ctx) redirect(homeFor(ctx))
  const year = new Date().getFullYear()

  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-wrap lp-nav-inner">
          <a href="#top" className="lp-logo" aria-label="Success Management – til toppen">
            <span className="lp-logo-mark" aria-hidden="true">S</span>
            <span>Success <strong>Management</strong></span>
          </a>
          <nav className="lp-links" aria-label="Hovedmenu">
            {nav.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
          </nav>
          <div className="lp-nav-actions">
            <Link href="/auth/login" className="lp-btn lp-btn-ghost">Log ind</Link>
            <a href="#kontakt" className="lp-btn lp-btn-gold lp-hide-sm">Book en demo</a>
            <details className="lp-mobile">
              <summary aria-label="Åbn menu"><Menu className="size-5" /></summary>
              <nav aria-label="Mobilmenu">
                {nav.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
                <a href="#kontakt" className="lp-btn lp-btn-gold">Book en demo</a>
              </nav>
            </details>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="lp-hero">
          <div className="lp-wrap lp-hero-grid">
            <div>
              <p className="lp-eyebrow">Til servicevirksomheder</p>
              <h1>Drift, vagter og tilbud – <em>samlet ét sted.</em></h1>
              <p className="lp-lead">Success Management er administrationssystemet bag Success Cleaning. Planlæg vagter, lad medarbejderne tjekke ind med GPS, send tilbud kunderne kan acceptere online, og svar på henvendelser fra hjemmesiden – for én eller flere virksomheder.</p>
              <div className="lp-cta">
                <a href="#kontakt" className="lp-btn lp-btn-gold">Book en demo <ArrowRight className="size-4" /></a>
                <a href="#funktioner" className="lp-btn lp-btn-outline">Se funktionerne</a>
              </div>
              <ul className="lp-trust">
                <li><Check className="size-4" /> Danske data og support</li>
                <li><Check className="size-4" /> Ingen cookies i statistikken</li>
                <li><Check className="size-4" /> Virker på telefonen</li>
              </ul>
            </div>
            <div className="lp-mock" aria-hidden="true">
              <div className="lp-mock-bar"><i /><i /><i /></div>
              <div className="lp-mock-body">
                <div className="lp-mock-side">
                  <b /><span /><span className="on" /><span /><span /><span />
                </div>
                <div className="lp-mock-main">
                  <div className="lp-mock-stats"><div><strong>12</strong><small>vagter i dag</small></div><div><strong>4</strong><small>tjekket ind</small></div><div><strong>3</strong><small>nye leads</small></div></div>
                  <div className="lp-mock-cal">
                    {Array.from({ length: 28 }, (_, i) => <span key={i} className={[3, 4, 10, 11, 12, 17, 18, 24, 25].includes(i) ? "has" : i === 12 ? "today" : ""} />)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="funktioner" className="lp-section">
          <div className="lp-wrap">
            <p className="lp-eyebrow">Funktioner</p>
            <h2>Alt det, hverdagen kræver</h2>
            <p className="lp-sub">Bygget sammen med en rengøringsvirksomhed – til alle, der sender folk ud til kunder.</p>
            <div className="lp-features">
              {features.map(({ icon: Icon, title, text }) => (
                <article key={title} className="lp-card">
                  <span className="lp-icon"><Icon className="size-5" /></span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="saadan" className="lp-section lp-section-navy">
          <div className="lp-wrap">
            <p className="lp-eyebrow">Sådan virker det</p>
            <h2>I gang på en eftermiddag</h2>
            <div className="lp-steps">
              {steps.map((s) => (
                <article key={s.n}><span>{s.n}</span><h3>{s.title}</h3><p>{s.text}</p></article>
              ))}
            </div>
            <div className="lp-split">
              <div><ShieldCheck className="size-6" /><h3>Adskilte virksomheder</h3><p>Data, brugere, branding og mails blandes aldrig. Hver virksomhed er sin egen verden.</p></div>
              <div><Users className="size-6" /><h3>Ét login</h3><p>Arbejder du i flere selskaber, bruger du samme login og skifter i menuen.</p></div>
              <div><Globe className="size-6" /><h3>Jeres hjemmeside</h3><p>Formularer og statistik lander direkte i indbakken – uanset hvad siden er bygget i.</p></div>
            </div>
          </div>
        </section>

        <section id="priser" className="lp-section">
          <div className="lp-wrap">
            <p className="lp-eyebrow">Priser</p>
            <h2>En plan, der passer</h2>
            <p className="lp-sub">Vi tilpasser prisen efter antal medarbejdere og virksomheder. Skriv, så finder vi den rigtige løsning.</p>
            <div className="lp-plans">
              {plans.map((p) => (
                <article key={p.name} className={`lp-plan${p.featured ? " is-featured" : ""}`}>
                  <p className="lp-plan-tag">{p.text}</p>
                  <h3>{p.name}</h3>
                  <p className="lp-plan-price">{p.price}</p>
                  <ul>{p.items.map((i) => <li key={i}><Check className="size-4" /> {i}</li>)}</ul>
                  <a href="#kontakt" className={`lp-btn ${p.featured ? "lp-btn-gold" : "lp-btn-outline"}`}>Hør mere</a>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="kontakt" className="lp-section lp-contact">
          <div className="lp-wrap lp-contact-grid">
            <div>
              <p className="lp-eyebrow">Kontakt</p>
              <h2>Se systemet i brug</h2>
              <p className="lp-sub">Vi viser dig Success Management på 20 minutter – online eller hos jer.</p>
            </div>
            <div className="lp-contact-card">
              <a href="mailto:rene@successcleaningaps.dk?subject=Demo%20af%20Success%20Management" className="lp-btn lp-btn-gold">Skriv til os <Mail className="size-4" /></a>
              <a href="tel:+4550907907" className="lp-btn lp-btn-outline">Ring +45 50 90 79 07</a>
              <p>Tingvejen 14N, 8600 Silkeborg</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-grid">
          <div>
            <a href="#top" className="lp-logo lp-logo-light"><span className="lp-logo-mark" aria-hidden="true">S</span><span>Success <strong>Management</strong></span></a>
            <p>Administration, vagter og tilbud for servicevirksomheder.</p>
          </div>
          <nav aria-label="Produkt"><h4>Produkt</h4>{nav.map(([href, label]) => <a key={href} href={href}>{label}</a>)}</nav>
          <nav aria-label="Konto"><h4>Konto</h4><Link href="/auth/login">Log ind</Link><a href="#kontakt">Book en demo</a></nav>
          <div><h4>Kontakt</h4><p>Success Cleaning ApS<br />Tingvejen 14N, 8600 Silkeborg<br />CVR 45187608</p><p><a href="mailto:rene@successcleaningaps.dk">rene@successcleaningaps.dk</a><br /><a href="tel:+4550907907">+45 50 90 79 07</a></p></div>
        </div>
        <div className="lp-wrap lp-footer-bottom"><span>© {year} Success Management</span><a href="https://www.successcleaningaps.dk" target="_blank" rel="noreferrer">successcleaningaps.dk</a></div>
      </footer>
    </div>
  )
}
