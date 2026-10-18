"use client";

import * as React from "react";
import { Check, Plus, StickyNote, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/features/components/common/Card";

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
      prev.map((note) =>
        note.id === id ? { ...note, done: !note.done } : note
      )
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
    <Card className="h-full">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-primary" aria-hidden="true" />
          Quick notes
        </CardTitle>
        <span className="text-xs text-slate-400">{remaining} to do</span>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={addNote} className="flex gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Add a note…"
            aria-label="Add a note"
            className="h-9 flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
          />
          <button
            type="submit"
            aria-label="Add note"
            disabled={!draft.trim()}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>

        <ul className="space-y-1.5">
          {notes.length === 0 && (
            <li className="py-6 text-center text-sm text-slate-400">
              No notes yet.
            </li>
          )}
          {notes.map((note) => (
            <li
              key={note.id}
              className="group flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/40"
            >
              <button
                type="button"
                onClick={() => toggle(note.id)}
                role="checkbox"
                aria-checked={note.done}
                aria-label={note.text}
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
                  note.done
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-slate-300 dark:border-slate-600"
                )}
              >
                {note.done && <Check className="h-3 w-3" aria-hidden="true" />}
              </button>
              <span
                className={cn(
                  "flex-1 text-sm",
                  note.done && "text-slate-400 line-through"
                )}
              >
                {note.text}
              </span>
              <button
                type="button"
                onClick={() => remove(note.id)}
                aria-label={`Remove note: ${note.text}`}
                className="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
              >
                <X className="h-4 w-4 text-slate-400 hover:text-destructive" />
              </button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export default NotesWidget;
