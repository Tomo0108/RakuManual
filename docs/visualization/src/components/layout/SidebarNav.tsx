import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

export type NavItem = {
  id: string
  label: string
  children?: { id: string; label: string }[]
}

type SidebarNavProps = {
  items: NavItem[]
  activeId: string
}

export function SidebarNav({ items, activeId }: SidebarNavProps) {
  return (
    <aside className="hidden w-64 shrink-0 lg:block">
      <div className="sticky top-6 rounded-lg border bg-card p-4 shadow-sm">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          目次
        </p>
        <ScrollArea className="h-[calc(100vh-8rem)]">
          <nav className="space-y-1">
            {items.map((item) => (
              <div key={item.id}>
                <a
                  href={`#${item.id}`}
                  className={cn(
                    "block rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted",
                    activeId === item.id
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {item.label}
                </a>
                {item.children && (
                  <div className="ml-3 space-y-0.5 border-l pl-2">
                    {item.children.map((child) => (
                      <a
                        key={child.id}
                        href={`#${child.id}`}
                        className={cn(
                          "block rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-muted",
                          activeId === child.id
                            ? "font-medium text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {child.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </ScrollArea>
        <Separator className="my-4" />
        <p className="text-xs text-muted-foreground">v0.1.0 · 2026-07-05</p>
      </div>
    </aside>
  )
}
