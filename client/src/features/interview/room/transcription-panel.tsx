"use client";

import { useEffect, useRef, useState } from "react";
import type { Call } from "@stream-io/video-react-sdk";
import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { AI_INTERVIEWER_ID, AI_INTERVIEWER_NAME } from "./constants";
import { logAgentAudibleOnce } from "./room-timing";

export type TranscriptSpeakerRole = "interviewer" | "candidate" | "unknown";

/** A single finalized line of speech shown in the transcript panel. */
export interface TranscriptItem {
  id: string;
  /** Stream's stable utterance key (speaker + start time). */
  segmentKey: string;
  /** Stream user id of the speaker, when available. */
  speakerId: string;
  /** Display name of the speaker. */
  speaker: string;
  speakerRole: TranscriptSpeakerRole;
  /** 1 for a known participant, 0 for an unidentified speaker. */
  speakerConfidence: number;
  /** Epoch ms from Stream's caption start/end timestamps. */
  start: number;
  end: number;
  text: string;
  timestamp: string;
  /** The transcription provider does not currently supply this. */
  asrConfidence?: number;
  isFinal: boolean;
}

/** Shape of the `call.closed_caption` event we care about. */
interface ClosedCaptionEvent {
  closed_caption?: {
    id?: string;
    text?: string;
    speaker_id?: string;
    start_time?: string;
    end_time?: string;
    user?: { id?: string; name?: string };
  };
}

/** A rendered caption plus the key Stream uses to identify the utterance. */
interface DisplayCaption extends TranscriptItem {
  utteranceKey: string;
}

interface TranscriptionPanelProps {
  call: Call;
  /** The signed-in candidate's Stream user id. */
  candidateId?: string;
  /** Called once for every new finalized utterance, e.g. to persist an answer. */
  onTranscript?: (item: TranscriptItem) => void;
  /**
   * Called for every finalized caption, including a refined re-delivery of an
   * existing utterance. Persisting this upserts the raw segment so the stored
   * transcript keeps the latest ASR text without duplicating the turn.
   */
  onSegment?: (item: TranscriptItem, isUpdate: boolean) => void;
  className?: string;
}

