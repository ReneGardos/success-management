import { customerPortal } from "@/lib/portal"
import { loadMessages, markRead, threadFor } from "@/lib/backend/chat"
import ChatView from "@/components/chat-view"
import { chatUploadTarget, registerChatPhoto, sendChat } from "@/app/beskeder/actions"

export const dynamic = "force-dynamic"
export const metadata = { title: "Beskeder" }

export default async function CustomerMessages() {
  const p = await customerPortal("/kunde/beskeder")
  const cid = p.customerIds[0]
  if (!cid) return <main className="pt-page"><header className="pt-head"><h1>Beskeder</h1></header><p className="field-err">Din bruger er ikke koblet til en kunde endnu. Kontakt {p.org.name}.</p></main>
  const thread = await threadFor(p.org.id, "customer", cid, !p.preview)
  const messages = thread ? await loadMessages(p.org.id, thread.id) : []
  if (thread && !p.preview) await markRead(thread, "member")
  return (
    <main className="pt-page">
      <header className="pt-head"><h1>Beskeder</h1><p>Skriv direkte til {p.org.name}. I får svar her og som notifikation.</p></header>
      <ChatView
        messages={messages}
        side="member"
        send={thread && !p.preview ? sendChat.bind(null, thread.id) : undefined}
        uploadTarget={thread && !p.preview ? chatUploadTarget.bind(null, thread.id) : undefined}
        registerPhoto={thread && !p.preview ? registerChatPhoto.bind(null, thread.id) : undefined}
        emptyText="Har I spørgsmål, ønsker eller noget, vi skal vide? Skriv her."
      />
    </main>
  )
}
