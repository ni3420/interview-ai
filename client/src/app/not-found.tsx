import Link from "next/link";
import {
  ArrowLeft,
  Compass,
  LayoutDashboard,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/features/components/common/Button";
import { Badge } from "@/features/components/common/Badge";

interface QuickLink {
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
}

const quickLinks: QuickLink[] = [
  {
    label: "Dashboard",
    description: "Track your interviews",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "New interview",
    description: "Upload a resume & role",
    href: "/interview/setup",
    icon: Sparkles,
  },
];

export default function NotFound() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-white px-6 py-16 dark:bg-slate-950">
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(55%_45%_at_50%_15%,rgba(139,92,246,0.20),transparent)] dark:bg-[radial-gradient(55%_45%_at_50%_15%,rgba(124,58,237,0.28),transparent)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -left-24 top-1/3 h-64 w-64 rounded-full bg-primary/10 blur-3xl dark:bg-primary/20"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -right-24 bottom-1/4 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl dark:bg-blue-500/20"
        aria-hidden="true"
      />

      <div className="w-full max-w-xl text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-lg ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
          <Compass className="h-8 w-8 text-primary" aria-hidden="true" />
        </div>

        <p className="mt-8 bg-gradient-to-br from-primary via-primary to-blue-500 bg-clip-text text-7xl font-bold tracking-tight text-transparent sm:text-8xl">
          404
        </p>

        <div className="mt-4 flex justify-center">
          <Badge status="info" dot>
            Off the interview script
          </Badge>
        </div>

        <h1 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">
          This page took a wrong turn
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-slate-500 dark:text-slate-400 sm:text-base">
          The page you&apos;re looking for doesn&apos;t exist, was moved, or is
          temporarily unavailable. Let&apos;s get you back on track.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" leftIcon={<ArrowLeft className="h-4 w-4" />}>
            <Link href="/">Back to Home</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/dashboard">Go to Dashboard</Link>
          </Button>
        </div>

        <div className="mt-12 grid gap-3 sm:grid-cols-2">
          {quickLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{link.label}</span>
                  <span className="block truncate text-xs text-slate-400">
                    {link.description}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}
