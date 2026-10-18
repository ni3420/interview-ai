"use client";

import { useEffect, useRef, useState } from "react";
import type { Call } from "@stream-io/video-react-sdk";
import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";

/** A single finalized line of speech shown in the transcript panel. */
export interface TranscriptItem {
  id: string;
  /** Stream user id of the speaker, when available. */
  speakerId: string;
  /** Display name of the speaker. */
  speaker: string;
  text: string;
  timestamp: string;
  isFinal: boolean;
}

/** Shape of the `call.closed_caption` event we care about. */
interface ClosedCaptionEvent {
  closed_caption?: {
    id?: string;
    text?: string;
    speaker_id?: string;
    user?: { id?: string; name?: string };
  };
}

interface TranscriptionPanelProps {
  call: Call;
  /** Called for every finalized caption, e.g. to persist it. */
  onTranscript?: (item: TranscriptItem) => void;
  className?: string;
}

function formatTime(): string {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Live transcript for an interview call.
 *
 * Subscribes to Stream's closed-caption events (started by the provider) and
 * renders each utterance with its speaker and time. The `onTranscript` callback
 * lets the caller persist finalized turns without coupling this component to
 * any particular storage layer.
 */
export function TranscriptionPanel({
  call,
  onTranscript,
  className,
}: TranscriptionPanelProps) {
  const [transcripts, setTranscripts] = useState<
    Array<TranscriptItem & { renderKey: string }>
  >([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const onTranscriptRef = useRef(onTranscript);
  // Stream reuses the caption `id` across several events, so it is not unique
  // per rendered row. Keep a separate monotonic key for React.
  const renderKeyRef = useRef(0);

  // Keep the latest callback without re-subscribing on every render.
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    if (!call) return;

    const handleCaption = (event: ClosedCaptionEvent) => {
      const caption = event.closed_caption;
      const text = caption?.text?.trim();
      if (!caption || !text) return;

      const item: TranscriptItem = {
        id:
          caption.id ??
          `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        speakerId: caption.user?.id ?? caption.speaker_id ?? "",
        speaker: caption.user?.name ?? caption.speaker_id ?? "Participant",
        text,
        timestamp: formatTime(),
        isFinal: true,
      };

      const rendered = {
        ...item,
        renderKey: `${item.id}:${renderKeyRef.current++}`,
      };

      setTranscripts((previous) => [...previous, rendered]);
      onTranscriptRef.current?.(item);
    };

    const unsubscribe = call.on("call.closed_caption", handleCaption);
    return () => unsubscribe();
  }, [call]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [transcripts]);

  return (
    <div
      className={cn("flex flex-1 flex-col overflow-hidden", className)}
      data-testid="transcription-panel"
    >
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {transcripts.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
            <Mic className="h-8 w-8 animate-pulse" />
            <p className="text-sm">Listening to the conversation...</p>
            <p className="text-xs">
              Spoken turns appear here as the interview progresses.
            </p>
          </div>
        ) : (
          transcripts.map((item) => (
            <div
              key={item.renderKey}
              className="space-y-1 rounded-xl border bg-muted/40 p-3"
            >
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium text-primary">{item.speaker}</span>
                <span>{item.timestamp}</span>
              </div>
              <p className="text-sm leading-relaxed">{item.text}</p>
            </div>
          ))
        )}
        <div ref={scrollRef} />
      </div>
    </div>
  );
}

export default TranscriptionPanel;
