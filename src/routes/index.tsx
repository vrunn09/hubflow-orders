import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, ChefHat, Mail, Plug, Train, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/app/Logo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RailFeasto Order Hub — All your food orders, one dashboard" },
      { name: "description", content: "Aggregate RailFeasto, Gmail, aggregator and direct orders into one live order hub with kitchen, delivery, payments and settlements." },
      { property: "og:title", content: "RailFeasto Order Hub" },
      { property: "og:description", content: "All your food orders. One dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { icon: Plug, t: "Modular connectors", d: "Each source has its own connector that normalizes into one unified order format." },
  { icon: Train, t: "Built for rail delivery", d: "Train, station, coach and berth on every ticket — down to the delivery hand-off." },
  { icon: ChefHat, t: "Live kitchen display", d: "New orders land on the KDS in real time with deadlines and priority." },
  { icon: Wallet, t: "Verified payments", d: "Payment status is confirmed server-side. Settlements per platform and date." },
  { icon: Mail, t: "Email ingestion", d: "Order confirmation emails parsed into structured orders via Google's API." },
];

function Landing() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <div className="flex gap-2">
          {signedIn ? (
            <Button variant="saffron" asChild><Link to="/dashboard">Open dashboard <ArrowRight /></Link></Button>
          ) : (
            <>
              <Button variant="ghost" asChild><Link to="/login">Sign in</Link></Button>
              <Button variant="saffron" asChild><Link to="/signup">Start free</Link></Button>
            </>
          )}
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-5 pb-16 pt-12 sm:pt-20">
        <p className="text-sm font-semibold uppercase tracking-widest text-saffron">Restaurant order aggregation</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-extrabold leading-[1.05] sm:text-6xl">All your food orders.<br />One dashboard.</h1>
        <p className="mt-5 max-w-xl text-lg text-muted-foreground">Bring every authorized order source into a single live queue — then run kitchen, delivery, payments and settlements from the same place.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button size="lg" variant="saffron" asChild><Link to="/signup">Create your restaurant <ArrowRight /></Link></Button>
          <Button size="lg" variant="outline" asChild><Link to="/login">I already have an account</Link></Button>
        </div>
        <div className="mt-14 surface overflow-hidden">
          <div className="grid grid-cols-[auto_1fr] font-mono text-xs sm:text-sm">
            {["Order Source", "Connector", "Validation", "Database", "Real-Time Hub", "Kitchen", "Delivery", "Payment", "Settlement", "Reports"].map((s, i) => (
              <div key={s} className="contents">
                <div className="border-b border-r px-4 py-2 text-muted-foreground tabular">{String(i + 1).padStart(2, "0")}</div>
                <div className="border-b px-4 py-2 font-medium">{s}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="border-t bg-card">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-14 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.t}>
              <f.icon className="size-5 text-saffron" />
              <h3 className="mt-3 font-semibold">{f.t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
