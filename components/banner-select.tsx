import type { Banner } from "@/lib/backend/mail-settings"

/** Banner picker for mail forms; defaults to the organization's standard banner. */
export default function BannerSelect({ banners, defaultId }: { banners: Banner[]; defaultId: string }) {
  return (
    <label>Banner i mailen
      <select name="banner_id" defaultValue={banners.some((b) => b.id === defaultId) ? defaultId : "none"}>
        <option value="none">Intet banner</option>
        {banners.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
    </label>
  )
}
