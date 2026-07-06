type AcceptanceListProps = {
  items: string[]
}

export function AcceptanceList({ items }: AcceptanceListProps) {
  return (
    <ul className="my-3 space-y-2">
      {items.map((item, i) => (
        <li
          key={i}
          className="flex gap-2 text-sm leading-relaxed text-muted-foreground before:mt-1.5 before:size-1.5 before:shrink-0 before:rounded-full before:bg-foreground before:content-['']"
        >
          {item}
        </li>
      ))}
    </ul>
  )
}
