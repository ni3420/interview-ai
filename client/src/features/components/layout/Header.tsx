"use client";

import { Navbar, type NavbarNotification } from "./Navbar";

export interface HeaderProps {
  title?: string;
  notifications?: NavbarNotification[];
  className?: string;
}

/**
 * Thin page-level header wrapper around the global {@link Navbar}. Kept as a
 * separate component so pages can declare their own title while sharing the
 * search, notifications, quick actions and account controls.
 */
export function Header({ title, notifications, className }: HeaderProps) {
  return <Navbar title={title} notifications={notifications} className={className} />;
}

export default Header;
