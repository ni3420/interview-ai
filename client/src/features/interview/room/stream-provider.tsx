"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  StreamCall,
  StreamTheme,
  StreamVideo,
  StreamVideoClient,
} from "@stream-io/video-react-sdk";
import { AlertCircle, Loader2, VideoOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { captureException } from "@/lib/glitchtip";
import { logRoomTiming, startJoinTiming } from "./room-timing";
import {
  startCaptionsWhenPresent,
  type CaptionSession,
} from "./room-captions";
import {
  dispatchInterviewerAgent,
  fetchStreamSession,
  StreamNotConfiguredError,
  type StreamSession,
} from "./stream-session";

export type StreamCallInstance = ReturnType<StreamVideoClient["call"]>;

interface StreamSessionContextValue {
  call: StreamCallInstance;
  session: StreamSession;
}

const StreamSessionContext = createContext<StreamSessionContextValue | null>(
  null
);

export function useStreamSession(): StreamSessionContextValue {
  const value = useContext(StreamSessionContext);
  if (!value) {
    throw new Error("useStreamSession must be used within a StreamProvider.");
  }
  return value;
}

type ProviderState =
  | { status: "loading" }
  | { status: "unconfigured" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      session: StreamSession;
      client: StreamVideoClient;
      call: StreamCallInstance;
    };

interface StreamProviderProps {
  interviewId: string;
  children: ReactNode;
}

interface StatusScreenProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

function StatusScreen({ icon, title, description, action }: StatusScreenProps) {
  return (
    <div className="fixed inset-0 z-50 flex h-screen w-screen items-center justify-center overflow-hidden bg-neutral-950 px-4">
      <div className="relative flex w-full max-w-md flex-col border border-neutral-800 bg-neutral-900 p-6 sm:p-8">
        <div className="mb-5 text-neutral-300">{icon}</div>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
          Interview room
        </p>
        <h2 className="mt-2 font-display text-2xl leading-tight tracking-tight text-neutral-100">
          {title}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-neutral-400">
          {description}
        </p>
        {action && <div className="mt-6 w-full">{action}</div>}
      </div>
    </div>
  );
}

export function StreamProvider({ interviewId, children }: StreamProviderProps) {
  const [state, setState] = useState<ProviderState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    let joinedCall: StreamCallInstance | null = null;
    let captionSession: CaptionSession | null = null;

    async function connect() {
      setState({ status: "loading" });
      startJoinTiming();
      try {
        const tokenStartedAt = performance.now();
        const session = await fetchStreamSession(interviewId);
        if (cancelled) return;
        logRoomTiming("room.token", performance.now() - tokenStartedAt);

        const client = StreamVideoClient.getOrCreateInstance({
          apiKey: session.apiKey,
          token: session.token,
          user: session.user,
        });
        const call = client.call(session.callType, session.callId);
        const joinStartedAt = performance.now();
        await call.join({ create: true });
        joinedCall = call;
        logRoomTiming("room.join", performance.now() - joinStartedAt, {
          joinedAt: Date.now(),
        });

        if (cancelled) {
          await call.leave().catch(() => {});
          return;
        }

        const dispatchStartedAt = performance.now();
        void dispatchInterviewerAgent(interviewId)
          .then(() =>
            logRoomTiming(
              "room.dispatch",
              performance.now() - dispatchStartedAt
            )
          )
          .catch((agentError) => {
            console.warn("AI interviewer dispatch failed", agentError);
            captureException(agentError, {
              interviewId,
              scope: "stream-provider",
              step: "dispatch-interviewer",
            });
            toast.warning(
              "The AI interviewer could not join. You can still continue the interview."
            );
          });

        setState({ status: "ready", session, client, call });

        // Captions are started once the interviewer is present, then restarted
        // if it joins late (see room-captions.ts).
        const captionsStartedAt = performance.now();
        void startCaptionsWhenPresent(call)
          .then((session) => {
            captionSession = session;
            if (cancelled) {
              session.dispose();
              return;
            }
            logRoomTiming(
              "room.captions",
              performance.now() - captionsStartedAt,
              {
                waitedForParticipantMs: Math.round(
                  session.waitedForParticipantMs
                ),
                startedAfterParticipant: session.startedAfterParticipant,
              }
            );
            const restartStartedAt = performance.now();
            void session.restarted.then((restarted) => {
              if (restarted) {
                logRoomTiming(
                  "room.captions.restart",
                  performance.now() - restartStartedAt
                );
              }
            });
          })
          .catch((captionError) => {
            console.warn("Closed captions are unavailable", captionError);
          });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof StreamNotConfiguredError) {
          setState({ status: "unconfigured" });
          return;
        }
        captureException(error, { interviewId, scope: "stream-provider" });
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Could not connect to the interview room.",
        });
      }
    }

    void connect();

    return () => {
      cancelled = true;
      captionSession?.dispose();
      void joinedCall?.leave().catch(() => {});
    };
  }, [interviewId]);

  if (state.status === "loading") {
    return (
      <StatusScreen
        icon={<Loader2 className="h-6 w-6 animate-spin" />}
        title="Connecting room"
        description="Setting up the video room and requesting camera and microphone access. Allow the browser prompt to continue."
      />
    );
  }

  if (state.status === "unconfigured") {
    return (
      <StatusScreen
        icon={<VideoOff className="h-6 w-6" />}
        title="Video is not configured"
        description="Live video is not enabled for this session yet. Your questions and answers are saved."
        action={
          <Button asChild variant="secondary" className="w-full">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        }
      />
    );
  }

  if (state.status === "error") {
    return (
      <StatusScreen
        icon={<AlertCircle className="h-6 w-6 text-destructive" />}
        title="Connection failed"
        description={state.message}
        action={
          <Button asChild variant="secondary" className="w-full">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        }
      />
    );
  }

  return (
    <StreamSessionContext.Provider
      value={{ call: state.call, session: state.session }}
    >
      <StreamVideo client={state.client}>
        <StreamCall call={state.call}>
          <StreamTheme className="h-full">{children}</StreamTheme>
        </StreamCall>
      </StreamVideo>
    </StreamSessionContext.Provider>
  );
}