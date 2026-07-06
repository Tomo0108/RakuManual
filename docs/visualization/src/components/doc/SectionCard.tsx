import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

type SectionCardProps = {
  id: string
  title: string
  description?: string
  badge?: string
  children: React.ReactNode
}

export function SectionCard({
  id,
  title,
  description,
  badge,
  children,
}: SectionCardProps) {
  return (
    <Card id={id} className="scroll-mt-24 border shadow-sm">
      <CardHeader className="border-b bg-muted/20 pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="text-xl font-semibold tracking-tight">
            {title}
          </CardTitle>
          {badge && (
            <Badge variant="secondary" className="font-normal">
              {badge}
            </Badge>
          )}
        </div>
        {description && (
          <CardDescription className="text-base leading-relaxed">
            {description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="pt-6">{children}</CardContent>
    </Card>
  )
}
