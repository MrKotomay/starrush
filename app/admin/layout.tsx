import type { Metadata } from "next"
import "@prisma/studio-core/ui/index.css"

export const metadata: Metadata = {
  title: {
    default: "Admin",
    template: "%s | StarRush Admin",
  },
  description: "StarRush operations and game admin panel",
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(28,182,140,0.16),_transparent_40%),linear-gradient(180deg,_rgba(10,14,18,0.98),_rgba(10,14,18,1))] text-foreground">
      {children}
    </div>
  )
}
