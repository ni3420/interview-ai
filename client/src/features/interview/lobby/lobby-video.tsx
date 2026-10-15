"use client";

import { useEffect, useState } from "react";
import {
  StreamVideo,
  StreamVideoClient,
  StreamCall,
  ParticipantView,
  CallControls,
  useCallStateHooks,
} from "@stream-io/video-react-sdk";
import "@stream-io/video-react-sdk/dist/css/styles.css";
import { AlertCircle, Loader2 } from "lucide-react";

export interface LobbySession {
  apiKey: string;
  token: string;
  callType: string;
  callId: string;
  user: { id: string; name: string; image?: string };
}

function LobbyCall() {
  const { useLocalParticipant } = useCallStateHooks();
  const localParticipant = useLocalParticipant();

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg border bg-muted">
      {localParticipant ? (
        <ParticipantView participant={localParticipant} />
      ) : (
        <div className="flex h-full items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}
      <div className="absolute bottom-3 left-3 rounded-full bg-background/80 px-3 py-1 text-xs font-medium backdrop-blur">
        You
      </div>
    </div>
  );
}

function LobbyControls() {
  return (
    <div className="mt-4 flex justify-center">
      <CallControls />
    </div>
  );
}

/**
 * Client-only landing pad for the GetStream video session (see
 * interview-lobby.tsx). The client is created once and cached, and cleanup only
 * leaves the call so React StrictMode's double-mount re-joins cleanly.
 */
export default function LobbyVideo({ session }: { session: LobbySession }) {
  const [client] = useState(() =>
    StreamVideoClient.getOrCreateInstance({
      apiKey: session.apiKey,
      token: session.token,
      user: session.user,
    })
  );
  const [call] = useState(() => client.call(session.callType, session.callId));
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        await call.join({ create: true });
        if (!cancelled) setJoined(true);
      } catch (err) {
        console.error("Failed to join the interview call", err);
        if (!cancelled) setError("We couldn't open the interview room.");
      }
    })();

    return () => {
      cancelled = true;
      void call.leave().catch(() => {});
    };
  }, [call]);

  if (error) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-lg border bg-muted text-center">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm font-medium">Could not start video</p>
        <p className="max-w-xs text-xs text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!joined) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-lg border bg-muted text-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Connecting to the interview room...
        </p>
      </div>
    );
  }

  return (
    <StreamVideo client={client}>
      <StreamCall call={call}>
        <LobbyCall />
        <LobbyControls />
      </StreamCall>
    </StreamVideo>
  );
}
