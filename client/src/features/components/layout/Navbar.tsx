"use client";

import * as React from "react";
import Link from "next/link";
import { useUser, UserButton } from "@clerk/nextjs";
import {
  Bell,
  ChevronDown,
  LayoutDashboard,
  Menu,
  Plus,
  Search,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/features/components/common/Toggle";

export interface NavbarNotification {
  id: string;
  title: string;
  description?: string;
  read?: boolean;
}

export interface NavbarProps {
  title?: string;
  notifications?: NavbarNotification[];
  className?: string;
  isMobileMenuOpen?: boolean;
  onMobileMenuToggle?: () => void;
}

export function Navbar({
  title,
  notifications = [],
  className,
  isMobileMenuOpen = false,
  onMobileMenuToggle,
}: NavbarProps) {
  const { user } = useUser();
  const [query, setQuery] = React.useState("");
  const searchRef = React.useRef<HTMLInputElement>(null);

  const unreadCount = notifications.filter((item) => !item.read).length;
  const greeting =
    user?.firstName != null ? `Hi, ${user.firstName}` : "Welcome back";

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex h-16 items-center justify-between gap-4 border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-white/75 dark:border-slate-800/80 dark:bg-slate-900/95 dark:supports-[backdrop-filter]:bg-slate-900/75 sm:px-6",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        {/* Mobile Sidebar Toggle Button (Hamburger / Cross) */}
        {onMobileMenuToggle && (
          <button
            type="button"
            onClick={onMobileMenuToggle}
            aria-label={isMobileMenuOpen ? "Close mobile menu" : "Open mobile menu"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 lg:hidden"
          >
            {isMobileMenuOpen ? (
              <X className="h-5 w-5 transition-transform duration-200" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5 transition-transform duration-200" aria-hidden="true" />
            )}
          </button>
        )}

        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
            {title ?? "Dashboard"}
          </span>
          <span className="truncate text-xs text-slate-400 dark:text-slate-500">
            {greeting}
          </span>
        </div>

        {/* Global Search Bar */}
        <div className="relative hidden md:block">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            type="search"
            placeholder="Search…"
            aria-label="Global search"
            className="h-9 w-52 rounded-xl border border-slate-200 bg-slate-50/50 pl-9 pr-12 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-100 dark:focus:bg-slate-950"
          />
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-400 dark:border-slate-700 dark:bg-slate-800 lg:block">
            ⌘F
          </kbd>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <ThemeToggle className="lg:hidden" />

        {/* Notifications Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            >
              <Bell className="h-4 w-4" aria-hidden="true" />
              {unreadCount > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground shadow-sm">
                  {unreadCount}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {notifications.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-slate-400">
                You&apos;re all caught up.
              </p>
            ) : (
              notifications.slice(0, 5).map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  className="flex flex-col items-start gap-0.5 py-2.5"
                >
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {item.title}
                  </span>
                  {item.description && (
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {item.description}
                    </span>
                  )}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* New Project Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">New Project</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-80" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link href="/interview/setup" className="flex items-center gap-2 font-medium">
                <Plus className="h-4 w-4 text-primary" />
                New Interview
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/interview/setup" className="flex items-center gap-2 font-medium">
                <Upload className="h-4 w-4 text-primary" />
                Upload Resume
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/reports" className="flex items-center gap-2 font-medium">
                <LayoutDashboard className="h-4 w-4 text-primary" />
                View Reports
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Profile Avatar */}
        <div className="pl-1">
          <UserButton
            appearance={{
              elements: {
                avatarBox: "h-9 w-9 ring-2 ring-primary/20 rounded-full",
              },
            }}
          />
        </div>
      </div>
    </header>
  );
}

export default Navbar;