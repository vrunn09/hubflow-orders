import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Logo } from "./Logo";

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <Link to="/"><Logo inverted /></Link>
        <div>
          <p className="text-3xl font-bold leading-tight text-sidebar-accent-foreground">All your food orders.<br /><span className="text-saffron">One dashboard.</span></p>
          <ul className="mt-6 space-y-2 text-sm">
            <li>— RailFeasto, Gmail, aggregators and direct orders in one queue</li>
            <li>— Live kitchen display and delivery hand-off to the berth</li>
            <li>— Server-verified payments and per-platform settlements</li>
          </ul>
        </div>
        <p className="text-xs opacity-60">© RailFeasto Order Hub</p>
      </div>
      <div className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Logo /></div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-6">{children}</div>
          {footer && <div className="mt-6 text-sm text-muted-foreground">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
