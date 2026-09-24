import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import Link from 'next/link';
import RoleSwitcher from './components/RoleSwitcher';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Operations Hub — Internal Service Requests',
  description:
    'Executive operations hub: intake, triage, queue health and approvals.',
};

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
    >
      {label}
    </Link>
  );
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-slate-950 text-slate-100">
        <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
            <Link href="/" className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-lg font-black text-white shadow-lg shadow-indigo-500/30">
                ◈
              </span>
              <span className="leading-tight">
                <span className="block text-sm font-bold tracking-wide text-white">
                  OPERATIONS HUB
                </span>
                <span className="block text-[11px] font-medium tracking-widest text-slate-400 uppercase">
                  Internal services · v0.4
                </span>
              </span>
            </Link>
            <nav className="flex items-center gap-1">
              <NavLink href="/" label="Dashboard" />
              <NavLink href="/new" label="New Request" />
              <NavLink href="/approvals" label="Approvals" />
            </nav>
            <RoleSwitcher />
          </div>
        </header>
        <div className="flex-1">{children}</div>
        <footer className="border-t border-white/10">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-6 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Advisory AI triage only — backend rules own routing and state.
            </span>
            <span>Groq provider via server · mock default for evals</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
