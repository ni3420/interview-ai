"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Loader2,
  Mic,
  MicOff,
  RefreshCw,
  Video,
  VideoOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type PreviewStatus = "requesting" | "ready" | "error";

interface DevicePreviewProps {
  className?: string;
  /** Reports whether a usable camera/microphone stream is currently active. */
  onReadyChange?: (ready: boolean) => void;
}

interface DeviceOption {
  deviceId: string;
  label: string;
}

interface MediaAttempt {
  video: boolean | MediaTrackConstraints;
  audio: boolean | MediaTrackConstraints;
}

function describeMediaError(error: unknown): string {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    switch (error.name) {
      case "NotAllowedError":
      case "SecurityError":
        return "Camera and microphone access was blocked. Allow permissions in your browser to continue.";
      case "NotFoundError":
      case "OverconstrainedError":
        return "No camera or microphone was found. Connect a device and try again.";
      case "NotReadableError":
        return "Your camera or microphone is already in use by another application.";
      default:
        return "We could not access your camera and microphone.";
    }
  }
  return "We could not access your camera and microphone.";
}

function toOptions(
  devices: MediaDeviceInfo[],
  fallbackLabel: string
): DeviceOption[] {
  return devices.map((device, index) => ({
    deviceId: device.deviceId,
    label: device.label || `${fallbackLabel} ${index + 1}`,
  }));
}

/**
 * Builds the getUserMedia attempts in degrading order.
 *
 * A single missing device must never fail the whole check: we first request
 * both camera and microphone, then fall back to video-only (no microphone), and
 * finally audio-only (no camera). When the candidate has explicitly picked a
 * device we honour that choice before the looser fallbacks.
 */
function buildAttempts(cameraId: string, micId: string): MediaAttempt[] {
  const video = cameraId ? { deviceId: { exact: cameraId } } : true;
  const audio = micId ? { deviceId: { exact: micId } } : true;
  return [
    { video, audio },
    { video, audio: false },
    { video: false, audio },
  ];
}

/**
 * Pre-join device check for the interview lobby.
 *
 * Requests a local camera/microphone stream, shows the camera preview with a
 * live microphone level meter, and lets candidates pick devices and toggle the
 * microphone or camera before joining. It is independent of GetStream so the
 * lobby is usable even before the live room is configured.
 */
