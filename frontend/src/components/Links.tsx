export function Links({ label, urls }: { label: string; urls: string[] }) {
  if (!urls.length) return null;
  return (
    <div>
      <strong>{label}</strong>
      <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.25rem" }}>
        {urls.map((u) => (
          <li key={u}>
            <a href={u} target="_blank" rel="noreferrer">
              {u}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
