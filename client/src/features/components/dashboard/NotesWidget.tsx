"use client";

import * as React from "react";
import { Check, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NoteItem {
  id: string;
  text: string;
  done: boolean;
}

export interface NotesWidgetProps {
  storageKey?: string;
  initialNotes?: NoteItem[];
}

const defaultNotes: NoteItem[] = [
  { id: "note-1", text: "Review the STAR format before practice", done: false },
  { id: "note-2", text: "Tailor resume keywords to the job description", done: true },
  { id: "note-3", text: "Prepare two questions for the interviewer", done: false },
];

export function NotesWidget({
  storageKey = "interview-ai:notes",
  initialNotes = defaultNotes,
}: NotesWidgetProps) {
  const [notes, setNotes] = React.useState<NoteItem[]>(initialNotes);
  const [draft, setDraft] = React.useState("");
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate persisted checklist once
      if (stored) setNotes(JSON.parse(stored) as NoteItem[]);
    } catch {
      // ignore malformed storage and fall back to defaults
    }
    setHydrated(true);
  }, [storageKey]);

  React.useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(notes));
    } catch {
      // storage may be unavailable; checklist still works in-memory
    }
  }, [notes, storageKey, hydrated]);

  const toggle = (id: string) => {
    setNotes((prev) =>
      prev.map((note) => (note.id === id ? { ...note, done: !note.done } : note))
    );
  };

  const remove = (id: string) => {
    setNotes((prev) => prev.filter((note) => note.id !== id));
  };

  const addNote = (event: React.FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setNotes((prev) => [
      ...prev,
      { id: `note-${Date.now()}`, text, done: false },
    ]);
    setDraft("");
  };

  const remaining = notes.filter((note) => !note.done).length;

  return (
    <section aria-labelledby="quick-notes">
      <div className="flex items-baseline justify-between gap-3 border-b border-border pb-3">
        <h2
          id="quick-notes"
          className="font-display text-[22px] font-medium tracking-[-0.01em]"
        >
          Notes
        </h2>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {remaining} to do
        </span>
      </div>

      <form onSubmit={addNote} className="mt-4 flex items-center gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add a note…"
          aria-label="Add a note"
          className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
        />
        <button
          type="submit"
          aria-label="Add note"
          disabled={!draft.trim()}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>

      <ul className="mt-3">
        {notes.length === 0 && (
          <li className="border-b border-border py-4 text-caption text-muted-foreground">
            No notes yet. Add the things you keep forgetting.
          </li>
        )}
        {notes.map((note) => (
          <li
            key={note.id}
            className="group flex items-start gap-2.5 border-b border-border py-2.5"
          >
            <button
              type="button"
              onClick={() => toggle(note.id)}
              role="checkbox"
              aria-checked={note.done}
              aria-label={note.text}
              className={cn(
                "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border transition-colors",
                note.done
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:border-muted-foreground"
              )}
            >
              {note.done && <Check className="h-3 w-3" aria-hidden="true" />}
            </button>
            <span
              className={cn(
                "min-w-0 flex-1 text-[13px] leading-snug",
                note.done
                  ? "text-muted-foreground line-through decoration-border"
                  : "text-foreground"
              )}
            >
              {note.text}
            </span>
            <button
              type="button"
              onClick={() => remove(note.id)}
              aria-label={`Remove note: ${note.text}`}
              className="shrink-0 opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default NotesWidget;