export function DevicePreview({ className, onReadyChange }: DevicePreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number | null>(null);
  const selectedCameraRef = useRef("");
  const selectedMicRef = useRef("");

  const [status, setStatus] = useState<PreviewStatus>("requesting");
  const [error, setError] = useState<string | null>(null);
  const [hasAudio, setHasAudio] = useState(false);
  const [hasVideo, setHasVideo] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [cameras, setCameras] = useState<DeviceOption[]>([]);
  const [microphones, setMicrophones] = useState<DeviceOption[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [selectedMicId, setSelectedMicId] = useState("");
  const [micLevel, setMicLevel] = useState(0);
  const [attempt, setAttempt] = useState(0);

  const stopMeter = useCallback(() => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setMicLevel(0);
  }, []);

  const stopStream = useCallback(() => {
    stopMeter();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [stopMeter]);

  const startMeter = useCallback(
    (stream: MediaStream) => {
      const AudioContextCtor =
        typeof window !== "undefined"
          ? window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext })
              .webkitAudioContext
          : undefined;

      if (!AudioContextCtor || stream.getAudioTracks().length === 0) {
        return;
      }

      try {
        const context = new AudioContextCtor();
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        audioContextRef.current = context;

        const samples = new Uint8Array(analyser.fftSize);

        const tick = () => {
          analyser.getByteTimeDomainData(samples);
          let sum = 0;
          for (let i = 0; i < samples.length; i += 1) {
            const normalized = (samples[i] - 128) / 128;
            sum += normalized * normalized;
          }
          const rms = Math.sqrt(sum / samples.length);
          setMicLevel(Math.min(100, Math.round(rms * 200)));
          animationRef.current = requestAnimationFrame(tick);
        };

        animationRef.current = requestAnimationFrame(tick);
      } catch {
        // A meter is a nice-to-have; never let it break the device check.
        stopMeter();
      }
    },
    [stopMeter]
  );

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        setStatus("error");
        setError("This browser does not expose camera and microphone access.");
        return;
      }

      stopStream();
      setStatus("requesting");
      setError(null);

      const attempts = buildAttempts(
        selectedCameraRef.current,
        selectedMicRef.current
      );

      let stream: MediaStream | null = null;
      let lastError: unknown = null;

      for (const constraints of attempts) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          break;
        } catch (attemptError) {
          lastError = attemptError;
        }
      }

      if (cancelled) {
        stream?.getTracks().forEach((track) => track.stop());
        return;
      }

      if (!stream) {
        setStatus("error");
        setError(describeMediaError(lastError));
        return;
      }

      const audioTracks = stream.getAudioTracks();
      const videoTracks = stream.getVideoTracks();

      streamRef.current = stream;
      setHasAudio(audioTracks.length > 0);
      setHasVideo(videoTracks.length > 0);
      setMicEnabled(audioTracks.length > 0);
      setCameraEnabled(videoTracks.length > 0);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Device labels are only populated after permission is granted.
      if (navigator.mediaDevices.enumerateDevices) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          if (!cancelled) {
            const nextCameras = toOptions(
              devices.filter((device) => device.kind === "videoinput"),
              "Camera"
            );
            const nextMicrophones = toOptions(
              devices.filter((device) => device.kind === "audioinput"),
              "Microphone"
            );
            setCameras(nextCameras);
            setMicrophones(nextMicrophones);

            const activeCamera =
              videoTracks[0]?.getSettings?.().deviceId ??
              selectedCameraRef.current ??
              nextCameras[0]?.deviceId ??
              "";
            const activeMic =
              audioTracks[0]?.getSettings?.().deviceId ??
              selectedMicRef.current ??
              nextMicrophones[0]?.deviceId ??
              "";

            selectedCameraRef.current = activeCamera;
            selectedMicRef.current = activeMic;
            setSelectedCameraId(activeCamera);
            setSelectedMicId(activeMic);
          }
        } catch {
          // Enumeration is optional; keep the working stream either way.
        }
      }

      if (!cancelled) {
        startMeter(stream);
        setStatus("ready");
      }
    }

    void run();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [attempt, startMeter, stopStream]);

  useEffect(() => {
    onReadyChange?.(status === "ready");
  }, [status, onReadyChange]);

  const toggleMic = useCallback(() => {
    setMicEnabled((previous) => {
      const next = !previous;
      streamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = next;
      });
      return next;
    });
  }, []);

  const toggleCamera = useCallback(() => {
    setCameraEnabled((previous) => {
      const next = !previous;
      streamRef.current?.getVideoTracks().forEach((track) => {
        track.enabled = next;
      });
      return next;
    });
  }, []);

  const handleCameraChange = useCallback((deviceId: string) => {
    selectedCameraRef.current = deviceId;
    setSelectedCameraId(deviceId);
    setAttempt((value) => value + 1);
  }, []);

  const handleMicChange = useCallback((deviceId: string) => {
    selectedMicRef.current = deviceId;
    setSelectedMicId(deviceId);
    setAttempt((value) => value + 1);
  }, []);

  const handleRetry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  const showVideo = status === "ready" && hasVideo && cameraEnabled;

  return (
    <div className={cn("space-y-3", className)} data-testid="device-preview">
      <div className="relative aspect-video w-full overflow-hidden rounded-lg border bg-muted">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={cn("h-full w-full object-cover", !showVideo && "opacity-0")}
        />

        {status === "requesting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Checking your camera and microphone...
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm font-medium">
              Camera and microphone unavailable
            </p>
            <p className="max-w-xs text-xs text-muted-foreground">{error}</p>
            <Button type="button" variant="outline" size="sm" onClick={handleRetry}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Try again
            </Button>
          </div>
        )}

        {status === "ready" && !hasVideo && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <VideoOff className="h-8 w-8" />
            <p className="text-sm">No camera detected</p>
            <p className="text-xs">You can still continue with audio only.</p>
          </div>
        )}

        {status === "ready" && hasVideo && !cameraEnabled && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <VideoOff className="h-8 w-8" />
            <p className="text-sm">Camera is off</p>
          </div>
        )}

        {status === "ready" && (
          <div className="absolute bottom-3 left-3 flex items-center gap-2">
            <span className="rounded-full bg-background/80 px-3 py-1 text-xs font-medium backdrop-blur">
              You
            </span>
            {!micEnabled && (
              <span className="flex items-center gap-1 rounded-full bg-background/80 px-2 py-1 text-xs font-medium backdrop-blur">
                <MicOff className="h-3 w-3" />
                Muted
              </span>
            )}
          </div>
        )}
      </div>

      {status === "ready" && hasAudio && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Microphone level</span>
            <span>{micEnabled ? "Speak to test" : "Muted"}</span>
          </div>
          <Progress
            value={micEnabled ? micLevel : 0}
            aria-label="Microphone level"
          />
        </div>
      )}

      {status === "ready" && (cameras.length > 0 || microphones.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {cameras.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="device-camera">Camera</Label>
              <select
                id="device-camera"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={selectedCameraId}
                onChange={(event) => handleCameraChange(event.target.value)}
              >
                {cameras.map((camera) => (
                  <option key={camera.deviceId} value={camera.deviceId}>
                    {camera.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {microphones.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="device-microphone">Microphone</Label>
              <select
                id="device-microphone"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={selectedMicId}
                onChange={(event) => handleMicChange(event.target.value)}
              >
                {microphones.map((microphone) => (
                  <option key={microphone.deviceId} value={microphone.deviceId}>
                    {microphone.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          type="button"
          variant={micEnabled && hasAudio ? "outline" : "secondary"}
          size="sm"
          onClick={toggleMic}
          disabled={status !== "ready" || !hasAudio}
          aria-pressed={micEnabled && hasAudio}
        >
          {micEnabled && hasAudio ? (
            <Mic className="mr-2 h-4 w-4" />
          ) : (
            <MicOff className="mr-2 h-4 w-4" />
          )}
          {micEnabled && hasAudio ? "Microphone on" : "Microphone off"}
        </Button>
        <Button
          type="button"
          variant={cameraEnabled && hasVideo ? "outline" : "secondary"}
          size="sm"
          onClick={toggleCamera}
          disabled={status !== "ready" || !hasVideo}
          aria-pressed={cameraEnabled && hasVideo}
        >
          {cameraEnabled && hasVideo ? (
            <Video className="mr-2 h-4 w-4" />
          ) : (
            <VideoOff className="mr-2 h-4 w-4" />
          )}
          {cameraEnabled && hasVideo ? "Camera on" : "Camera off"}
        </Button>
      </div>
    </div>
  );
}

export default DevicePreview;
