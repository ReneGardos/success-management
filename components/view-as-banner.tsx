import { Eye } from "lucide-react"
import type { ViewAs } from "@/lib/view-as"

/** Shown on employee/customer screens while an admin previews them. */
export default function ViewAsBanner({ viewAs }: { viewAs: ViewAs }) {
  return (
    <div className="viewas-bar" role="status">
      <Eye className="size-4" aria-hidden="true" />
      <span>Du ser {viewAs.type === "employee" ? "medarbejder-appen" : "kundeportalen"} som <strong>{viewAs.name}</strong> · kun visning</span>
      <a href="/admin/se-som">Vælg en anden</a>
      <a href="/org/se-som?stop=1" className="viewas-stop">Afslut</a>
    </div>
  )
}
