import { ImagePlus, Send, Trash2 } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { loadBanners, loadMailSettings } from "@/lib/backend/mail-settings"
import { renderHtml, senderFor } from "@/lib/backend/mail"
import { addBanner, deleteBanner, saveMailSettings, saveOrganization, sendTestMail, toggleBanner } from "./actions"
import { defaultIntro, defaultTerms } from "@/lib/backend/quotes"
import { orgSender } from "@/lib/org"

export const dynamic = "force-dynamic"

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ gemt?: string; banner?: string; test?: string; fejl?: string; virksomhed?: string }> }) {
  const { user, org } = await requireRolePage(["admin"], "/admin/indstillinger")
  const sp = await searchParams
  const [{ settings, stored }, banners, me] = await Promise.all([loadMailSettings(org), loadBanners(org.id, true), senderFor(org, user.id, user.email ?? null)])
  const defaultBanner = banners.find((b) => b.id === settings.default_banner_id) ?? null
  const preview = renderHtml(org, `Hej Maria\n\nTak for en god snak i dag. Hermed et par linjer, så du kan se, hvordan vores mails ser ud for kunderne.`, me, "", { settings, banner: settings.default_banner_id === "none" ? null : defaultBanner })

  return (
    <main className="admin-shell">
      <div className="admin-workspace admin-workspace-wide">
        <div className="admin-workspace-heading">
          <div><h1>Indstillinger · {org.name}</h1><p>Virksomhedsoplysninger, farver og logo bruges i admin, mails, tilbud og offentlige sider. Din personlige signatur (navn, titel, telefon) sætter du under Mail → “Min mailsignatur”.</p></div>
        </div>

        {sp.virksomhed && <p className="admin-notice is-ok" role="status">Virksomheden er gemt.</p>}
        {sp.gemt && <p className="admin-notice is-ok" role="status">Indstillingerne er gemt.</p>}
        {sp.banner && <p className="admin-notice is-ok" role="status">Banneret er tilføjet.</p>}
        {sp.test && <p className="admin-notice is-ok" role="status">Testmail sendt til {sp.test}. Tjek indbakken (og evt. spam).</p>}
        {sp.fejl && <p className="admin-notice is-error" role="alert">{sp.fejl}</p>}
        {!stored && <p className="admin-notice">Standardindstillingerne bruges, indtil du gemmer første gang.</p>}

        <div className="admin-quote-layout">
          <div className="grid gap-4">
            <form action={saveOrganization} className="admin-form">
              <h2>Virksomhed</h2>
              <div className="admin-form-grid">
                <label>Navn *<input name="name" required defaultValue={org.name} /></label>
                <label>Juridisk navn<input name="legal_name" defaultValue={org.legal_name ?? ""} placeholder="Fx Success Cleaning ApS" /></label>
                <label>CVR-nr.<input name="cvr" defaultValue={org.cvr ?? ""} inputMode="numeric" /></label>
                <label>Telefon<input name="phone" defaultValue={org.phone ?? ""} /></label>
                <label className="span-2">Adresse<input name="address" defaultValue={org.address ?? ""} /></label>
                <label>Kontor-email (modtager notifikationer)<input name="office_email" type="email" defaultValue={org.office_email ?? ""} /></label>
                <label>Hjemmeside<input name="website" defaultValue={org.website ?? ""} placeholder="firma.dk" /></label>
              </div>
              <h2>Branding</h2>
              <div className="admin-form-grid">
                <label>Primærfarve<input name="color_primary" type="color" defaultValue={org.color_primary} /></label>
                <label>Accentfarve<input name="color_accent" type="color" defaultValue={org.color_accent} /></label>
                <label>Baggrund<input name="color_background" type="color" defaultValue={org.color_background} /></label>
                <label>Dæmpet farve<input name="color_muted" type="color" defaultValue={org.color_muted} /></label>
                <label className="span-2">Logo (PNG/SVG, maks 2 MB – bruges på lys baggrund)<input name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" /></label>
                <label>…eller link til logo<input name="logo_url" defaultValue={org.logo_url ?? ""} placeholder="https://…" /></label>
                <label>Logo i mails (link, valgfri)<input name="email_logo_url" defaultValue={org.email_logo_url ?? ""} placeholder="Samme som logo" /></label>
              </div>
              <h2>Afsender</h2>
              <div className="admin-form-grid">
                <label>Afsendernavn<input name="mail_from_name" defaultValue={org.mail_from_name ?? ""} placeholder={org.name} /></label>
                <p className="admin-form-hint">Mails sendes som <strong>{orgSender(org)}</strong>.{org.mail_domain_verified ? "" : " Eget domæne aktiveres af superadmin, når det er verificeret i Resend."}</p>
              </div>
              <h2>Standardtekster i tilbud</h2>
              <div className="admin-form-grid">
                <label className="span-2">Indledning<textarea name="quote_default_intro" rows={3} defaultValue={org.quote_default_intro ?? defaultIntro} /></label>
                <label className="span-2">Betingelser (én pr. linje)<textarea name="quote_default_terms" rows={6} defaultValue={org.quote_default_terms ?? defaultTerms} /></label>
                <div className="admin-form-actions span-2"><button type="submit" className="admin-primary">Gem virksomhed</button></div>
              </div>
            </form>

            <form action={saveMailSettings} className="admin-form">
              <h2>Signatur</h2>
              <div className="admin-form-grid">
                <label className="admin-check-row span-2"><input type="checkbox" name="show_logo" defaultChecked={settings.show_logo} /> Vis logo i signaturen</label>
                <label className="span-2">Slogan under navnet<input name="tagline" defaultValue={settings.tagline ?? ""} /></label>
                <label>Firmatelefon<input name="company_phone" defaultValue={settings.company_phone ?? ""} /></label>
                <label>Firma-email<input name="company_email" type="email" defaultValue={settings.company_email ?? ""} /></label>
                <label>Hjemmeside<input name="website" defaultValue={settings.website ?? ""} /></label>
                <label>CVR-nr.<input name="cvr" defaultValue={settings.cvr ?? ""} inputMode="numeric" /></label>
                <label className="span-2">Adresse<input name="address" defaultValue={settings.address ?? ""} /></label>
                <label>Afslutning<input name="closing" defaultValue={settings.closing ?? ""} placeholder="Med venlig hilsen" /></label>
                <span />
                <label>Facebook-link<input name="facebook_url" defaultValue={settings.facebook_url ?? ""} placeholder="facebook.com/…" /></label>
                <label>Instagram-link<input name="instagram_url" defaultValue={settings.instagram_url ?? ""} placeholder="instagram.com/…" /></label>
                <label>LinkedIn-link<input name="linkedin_url" defaultValue={settings.linkedin_url ?? ""} placeholder="linkedin.com/company/…" /></label>
                <span />
                <label className="span-2">Lille tekst nederst (fx fortrolighed)<textarea name="disclaimer" rows={2} defaultValue={settings.disclaimer ?? ""} /></label>
              </div>
              <h2>Banner</h2>
              <div className="admin-form-grid">
                <label>Standardbanner
                  <select name="default_banner_id" defaultValue={settings.default_banner_id ?? "none"}>
                    <option value="none">Intet banner</option>
                    {banners.filter((b) => b.active).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </label>
                <label>Placering
                  <select name="banner_position" defaultValue={settings.banner_position}>
                    <option value="bottom">Under signaturen</option>
                    <option value="top">Øverst i mailen</option>
                  </select>
                </label>
                <p className="admin-form-hint span-2">Du kan altid vælge et andet banner – eller intet – når du sender en mail eller et tilbud.</p>
                <div className="admin-form-actions span-2"><button type="submit" className="admin-primary">Gem indstillinger</button></div>
              </div>
            </form>

            <details className="admin-form" open={banners.length === 0}>
              <summary><ImagePlus className="size-4" aria-hidden="true" /> Tilføj banner</summary>
              <form action={addBanner} className="admin-form-grid">
                <label className="span-2">Navn *<input name="name" required placeholder="Fx Julekampagne 2026" /></label>
                <label className="span-2">Billede (PNG/JPG, maks 2 MB, gerne 1200 × 360 px)<input name="image" type="file" accept="image/png,image/jpeg,image/gif,image/webp" /></label>
                <label className="span-2">…eller link til et billede<input name="image_url" placeholder="https://…" /></label>
                <label>Link ved klik<input name="link_url" placeholder={`${org.website ?? "firma.dk"}/tilbud`} /></label>
                <label>Alternativ tekst<input name="alt_text" placeholder="Beskriv billedet kort" /></label>
                <div className="admin-form-actions span-2"><button type="submit" className="admin-primary">Tilføj banner</button></div>
              </form>
            </details>

            <section className="admin-form">
              <h2>Bannere</h2>
              <div className="adm-banner-list">
                {banners.map((b) => (
                  <article key={b.id} className={`adm-banner${b.active ? "" : " is-off"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={b.image_url} alt={b.alt_text ?? b.name} loading="lazy" />
                    <div>
                      <strong>{b.name}{b.id === settings.default_banner_id ? " · standard" : ""}</strong>
                      {b.link_url && <small>Linker til {b.link_url.replace(/^https?:\/\//, "")}</small>}
                    </div>
                    {(
                      <div className="admin-inline-form">
                        <form action={toggleBanner}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="active" value={String(!b.active)} /><button type="submit">{b.active ? "Skjul" : "Vis"}</button></form>
                        <form action={deleteBanner}><input type="hidden" name="id" value={b.id} /><button type="submit" aria-label={`Slet ${b.name}`}><Trash2 className="size-4" /></button></form>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>

            <form action={sendTestMail} className="admin-form">
              <h2>Test</h2>
              <div className="admin-form-grid">
                <label>Banner i testmailen
                  <select name="banner_id" defaultValue={settings.default_banner_id ?? "none"}>
                    <option value="none">Intet banner</option>
                    {banners.filter((b) => b.active).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </label>
                <div className="admin-form-actions"><button type="submit" className="admin-primary"><Send className="size-4" /> Send testmail til {user.email}</button></div>
              </div>
            </form>
          </div>

          <aside className="admin-quote-preview" aria-label="Forhåndsvisning af mail">
            <p className="admin-eyebrow">Forhåndsvisning (gemte indstillinger)</p>
            <iframe title="Forhåndsvisning af mail" srcDoc={preview} className="adm-mail-preview" sandbox="" />
          </aside>
        </div>
      </div>
    </main>
  )
}
