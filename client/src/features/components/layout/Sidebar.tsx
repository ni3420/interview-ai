"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import {
  BarChart3,
  ChevronLeft,
  FileText,
  History,
  LayoutDashboard,
  Settings,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/features/components/common/Toggle";

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

const navigation: NavItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Interviews", href: "/interview/setup", icon: FileText },
  { name: "Reports", href: "/reports", icon: BarChart3 },
  { name: "History", href: "/history", icon: History },
  { name: "Settings", href: "/settings", icon: Settings },
];

export interface RecentProject {
  id: string;
  title: string;
  subtitle?: string;
}

export interface SidebarProps {
  recentProjects?: RecentProject[];
  className?: string;
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({
  recentProjects = [],
  className,
  isOpen = false,
  onClose,
}: SidebarProps) {
  const pathname = usePathname();
  const { user } = useUser();
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  const displayName = user?.fullName ?? user?.username ?? "Candidate";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <>
      {/* Mobile Backdrop Overlay (Clicking anywhere outside closes the sidebar) */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm transition-opacity lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar Container */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex shrink-0 flex-col border-r border-slate-200/80 bg-white/95 backdrop-blur-md transition-all duration-300 dark:border-slate-800/80 dark:bg-slate-900/95 lg:static lg:z-auto",
          isOpen ? "translate-x-0 w-64" : "-translate-x-full lg:translate-x-0",
          collapsed ? "lg:w-[72px]" : "lg:w-64",
          className
        )}
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between border-b border-slate-100 px-4 dark:border-slate-800/60">
          <Link
            href="/dashboard"
            onClick={onClose}
            className="flex items-center gap-2.5 overflow-hidden font-bold"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/20">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </span>
            {(!collapsed || isOpen) && (
              <span className="truncate text-base tracking-tight text-slate-900 dark:text-slate-100">
                InterviewAI
              </span>
            )}
          </Link>

          {/* Desktop Collapse Arrow Toggle */}
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 lg:block"
          >
            <ChevronLeft
              className={cn("h-4 w-4 transition-transform duration-200", collapsed && "rotate-180")}
              aria-hidden="true"
            />
          </button>

          {/* Mobile Close (Cross) Button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 lg:hidden"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex flex-1 flex-col gap-1.5 px-3 py-4">
          {navigation.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onClose}
                title={collapsed && !isOpen ? item.name : undefined}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-foreground font-semibold"
                    : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100",
                  collapsed && !isOpen && "lg:justify-center lg:px-0"
                )}
              >
                <item.icon
                  className={cn(
                    "h-5 w-5 shrink-0 transition-transform duration-200 group-hover:scale-105",
                    isActive ? "text-primary" : "text-slate-500 dark:text-slate-400"
                  )}
                  aria-hidden="true"
                />
                {(!collapsed || isOpen) && <span className="truncate">{item.name}</span>}
                {isActive && (!collapsed || isOpen) && (
                  <span className="absolute right-2 h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </Link>
            );
          })}

          {(!collapsed || isOpen) && recentProjects.length > 0 && (
            <div className="mt-6 space-y-1">
              <p className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Recent Sessions
              </p>
              {recentProjects.slice(0, 4).map((project) => (
                <Link
                  key={project.id}
                  href={`/interview/${project.id}/review`}
                  onClick={onClose}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100/80 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full bg-primary/60" />
                  <span className="flex flex-col overflow-hidden">
                    <span className="truncate text-xs font-medium">{project.title}</span>
                    {project.subtitle && (
                      <span className="truncate text-[10px] text-slate-400">
                        {project.subtitle}
                      </span>
                    )}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </nav>

        {/* User Footer Profile */}
        <div className="border-t border-slate-200/80 p-3 dark:border-slate-800/80">
          <div
            className={cn(
              "flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-slate-100/60 dark:hover:bg-slate-800/50",
              collapsed && !isOpen && "lg:justify-center lg:px-0"
            )}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-700 shadow-inner dark:bg-slate-800 dark:text-slate-200">
              {initial}
            </span>
            {(!collapsed || isOpen) && (
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {displayName}
                </span>
                <span className="truncate text-[11px] text-slate-400">
                  {user?.primaryEmailAddress?.emailAddress ?? "Candidate"}
                </span>
              </span>
            )}
          </div>
          {(!collapsed || isOpen) && (
            <div className="mt-2 flex items-center justify-between px-2 pt-1">
              <span className="text-xs font-medium text-slate-400">Theme</span>
              <ThemeToggle />
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

export default Sidebar;