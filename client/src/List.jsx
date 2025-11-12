export function List({ items, render }) {
  return (
    <ul>
      {items.map((item, index) => (
        <li key={item.id || item.uid || index}>{render(item)}</li>
      ))}
    </ul>
  )
}
