type BulletListProps = {
  items: string[]
}

export function BulletList({ items }: BulletListProps) {
  return (
    <ul className="my-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  )
}