/** Parses Stream's caption timestamps; returns null when unusable. */
export function parseCaptionTime(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function attributeSpeaker(
  speakerId: string,
  speakerName: string | undefined,
  candidateId: string | undefined
): { role: TranscriptSpeakerRole; confidence: number; displayName: string } {
  if (
    speakerId === AI_INTERVIEWER_ID ||
    speakerName === AI_INTERVIEWER_NAME
  ) {
    return {
      role: "interviewer",
      confidence: 1,
      displayName: speakerName ?? AI_INTERVIEWER_NAME,
    };
  }

  // A known candidate identity is the only positive attribution. Anything else
  // (an observer, a second tab, or unlabelled diarization) stays unknown and is
  // never treated as the candidate.
  if (candidateId && speakerId === candidateId) {
    return { role: "candidate", confidence: 1, displayName: speakerName ?? "You" };
  }

  return {
    role: "unknown",
    confidence: 0,
    displayName: speakerName ?? speakerId ?? "Participant",
  };
}

function isInterviewer(item: TranscriptItem): boolean {
  return item.speakerRole === "interviewer";
}

interface QuestionGroup {
  key: string;
  question?: DisplayCaption;
  answers: DisplayCaption[];
}

/**
 * Groups captions so each interviewer question is shown together with the
 * candidate's answer(s) that followed it.
 */
function groupByQuestion(captions: DisplayCaption[]): QuestionGroup[] {
  const groups: QuestionGroup[] = [];

  for (const caption of captions) {
    if (isInterviewer(caption)) {
      groups.push({ key: caption.utteranceKey, question: caption, answers: [] });
      continue;
    }

    let current = groups[groups.length - 1];
    if (!current) {
      current = { key: `answer-${caption.utteranceKey}`, answers: [] };
      groups.push(current);
    }
    current.answers.push(caption);
  }

  return groups;
}

/**
 * Live transcript for an interview call.
 *
 * Stream re-delivers `call.closed_caption` events for the same utterance; it
 * keys an utterance by `speaker_id` + `start_time` (see the SDK's
 * `updateFromClosedCaptions`). We dedupe on the same key so a question is never
 * rendered twice, and group each question with the answer(s) that follow it.
 * `onTranscript` fires once per unique utterance so callers persist one turn.
 */
export function TranscriptionPanel({
  call,
  candidateId,
  onTranscript,
  onSegment,
  className,
}: TranscriptionPanelProps) {
  const [captions, setCaptions] = useState<DisplayCaption[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const onTranscriptRef = useRef(onTranscript);
  const onSegmentRef = useRef(onSegment);
  const candidateIdRef = useRef(candidateId);
  const seenUtterancesRef = useRef<Set<string>>(new Set());

  // Keep the latest callbacks without re-subscribing on every render.
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onSegmentRef.current = onSegment;
    candidateIdRef.current = candidateId;
  }, [onTranscript, onSegment, candidateId]);

  useEffect(() => {
    if (!call) return;

    const handleCaption = (event: ClosedCaptionEvent) => {
      const caption = event.closed_caption;
      const text = caption?.text?.trim();
      if (!caption || !text) return;

      // Stream's CallClosedCaption carries `speaker_id`, `start_time` and
      // `end_time`; the `user` object is only present on some SDK variants.
      const speakerId = caption.speaker_id ?? caption.user?.id ?? "";
      const utteranceKey = `${speakerId}|${
        caption.start_time ?? caption.id ?? `${Date.now()}`
      }`;
      const start = parseCaptionTime(caption.start_time) ?? Date.now();
      const end = parseCaptionTime(caption.end_time) ?? start;
      const attribution = attributeSpeaker(
        speakerId,
        caption.user?.name,
        candidateIdRef.current
      );
      const item: TranscriptItem = {
        id: caption.id ?? utteranceKey,
        segmentKey: utteranceKey,
        speakerId,
        speaker: attribution.displayName,
        speakerRole: attribution.role,
        speakerConfidence: attribution.confidence,
        start,
        end: Math.max(end, start),
        text,
        timestamp: formatTime(start),
        isFinal: true,
      };

      const isUpdate = seenUtterancesRef.current.has(utteranceKey);

      setCaptions((previous) => {
        const index = previous.findIndex(
          (entry) => entry.utteranceKey === utteranceKey
        );
        if (index === -1) {
          return [...previous, { ...item, utteranceKey }];
        }
        // Same utterance re-delivered: keep the latest text in place.
        const next = previous.slice();
        next[index] = { ...next[index], ...item, utteranceKey };
        return next;
      });

      onSegmentRef.current?.(item, isUpdate);

      if (!isUpdate) {
        seenUtterancesRef.current.add(utteranceKey);
        if (isInterviewer(item)) logAgentAudibleOnce();
        onTranscriptRef.current?.(item);
      }
    };

    const unsubscribe = call.on("call.closed_caption", handleCaption);
    return () => unsubscribe();
  }, [call]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [captions]);

  const groups = groupByQuestion(captions);

  return (
    <div
      className={cn("flex flex-1 flex-col overflow-hidden", className)}
      data-testid="transcription-panel"
    >
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {groups.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
            <Mic className="h-8 w-8 animate-pulse" />
            <p className="text-sm">Listening to the conversation...</p>
            <p className="text-xs">
              Spoken turns appear here as the interview progresses.
            </p>
          </div>
        ) : (
          groups.map((group) => (
            <div
              key={group.key}
              data-testid="transcript-group"
              className="space-y-3 rounded-xl border bg-muted/40 p-3"
            >
              {group.question && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-medium text-primary">
                      {group.question.speaker}
                    </span>
                    <span>{group.question.timestamp}</span>
                  </div>
                  <p className="text-sm leading-relaxed">
                    {group.question.text}
                  </p>
                </div>
              )}

              {group.answers.map((answer) => (
                <div
                  key={answer.utteranceKey}
                  className="space-y-1 rounded-lg border-l-2 border-primary/40 bg-background/60 py-2 pl-3"
                >
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-medium">{answer.speaker}</span>
                    <span>{answer.timestamp}</span>
                  </div>
                  <p className="text-sm leading-relaxed">{answer.text}</p>
                </div>
              ))}
            </div>
          ))
        )}
        <div ref={scrollRef} />
      </div>
    </div>
  );
}

export default TranscriptionPanel;
