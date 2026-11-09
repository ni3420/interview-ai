"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { Menu, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/features/components/common/Toggle";

export interface NavbarProps {
  className?: string;
  isMobileMenuOpen?: boolean;
  onMobileMenuToggle?: () => void;
}

function titleForPath(pathname: string): string {
  if (pathname === "/dashboard") return "Dashboard";
  if (pathname === "/reports") return "Reports";
  if (pathname === "/interview/setup") return "New interview";
  if (pathname.startsWith("/interview/")) return "Interview";
  return "Workspace";
}

export function Navbar({
  className,
  isMobileMenuOpen = false,
  onMobileMenuToggle,
}: NavbarProps) {
  const pathname = usePathname();
  const title = titleForPath(pathname);

  return (
    <header
      className={cn(
        "flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4 sm:px-6",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {onMobileMenuToggle && (
          <button
            type="button"
            onClick={onMobileMenuToggle}
            aria-label={isMobileMenuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={isMobileMenuOpen}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:hidden"
          >
            {isMobileMenuOpen ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        )}
        <h1 className="truncate text-sm font-semibold text-foreground">{title}</h1>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        <ThemeToggle />
        <Button asChild size="sm" className="ml-1">
          <Link href="/interview/setup">
            <Plus aria-hidden="true" />
            <span className="hidden sm:inline">New interview</span>
            <span className="sr-only sm:hidden">New interview</span>
          </Link>
        </Button>
        <div className="pl-1">
          <UserButton
            appearance={{
              elements: {
                avatarBox: "h-8 w-8 rounded-full",
              },
            }}
          />
        </div>
      </div>
    </header>
  );
}

export default Navbar;
