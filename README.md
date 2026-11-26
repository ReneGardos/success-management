# Success Management

Multi-tenant administrationssystem til servicevirksomheder: vagtplan, GPS-check-ind, timer, steder, mail-indbakke, tilbud med offentligt link, brugere, statistik og indstillinger. Hver virksomhed (organisation) har sine egne data, brugere, branding og mails.

Next.js (App Router) · Tailwind · Supabase · Resend · Vercel.

## Virksomheder og roller

- `organizations` er virksomhederne (tenants). Alle forretningstabeller har `org_id`.
- `memberships` (user_id, org_id, rolle `owner` / `admin` / `employee` / `customer`). Samme login kan være medlem af flere virksomheder og skifter i menuen eller på `/vaelg-virksomhed`.
- `platform_admins` er superadmins (`/superadmin`): de opretter virksomheder, sætter plan og maildomæne.
- Aktiv virksomhed ligger i cookien `sm_org` og bliver altid tjekket mod medlemskaberne (`lib/org.ts`).
- Serverkoden bruger service role og filtrerer **altid** på `org_id`. RLS (via security definer-hjælpere `is_org_admin()`, `is_org_staff()` m.fl.) og triggeren `check_same_org()` er ekstra sikring mod krydsreferencer.

## Hjemmesider som kilder

Under **Admin → Hjemmesider og API** oprettes hjemmesider og API-nøgler pr. virksomhed.

**Kontaktformular / tilbudsønske** (server til server – anbefalet):

```http
POST /api/v1/contact
Authorization: Bearer smk_live_…
Content-Type: application/json

{ "name": "…", "email": "…", "phone": "…", "company": "…", "service": "…", "message": "…", "source": "kontaktformular", "page": "/kontakt" }
```

Send gerne `x-visitor-ip` med, så rate-limit gælder den besøgende og ikke serveren. Fra browseren kan man i stedet sende `"site": "<site-id>"` uden nøgle; det accepteres kun fra hjemmesidens eget domæne.

**Besøgsstatistik** (cookieløs):

```html
<script defer src="https://APP/sm-track.js" data-site="SITE_ID"></script>
```

eller `POST /api/v1/track` med `{ site, path, referrer, utm, width }`.

**Wix (1-2-3 Rent):** statistik-scriptet indsættes under Indstillinger → Brugerdefineret kode. Kontaktformularen sendes fra en Velo backend-funktion (`wix-fetch`) med API-nøglen gemt i Secrets Manager.

## Mail

- Afsender: `org.mail_from_name <mail_from_local@mail_domain>`, når domænet er verificeret i Resend (Superadmin → “Opret / tjek domæne i Resend”). Ellers bruges `RESEND_EMAIL_DOMAIN`.
- Svar: `<inbound_alias>+<henvendelse-id>@RESEND_INBOUND_DOMAIN`. Webhooken `/api/email/inbound` finder virksomheden ud fra aliaset/tråden.
- Signatur, bannere, logo og farver kommer fra virksomhedens indstillinger.

## Database

Migrationer ligger i `supabase/migrations`. Supabase-projekt: `tdsjrglubylnihdrvkpf`.
Data fra det gamle projekt (`otckghqmtklguthxosvi`) er flyttet ind under Success Cleaning ApS 26-11-2026. Brugerne har beholdt deres adgangskoder.

## Miljøvariabler

Se `.env.example`.
