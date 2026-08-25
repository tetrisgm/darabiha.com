const generations = [
  [
    { label: "Grandparent", detail: "Add a name" },
    { label: "Grandparent", detail: "Add a name" },
  ],
  [{ label: "Parent", detail: "Add a name" }],
  [{ label: "You", detail: "Begin here", active: true }],
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--paper)] text-[var(--ink)]">
      <header className="flex h-20 items-center justify-between border-b border-[var(--line)] px-5 sm:px-8 lg:px-12">
        <a className="font-serif text-xl tracking-[-0.02em]" href="/">Darabiha</a>
        <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
          <span className="hidden sm:inline">The Darabi family archive</span>
          <span className="h-1 w-1 rounded-full bg-[var(--accent)]" />
          <button className="rounded-full border border-[var(--line)] bg-white px-4 py-2 font-medium text-[var(--ink)] shadow-sm transition hover:border-[var(--accent)]">
            Family sign in
          </button>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-5rem)] lg:grid-cols-[minmax(0,1fr)_390px]">
        <section className="relative overflow-hidden px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
          <div className="absolute inset-0 tree-grid opacity-45" aria-hidden="true" />
          <div className="relative mx-auto max-w-5xl">
            <div className="mb-10 flex flex-wrap items-end justify-between gap-5">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">Family tree</p>
                <h1 className="max-w-2xl font-serif text-4xl leading-[1.05] tracking-[-0.035em] sm:text-5xl">
                  A living record of where we come from.
                </h1>
              </div>
              <div className="flex gap-2">
                <button className="control-button" aria-label="Zoom out">−</button>
                <button className="control-button min-w-16 text-xs">100%</button>
                <button className="control-button" aria-label="Zoom in">+</button>
              </div>
            </div>

            <div className="relative flex min-h-[580px] flex-col items-center gap-14 rounded-[2rem] border border-[var(--line)] bg-white/60 px-5 py-12 shadow-[0_24px_80px_rgba(62,45,28,0.06)] backdrop-blur-sm sm:px-10">
              <p className="absolute left-6 top-5 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted)]">Three generations · draft</p>
              {generations.map((generation, generationIndex) => (
                <div className="tree-generation relative flex w-full justify-center gap-4 sm:gap-8" key={generationIndex}>
                  {generation.map((person) => (
                    <button className={`person-card ${person.active ? "is-active" : ""}`} key={`${generationIndex}-${person.label}`}>
                      <span className="person-avatar" aria-hidden="true">{person.active ? "D" : "+"}</span>
                      <span className="min-w-0 text-left">
                        <span className="block truncate font-serif text-lg leading-tight">{person.label}</span>
                        <span className="mt-1 block text-xs text-[var(--muted)]">{person.detail}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ))}
              <div className="mt-auto flex max-w-md items-start gap-3 rounded-2xl bg-[var(--wash)] px-5 py-4 text-sm leading-6 text-[var(--muted)]">
                <span className="mt-0.5 text-lg text-[var(--accent)]" aria-hidden="true">✦</span>
                <p>This tree is ready to grow. Tell the family archivist a story, a name, or a relationship and it will suggest the change.</p>
              </div>
            </div>
          </div>
        </section>

        <aside className="flex min-h-[640px] flex-col border-t border-[var(--line)] bg-[var(--sidebar)] lg:border-l lg:border-t-0">
          <div className="border-b border-[var(--line)] px-6 py-6 sm:px-8">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Family archivist</p>
                <h2 className="mt-1 font-serif text-2xl tracking-[-0.025em]">Add to our story</h2>
              </div>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent)] text-sm text-white">✦</span>
            </div>
          </div>

          <div className="flex flex-1 flex-col px-6 py-6 sm:px-8">
            <div className="max-w-[18rem] rounded-2xl rounded-tl-sm border border-[var(--line)] bg-white px-4 py-3 text-sm leading-6 shadow-sm">
              I can help build the tree from what you remember. Try “Add my father,” share a family story, or attach a document or photo.
            </div>
            <div className="mt-7">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Things you can ask</p>
              <div className="flex flex-wrap gap-2">
                {["Add a relative", "Record a marriage", "Attach a photo", "Tell a family story"].map((prompt) => (
                  <button className="prompt-chip" key={prompt}>{prompt}</button>
                ))}
              </div>
            </div>
            <div className="mt-auto pt-8">
              <div className="rounded-2xl border border-[var(--line)] bg-white p-3 shadow-[0_12px_40px_rgba(62,45,28,0.08)]">
                <textarea className="min-h-24 w-full resize-none bg-transparent px-2 py-1 text-sm leading-6 outline-none placeholder:text-[var(--muted)]" placeholder="Tell me what you remember…" aria-label="Message the family archivist" />
                <div className="mt-2 flex items-center justify-between">
                  <button className="flex h-9 items-center gap-2 rounded-full px-3 text-xs font-medium text-[var(--muted)] transition hover:bg-[var(--wash)]" aria-label="Attach a file">
                    <span className="text-lg" aria-hidden="true">＋</span> Attach
                  </button>
                  <button className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--ink)] text-white transition hover:bg-[var(--accent)]" aria-label="Send message">↑</button>
                </div>
              </div>
              <p className="mt-3 text-center text-[11px] leading-5 text-[var(--muted)]">Changes are reviewed before they appear on the public tree.</p>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
