import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowRight,
  Bell,
  ChefHat,
  CloudUpload,
  LayoutDashboard,
  Link2,
  ListChecks,
  Plug,
  Settings2,
  ShieldCheck,
  BarChart3,
  Headset,
  Target,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/app/Logo";
import heroBg from "@/assets/hero-bg.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RailFeasto Order Hub — Every Order. One Hub." },
      { name: "description", content: "Bring every restaurant order — train food, aggregators and direct — into one powerful dashboard. Manage, prepare and deliver faster, smarter, simpler." },
      { property: "og:title", content: "RailFeasto Order Hub" },
      { property: "og:description", content: "Every Order. One Hub. Restaurant order management built for train food delivery." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const PLATFORM_CARDS = [
  { name: "Zomato", id: "#21345", color: "bg-red-500" },
  { name: "Swiggy", id: "#567890", color: "bg-orange-500" },
  { name: "RailRestro", id: "#124680", color: "bg-green-500" },
  { name: "Others", id: "#015579", color: "bg-sky-500" },
];

const MOCK_ROWS = [
  { id: "#21345", platform: "Zomato", items: "Paneer Thali", status: "New", tone: "saffron", time: "12:14 PM" },
  { id: "#567890", platform: "Swiggy", items: "Veg Biryani", status: "Preparing", tone: "warning", time: "12:18 PM" },
  { id: "#124680", platform: "RailRestro", items: "Chicken Combo", status: "Out for Delivery", tone: "info", time: "12:30 PM" },
  { id: "#015579", platform: "Others", items: "Pizza", status: "Delivered", tone: "success", time: "12:52 PM" },
];

const TONE_CLASS: Record<string, string> = {
  saffron: "bg-saffron text-saffron-foreground",
  warning: "bg-warning text-warning-foreground",
  info: "bg-info text-info-foreground",
  success: "bg-success text-white",
};

const FEATURES = [
  { icon: Plug, t: "Multi-Platform Order Aggregation", d: "Connect your restaurant with multiple order platforms using just your merchant credentials." },
  { icon: Bell, t: "Real-Time Notifications", d: "Get instant updates for new orders, status changes and customer messages — via email and in-app." },
  { icon: LayoutDashboard, t: "Restaurant Dashboard", d: "Manage orders, menu, kitchen status, earnings and more from a simple, clean dashboard." },
  { icon: BarChart3, t: "Analytics & Reports", d: "Track performance, popular items, revenue and platform-wise sales with detailed insights." },
  { icon: ShieldCheck, t: "Secure & Reliable", d: "Your data and orders are protected with enterprise-grade security." },
  { icon: Headset, t: "Dedicated Support", d: "We're here to help you succeed with dedicated onboarding and ongoing support." },
];

const STEPS = [
  { icon: CloudUpload, t: "1. Connect Platforms", d: "Link your merchant accounts with our system." },
  { icon: ListChecks, t: "2. Manage Orders", d: "View and manage all orders in one dashboard." },
  { icon: ChefHat, t: "3. Prepare & Deliver", d: "Update status and coordinate with your team." },
  { icon: TrendingUp, t: "4. Grow Faster", d: "Get insights and scale your business." },
];

const PLATFORM_CHIPS = [
  { name: "zomato", cls: "text-red-400 lowercase font-extrabold tracking-tight" },
  { name: "Swiggy", cls: "text-orange-400 font-extrabold" },
  { name: "RailRestro", cls: "text-green-400 font-extrabold" },
  { name: "yatri", cls: "text-purple-400 lowercase font-extrabold" },
  { name: "magicpin", cls: "text-rose-400 lowercase font-extrabold" },
];

function DashboardMockup() {
  return (
    <div className="overflow-hidden rounded-xl border border-sidebar-border bg-sidebar shadow-raised">
      <div className="flex items-center gap-1.5 border-b border-sidebar-border px-3 py-2">
        <span className="size-2 rounded-full bg-sidebar-border" />
        <span className="size-2 rounded-full bg-sidebar-border" />
        <span className="size-2 rounded-full bg-sidebar-border" />
        <span className="ml-2 text-[10px] font-semibold text-sidebar-foreground">RailFeasto Order Hub</span>
      </div>
      <div className="grid grid-cols-[auto_1fr]">
        <div className="flex flex-col gap-1 border-r border-sidebar-border p-2 text-[9px] text-sidebar-foreground/80">
          <span className="rounded bg-sidebar-accent px-2 py-1 font-semibold text-sidebar-accent-foreground">Dashboard</span>
          <span className="px-2 py-1">Orders</span>
          <span className="px-2 py-1">Connections</span>
          <span className="px-2 py-1">Menu</span>
          <span className="px-2 py-1">Analytics</span>
          <span className="px-2 py-1">Settings</span>
        </div>
        <div className="p-3">
          <p className="text-[11px] font-bold text-sidebar-accent-foreground">Order Inbox</p>
          <div className="mt-2 grid grid-cols-4 gap-1.5 text-center">
            {[["New", "12", "bg-info text-white"], ["Preparing", "12", "bg-warning text-warning-foreground"], ["Out for Delivery", "06", "bg-saffron text-saffron-foreground"], ["Delivered", "24", "bg-success text-white"]].map(([l, n, c]) => (
              <div key={l} className={`rounded px-1 py-1.5 ${c}`}>
                <p className="text-[11px] font-extrabold leading-none">{n}</p>
                <p className="mt-0.5 text-[7px] leading-tight opacity-90">{l}</p>
              </div>
            ))}
          </div>
          <div className="mt-2 space-y-1">
            <div className="grid grid-cols-[1fr_1.2fr_1.4fr_1fr] text-[8px] font-semibold text-sidebar-foreground/60">
              <span>Order ID</span><span>Platform</span><span>Items</span><span className="text-right">Time</span>
            </div>
            {MOCK_ROWS.map((r) => (
              <div key={r.id} className="grid grid-cols-[1fr_1.2fr_1.4fr_1fr] items-center rounded bg-sidebar-accent/40 px-1 py-1 text-[8px] text-sidebar-foreground">
                <span className="tabular">{r.id}</span>
                <span className="truncate">{r.platform}</span>
                <span className="truncate">{r.items}</span>
                <span className="text-right">
                  <span className={`rounded-full px-1.5 py-0.5 text-[7px] font-bold ${TONE_CLASS[r.tone]}`}>{r.status}</span>
                  <span className="ml-1">{r.time}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlatformCard({ name, id, color }: { name: string; id: string; color: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-sidebar-border bg-sidebar/95 px-3.5 py-2.5 shadow-raised backdrop-blur">
      <span className={`flex size-8 items-center justify-center rounded-full text-[10px] font-extrabold text-white ${color}`}>{name.slice(0, 1)}</span>
      <div>
        <p className="text-xs font-bold text-sidebar-accent-foreground">{name}</p>
        <p className="text-[10px] text-sidebar-foreground/70">{id}</p>
      </div>
      <span className="ml-3 text-[10px] font-semibold text-success">New Order</span>
    </div>
  );
}

function Landing() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);
  const startHref = signedIn ? "/dashboard" : "/signup";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="absolute inset-x-0 top-0 z-30">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <a href="#top" aria-label="RailFeasto Order Hub"><Logo inverted /></a>
          <nav className="hidden items-center gap-7 text-sm font-medium text-sidebar-accent-foreground/85 md:flex">
            <a href="#top" className="text-saffron">Home</a>
            <a href="#features" className="hover:text-saffron">Features</a>
            <a href="#platforms" className="hover:text-saffron">Integrations</a>
            <a href="#how" className="hover:text-saffron">About</a>
          </nav>
          <div className="flex gap-2">
            <Button variant="outline" asChild className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"><Link to="/login">Login</Link></Button>
            <Button variant="saffron" asChild><Link to={startHref}>Get Started <ArrowRight /></Link></Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section id="top" className="relative overflow-hidden bg-sidebar">
        <img src={heroBg} alt="" className="absolute inset-0 size-full object-cover opacity-80" width={1920} height={912} />
        <div className="absolute inset-0 bg-gradient-to-r from-sidebar via-sidebar/80 to-sidebar/30" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-28 sm:pt-36 lg:grid-cols-[1.05fr_1fr] lg:items-center">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-sidebar-accent-foreground">
              <Target className="size-3.5 text-saffron" /> Restaurant Order Management Platform
            </p>
            <h1 className="mt-5 text-5xl font-extrabold leading-[1.02] text-white sm:text-6xl">
              Every Order.<br /><span className="text-saffron">One Hub.</span>
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-sidebar-foreground/85">
              Bring all your restaurant orders from multiple platforms into one powerful, easy-to-use dashboard. Manage, prepare, and deliver — faster, smarter, simpler.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" variant="saffron" asChild><Link to={startHref}>Get Started Free <ArrowRight /></Link></Button>
              <Button size="lg" variant="outline" asChild className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"><a href="#how">▶ Watch Demo</a></Button>
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 text-xs font-semibold text-sidebar-foreground/80">
              <span className="inline-flex items-center gap-2"><Link2 className="size-4 text-saffron" /> Multi-Platform<br className="hidden sm:block" /> Order Aggregation</span>
              <span className="inline-flex items-center gap-2"><Bell className="size-4 text-saffron" /> Real-Time<br className="hidden sm:block" /> Notifications</span>
              <span className="inline-flex items-center gap-2"><Settings2 className="size-4 text-saffron" /> Simplify<br className="hidden sm:block" /> Operations</span>
            </div>
          </div>
          <div className="relative hidden lg:block">
            <div className="absolute -top-8 right-0 z-10 space-y-2">
              {PLATFORM_CARDS.map((p) => <PlatformCard key={p.name} {...p} />)}
            </div>
            <div className="mt-24">
              <DashboardMockup />
            </div>
          </div>
          <div className="lg:hidden">
            <DashboardMockup />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t bg-background">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 lg:grid-cols-[1fr_1.6fr]">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-saffron">Powerful Features</p>
            <h2 className="mt-3 text-3xl font-extrabold leading-tight sm:text-4xl">Everything You Need to Run Your Restaurant Better</h2>
            <p className="mt-4 max-w-sm text-sm text-muted-foreground">From order aggregation to smart notifications and analytics, RailFeasto Order Hub gives you complete control — all in one place.</p>
            <Button variant="saffron" className="mt-6" asChild><a href="#how">Explore All Features <ArrowRight /></a></Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.t} className="surface p-5">
                <span className="flex size-10 items-center justify-center rounded-lg bg-saffron-soft"><f.icon className="size-5 text-saffron" /></span>
                <h3 className="mt-4 text-sm font-bold">{f.t}</h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="bg-sidebar">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 lg:grid-cols-2">
          <div className="relative">
            <DashboardMockup />
            <p className="absolute -bottom-6 right-2 -rotate-6 text-lg font-bold italic text-saffron">More orders.<br />Less chaos.</p>
          </div>
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-saffron">How It Works</p>
            <h2 className="mt-3 text-3xl font-extrabold text-white sm:text-4xl">Simple Setup. Powerful Control.</h2>
            <p className="mt-4 max-w-md text-sm text-sidebar-foreground/80">Get started in minutes and start managing your restaurant orders from all platforms in one place.</p>
            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              {STEPS.map((s) => (
                <div key={s.t}>
                  <span className="flex size-12 items-center justify-center rounded-xl bg-white/10 text-saffron"><s.icon className="size-6" /></span>
                  <h3 className="mt-3 text-sm font-bold text-sidebar-accent-foreground">{s.t}</h3>
                  <p className="mt-1 text-xs text-sidebar-foreground/75">{s.d}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Supported platforms */}
      <section id="platforms" className="border-t border-sidebar-border bg-[oklch(0.24_0.05_262)]">
        <div className="mx-auto max-w-6xl px-5 py-14 text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-saffron">Supported Platforms</p>
          <h2 className="mt-3 text-3xl font-extrabold text-white">Connect With Your Favorite Platforms</h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-sidebar-foreground/75">Link your existing merchant accounts and start receiving orders instantly.</p>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {PLATFORM_CHIPS.map((p) => (
              <div key={p.name} className="flex h-14 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-lg">
                <span className={p.cls}>{p.name}</span>
              </div>
            ))}
            <div className="flex h-14 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm font-semibold text-sidebar-accent-foreground">+ More</div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden bg-sidebar">
        <img src={heroBg} alt="" className="absolute inset-0 size-full object-cover opacity-50" width={1920} height={912} loading="lazy" />
        <div className="absolute inset-0 bg-sidebar/70" />
        <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-8 px-5 py-16 text-center lg:flex-row lg:justify-between lg:text-left">
          <div>
            <Logo inverted />
            <p className="mt-3 text-lg font-bold text-white">One Dashboard. All Your Orders.</p>
          </div>
          <div className="text-center">
            <Button size="lg" variant="saffron" asChild><Link to={startHref}>Get Started Free <ArrowRight /></Link></Button>
            <p className="mt-2 text-xs text-sidebar-foreground/80">No credit card required</p>
          </div>
          <p className="text-lg font-bold italic text-saffron">Built for<br />Restaurant Owners</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-sidebar-border bg-sidebar">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-6 text-xs text-sidebar-foreground/70 sm:flex-row">
          <p>© {new Date().getFullYear()} RailFeasto Order Hub. All rights reserved.</p>
          <div className="flex gap-5">
            <Link to="/privacy" className="hover:text-saffron">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-saffron">Terms of Service</Link>
            <a href="mailto:railfeasto.official@gmail.com" className="hover:text-saffron">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
