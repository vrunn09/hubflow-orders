import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/app/Logo";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — RailFeasto Order Hub" },
      { name: "description", content: "Terms of service for RailFeasto Order Hub, the restaurant order management platform for train food delivery." },
      { property: "og:title", content: "Terms of Service" },
      { property: "og:description", content: "Terms of service for RailFeasto Order Hub." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Terms,
});

const TERMS: [string, React.ReactNode][] = [
  ["1. The service", <p>RailFeasto Order Hub is software that helps restaurants receive, manage, prepare and deliver <strong>train food orders</strong> from their authorized order sources. RailFeasto is a management tool for restaurants; it is not the seller of food and is not a party to the order between the passenger and the restaurant.</p>],
  ["2. Your account", <p>You must provide accurate restaurant details and keep your credentials secure. You are responsible for all activity under your account, including orders accepted and payments settled for your restaurant.</p>],
  ["3. Connected sources", <p>You may connect only order sources you are authorized to use (for example your own Gmail account or platform merchant accounts). Connecting accounts you do not own, or sharing other people's data through the hub, is not allowed.</p>],
  ["4. Food and delivery", <p>Food quality, preparation, quantity, hygiene and delivery to the passenger are the restaurant's responsibility. RailFeasto only records and routes order information and status updates.</p>],
  ["5. Payments", <p>Online payment status is confirmed by server-side verification from the payment gateway or platform settlement data. Cash payments are confirmed after delivery. Settlements are calculated per platform; RailFeasto currently charges no commission.</p>],
  ["6. Acceptable use", <p>Do not use the hub for anything other than genuine restaurant order management — including testing with fabricated orders presented as real ones, attempting to access other restaurants' data, or disrupting the service.</p>],
  ["7. Availability", <p>We aim for reliable service but do not guarantee uninterrupted operation. Order delivery also depends on connected platforms and networks outside our control.</p>],
  ["8. Termination", <p>You can stop using the hub and delete your account at any time. We may suspend accounts that violate these terms or endanger other users' data.</p>],
  ["9. Contact", <p>Questions about these terms? Email <a className="text-saffron underline" href="mailto:railfeasto.official@gmail.com">railfeasto.official@gmail.com</a>.</p>],
];

function Terms() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <Link to="/"><Logo /></Link>
          <Button variant="saffron" asChild><Link to="/signup">Get Started</Link></Button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-5 py-12">
        <h1 className="text-3xl font-extrabold">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: 8 October 2026</p>
        <div className="mt-8 space-y-8">
          {TERMS.map(([title, body]) => (
            <section key={title}>
              <h2 className="text-lg font-bold">{title}</h2>
              <div className="mt-2 text-sm leading-relaxed text-muted-foreground [&_strong]:text-foreground">{body}</div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
