type SubHeadingProps = {
  level?: 3 | 4
  children: React.ReactNode
}

export function SubHeading({ level = 3, children }: SubHeadingProps) {
  const Tag = level === 3 ? "h3" : "h4"
  const className =
    level === 3
      ? "mt-8 mb-4 text-lg font-semibold tracking-tight text-foreground first:mt-0"
      : "mt-6 mb-3 text-base font-semibold text-foreground"

  return <Tag className={className}>{children}</Tag>
}
