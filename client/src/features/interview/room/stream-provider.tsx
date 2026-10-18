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

/**
 * Access the active Stream call from within a `StreamProvider`.
 *
 * Throws when used outside the provider so a misplaced hook fails loudly
 * during development rather than silently rendering an empty room.
 */
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
    <div className="flex h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      {icon}
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

/**
 * Connects a candidate to their interview's Stream call.
 *
 * Owns the full connection lifecycle: request a token, create/reuse the video
 * client, join the call, and leave on unmount. While connecting (or when the
 * room is unavailable) it renders an explanatory screen instead of children.
 */
export function StreamProvider({ interviewId, children }: StreamProviderProps) {
  const [state, setState] = useState<ProviderState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    let joinedCall: StreamCallInstance | null = null;

    async function connect() {
      setState({ status: "loading" });
      try {
        const session = await fetchStreamSession(interviewId);
        if (cancelled) return;

        // Reuse the cached client so React StrictMode's double-mount does not
        // create duplicate connections for the same user.
        const client = StreamVideoClient.getOrCreateInstance({
          apiKey: session.apiKey,
          token: session.token,
          user: session.user,
        });
        const call = client.call(session.callType, session.callId);
        await call.join({ create: true });
        joinedCall = call;

        if (cancelled) {
          await call.leave().catch(() => {});
          return;
        }

        // Closed captions power the live transcript. They are optional: a
        // failure must never block joining the interview.
        try {
          await call.startClosedCaptions({ language: "en" });
        } catch (captionError) {
          console.warn("Closed captions are unavailable", captionError);
        }

        // Ask the server to place the AI interviewer in the call. Best-effort:
        // the candidate can still be interviewed by the room without it, but a
        // failure must be visible instead of silently leaving the room empty.
        if (!cancelled) {
          void dispatchInterviewerAgent(interviewId).catch((agentError) => {
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
        icon={<Loader2 className="h-10 w-10 animate-spin text-primary" />}
        title="Connecting to your interview"
        description="Allow camera and microphone access when your browser prompts you."
      />
    );
  }

  if (state.status === "unconfigured") {
    return (
      <StatusScreen
        icon={<VideoOff className="h-10 w-10 text-muted-foreground" />}
        title="Live interview room unavailable"
        description="The video interview room is not configured yet. Your interview questions are still saved."
        action={
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to Dashboard</Link>
          </Button>
        }
      />
    );
  }

  if (state.status === "error") {
    return (
      <StatusScreen
        icon={<AlertCircle className="h-10 w-10 text-destructive" />}
        title="Connection error"
        description={state.message}
        action={
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to Dashboard</Link>
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
          {/* StreamTheme adds the `str-video` root class that the SDK's
              stylesheet scopes its CSS variables and base styles to. Without
              it the SDK components render unstyled. */}
          <StreamTheme className="h-full">{children}</StreamTheme>
        </StreamCall>
      </StreamVideo>
    </StreamSessionContext.Provider>
  );
}
