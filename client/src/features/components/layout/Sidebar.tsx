"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import {
  BarChart3,
  ChevronLeft,
  LayoutDashboard,
  Plus,
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
  { name: "New interview", href: "/interview/setup", icon: Plus },
  { name: "Reports", href: "/reports", icon: BarChart3 },
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

  const displayName = user?.fullName ?? user?.username ?? "Team member";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-foreground/40 transition-opacity lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width,transform] duration-200 ease-out-quart lg:static lg:z-auto",
          isOpen ? "w-64 translate-x-0" : "-translate-x-full lg:translate-x-0",
          collapsed ? "lg:w-[68px]" : "lg:w-64",
          className
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-3">
          <Link
            href="/dashboard"
            onClick={onClose}
            className="flex min-w-0 items-center gap-2.5"
          >
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-sidebar-border bg-sidebar-accent font-mono text-[11px] font-semibold tracking-tight text-sidebar-accent-foreground"
            >
              IA
            </span>
            {(!collapsed || isOpen) && (
              <span className="truncate text-sm font-semibold tracking-tight">
                Interview AI
              </span>
            )}
          </Link>

          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            className="hidden rounded-md p-1.5 text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground lg:block"
          >
            <ChevronLeft
              className={cn("h-4 w-4 transition-transform duration-200", collapsed && "rotate-180")}
              aria-hidden="true"
            />
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-md p-1.5 text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground lg:hidden"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3">
          {navigation.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                aria-current={isActive ? "page" : undefined}
                title={collapsed && !isOpen ? item.name : undefined}
                className={cn(
                  "relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors duration-150",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  collapsed && !isOpen && "lg:justify-center lg:px-0"
                )}
              >
                {isActive && !collapsed && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary"
                  />
                )}
                <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {(!collapsed || isOpen) && <span className="truncate">{item.name}</span>}
              </Link>
            );
          })}

          {(!collapsed || isOpen) && recentProjects.length > 0 && (
            <div className="mt-5">
              <p className="px-2.5 pb-1.5 text-micro font-medium uppercase text-sidebar-muted">
                Recent interviews
              </p>
              {recentProjects.slice(0, 4).map((project) => (
                <Link
                  key={project.id}
                  href={`/interview/${project.id}/review`}
                  onClick={onClose}
                  className="flex flex-col gap-0.5 rounded-md px-2.5 py-2 transition-colors hover:bg-sidebar-accent"
                >
                  <span className="truncate text-caption font-medium text-sidebar-foreground">
                    {project.title}
                  </span>
                  {project.subtitle && (
                    <span className="truncate text-micro text-sidebar-muted">
                      {project.subtitle}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </nav>

        <div className="border-t border-sidebar-border p-2">
          <div
            className={cn(
              "flex items-center gap-2.5 rounded-md p-1.5",
              collapsed && !isOpen && "lg:justify-center lg:px-0"
            )}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">
              {initial}
            </span>
            {(!collapsed || isOpen) && (
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-caption font-medium text-sidebar-foreground">
                  {displayName}
                </span>
                <span className="truncate text-micro text-sidebar-muted">
                  {user?.primaryEmailAddress?.emailAddress ?? "Signed in"}
                </span>
              </span>
            )}
          </div>
          {(!collapsed || isOpen) && (
            <div className="mt-1 flex items-center justify-between px-1.5 py-1">
              <span className="text-micro font-medium uppercase text-sidebar-muted">
                Theme
              </span>
              <ThemeToggle />
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
