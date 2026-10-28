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
import { AlertCircle, Loader2, Sparkles, VideoOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { captureException } from "@/lib/glitchtip";
import { logRoomTiming, startJoinTiming } from "./room-timing";
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
    <div className="fixed inset-0 z-50 flex h-screen w-screen items-center justify-center overflow-hidden bg-slate-950/80 px-4 backdrop-blur-xl transition-all">
      {/* Background Ambient Radial Glow */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(50%_50%_at_50%_50%,rgba(124,58,237,0.25),transparent_100%)]"
        aria-hidden="true"
      />

      {/* Floating Glassmorphism Modal Box */}
      <div className="relative flex w-full max-w-md flex-col items-center justify-center rounded-3xl border border-slate-800/80 bg-slate-900/90 p-6 text-center shadow-2xl backdrop-blur-md sm:p-8">
        <div className="mb-4">{icon}</div>
        <div className="space-y-1.5">
          <h2 className="text-xl font-extrabold tracking-tight text-slate-100 sm:text-2xl">
            {title}
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed sm:text-sm">
            {description}
          </p>
        </div>
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

        const captionsStartedAt = performance.now();
        try {
          await call.startClosedCaptions({ language: "en" });
        } catch (captionError) {
          console.warn("Closed captions are unavailable", captionError);
        }
        logRoomTiming("room.captions", performance.now() - captionsStartedAt);

        if (!cancelled) {
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
        }

        setState({ status: "ready", session, client, call });
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
      void joinedCall?.leave().catch(() => {});
    };
  }, [interviewId]);

  if (state.status === "loading") {
    return (
      <StatusScreen
        icon={
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/20 text-primary ring-1 ring-primary/30">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="absolute -inset-1 -z-10 rounded-2xl bg-primary/20 blur-md" />
          </div>
        }
        title="Connecting Session..."
        description="Initializing video room and requesting camera/microphone access. Please allow browser prompts to continue."
      />
    );
  }

  if (state.status === "unconfigured") {
    return (
      <StatusScreen
        icon={
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800 text-slate-400 ring-1 ring-slate-700">
            <VideoOff className="h-8 w-8" />
          </div>
        }
        title="Interview Room Unavailable"
        description="The live video stream is not configured for this session yet. Your responses and questions are safely saved."
        action={
          <Button asChild className="w-full rounded-xl bg-slate-800 text-slate-100 hover:bg-slate-700">
            <Link href="/dashboard">Return to Dashboard</Link>
          </Button>
        }
      />
    );
  }

  if (state.status === "error") {
    return (
      <StatusScreen
        icon={
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/20 text-red-400 ring-1 ring-red-500/30">
            <AlertCircle className="h-8 w-8" />
          </div>
        }
        title="Connection Error"
        description={state.message}
        action={
          <Button asChild className="w-full rounded-xl bg-slate-800 text-slate-100 hover:bg-slate-700">
            <Link href="/dashboard">Return to Dashboard</Link>
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