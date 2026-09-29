'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import RoleSwitcher from './RoleSwitcher';
import NotificationBell from './NotificationBell';

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg px-3 py-2 text-sm font-medium text-indigo-100 transition hover:bg-indigo-800 hover:text-white"
    >
      {label}
    </Link>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === '/select-role') return <>{children}</>;

  return (
    <div className="min-h-screen md:flex">
      <aside className="bg-indigo-950 text-white md:fixed md:inset-y-0 md:left-0 md:flex md:w-64 md:flex-col">
        <div className="flex items-center gap-3 border-b border-indigo-900 px-5 py-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500 text-lg font-bold text-white">◈</span>
          <span className="leading-tight">
            <span className="block text-sm font-bold tracking-wide">OPERATIONS HUB</span>
            <span className="block text-[10px] font-medium tracking-[0.16em] text-indigo-300 uppercase">Internal services</span>
          </span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 py-4 md:flex-col md:overflow-visible">
          <NavLink href="/" label="Dashboard" />
          <NavLink href="/new" label="New Request" />
          <NavLink href="/approvals" label="Approvals" />
          <NavLink href="/queues" label="Queues" />
          <NavLink href="/admin" label="Admin" />
          <NotificationBell />
        </nav>
        <div className="border-t border-indigo-900 px-4 py-4 md:mt-auto">
          <RoleSwitcher />
        </div>
      </aside>
      <div className="flex min-h-screen flex-1 flex-col md:ml-64">
        <div className="flex-1">{children}</div>
        <footer className="border-t border-slate-200 bg-white px-6 py-4 text-xs text-slate-500">
          Advisory AI triage only — backend rules own routing and state.
        </footer>
      </div>
    </div>
  );
}
