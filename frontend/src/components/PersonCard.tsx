import type { PersonContact } from "../types";
import { Links } from "./Links";

export function PersonCard({
  p,
  onSave,
  saved,
}: {
  p: PersonContact;
  onSave?: () => void;
  saved?: boolean;
}) {
  return (
    <article
      style={{
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "1rem",
        background: "var(--panel)",
        display: "grid",
        gap: "0.5rem",
      }}
    >
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
        {p.avatarUrl ? (
          <img
            src={p.avatarUrl}
            alt=""
            width={48}
            height={48}
            style={{ borderRadius: "50%" }}
          />
        ) : null}
        <div>
          <div style={{ fontWeight: 600 }}>{p.name || p.login}</div>
          <a href={p.githubUrl} target="_blank" rel="noreferrer">
            @{p.login}
          </a>
        </div>
      </div>
      <div style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
        {[p.location, p.company].filter(Boolean).join(" · ") || "—"}
      </div>
      {p.rawBio ? (
        <p style={{ margin: 0, fontSize: "0.9rem", whiteSpace: "pre-wrap" }}>{p.rawBio}</p>
      ) : null}
      <dl style={{ margin: 0, display: "grid", gap: "0.35rem", fontSize: "0.9rem" }}>
        <div>
          <dt style={{ display: "inline", color: "var(--muted)" }}>Email </dt>
          <dd style={{ display: "inline", margin: 0 }}>
            {p.email ? (
              <a href={`mailto:${p.email}`}>{p.email}</a>
            ) : (
              <span style={{ color: "var(--muted)" }}>not public in API</span>
            )}
          </dd>
        </div>
        <div>
          <dt style={{ display: "inline", color: "var(--muted)" }}>Blog </dt>
          <dd style={{ display: "inline", margin: 0 }}>
            {p.blog ? (
              <a href={p.blog} target="_blank" rel="noreferrer">
                {p.blog}
              </a>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div>
          <dt style={{ display: "inline", color: "var(--muted)" }}>Twitter / X </dt>
          <dd style={{ display: "inline", margin: 0 }}>
            {p.twitterUrl ? (
              <a href={p.twitterUrl} target="_blank" rel="noreferrer">
                @{p.twitterUsername}
              </a>
            ) : (
              "—"
            )}
          </dd>
        </div>
        {p.phoneNumbers.length > 0 ? (
          <div>
            <dt style={{ display: "inline", color: "var(--muted)" }}>Phones (from bio) </dt>
            <dd style={{ display: "inline", margin: 0 }}>{p.phoneNumbers.join(", ")}</dd>
          </div>
        ) : null}
      </dl>
      <Links label="LinkedIn" urls={p.linkedInUrls} />
      <Links label="Other links (from bio/blog)" urls={p.otherSocialUrls} />
      {onSave ? (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
          <button
            type="button"
            onClick={onSave}
            style={{
              padding: "0.5rem 0.75rem",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: saved ? "var(--panel)" : "var(--accent)",
              color: saved ? "var(--muted)" : "#0f1419",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {saved ? "Saved — update snapshot" : "Save to table"}
          </button>
          {saved ? (
            <span style={{ fontSize: "0.85rem", color: "var(--ok)" }}>In your saved list</span>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
