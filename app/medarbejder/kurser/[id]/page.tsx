import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CheckCircle2 } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/admin"
import { employeePortal } from "@/lib/portal"
import { Markdown } from "@/lib/md"
import { completeCourse } from "../actions"

export const dynamic = "force-dynamic"
export const metadata = { title: "Kursus" }

function embed(url: string | null) {
  if (!url) return null
  const yt = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/.exec(url)
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`
  const vm = /vimeo\.com\/(?:video\/)?(\d+)/.exec(url)
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`
  return null
}

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const p = await employeePortal("/medarbejder/kurser")
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const db = createAdminClient()
  const [{ data: c }, { data: done }] = await Promise.all([
    db.from("org_courses").select("*").eq("org_id", p.org.id).eq("id", id).maybeSingle(),
    db.from("course_completions").select("completed_at").eq("org_id", p.org.id).eq("course_id", id).eq("employee_id", p.userId).maybeSingle(),
  ])
  if (!c) notFound()
  const video = embed(c.video_url)
  return (
    <main className="pt-page">
      <Link href="/medarbejder/kurser" className="pt-link"><ArrowLeft className="size-4 inline" /> Kurser</Link>
      <header className="pt-head"><h1>{c.title}</h1>{c.summary && <p>{c.summary}</p>}</header>
      {video && <div className="course-video"><iframe src={video} title={c.title} allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen loading="lazy" /></div>}
      <section className="pt-card"><Markdown text={c.content} /></section>
      {done ? <p className="field-ok"><CheckCircle2 className="size-5 inline" /> Gennemført {new Date(done.completed_at).toLocaleDateString("da-DK")}</p>
        : !p.preview && <form action={completeCourse.bind(null, c.id)}><button type="submit" className="field-btn field-btn-primary"><CheckCircle2 className="size-5" /> Jeg har læst og forstået</button></form>}
    </main>
  )
}
