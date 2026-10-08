import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Logo } from "@/components/app/Logo";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — RailFeasto Order Hub" },
      { name: "description", content: "How RailFeasto Order Hub handles your data: we process order emails only for train food delivery and never sell or share your information." },
      { property: "og:title", content: "Privacy Policy" },
      { property: "og:description", content: "RailFeasto Order Hub uses your data only to manage train food orders. We never sell or share it." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Privacy,
});

const SECTIONS: [string, React.ReactNode][] = [
  ["1. Overview", (
    <p>RailFeasto Order Hub ("RailFeasto", "we", "us") is a restaurant order management platform. It helps restaurants receive, prepare and deliver <strong>train food orders</strong>. This policy explains what information we collect, how we use it, and the rules we follow.</p>
  )],
  ["2. Orders are for train food only", (
    <p>We take and process orders <strong>only for train food delivery</strong> — food ordered by passengers for delivery to railway stations, coaches and berths. We do not use order information for any other purpose, and we do not pass customer order details to anyone outside the restaurant fulfilling that order.</p>
  )],
  ["3. We never sell your data", (
    <p><strong>We do not sell, rent, trade or share your personal data or your customers' order data with any third party</strong>, for advertising or for any other reason. Data is used solely to operate the order hub for the restaurant that owns it. We do not use customer data to train any AI model, and we do not build advertising profiles.</p>
  )],
  ["4. What we collect", (
    <ul className="list-disc space-y-1.5 pl-5">
      <li><strong>Account information:</strong> restaurant name, owner name, email address and password (hashed) when you create an account.</li>
      <li><strong>Order information:</strong> order ID, customer name and phone, food items and amounts, train number, PNR, coach, seat/berth and station — only the fields present in the incoming order.</li>
      <li><strong>Connected email account information:</strong> if you connect Gmail, we store your email address and OAuth access/refresh tokens, encrypted at rest. <strong>We never ask for or store your Gmail password.</strong></li>
      <li><strong>Processed email metadata:</strong> message ID, thread ID, sender, subject and received time of order emails, so the same email never creates duplicate orders.</li>
    </ul>
  )],
  ["5. Gmail access — how and why", (
    <div className="space-y-2">
      <p>When you connect your Gmail account, we request <strong>read-only access</strong> (gmail.readonly) plus your email address, through Google's official OAuth 2.0 flow. You grant this permission on Google's own sign-in page and can revoke it at any time from your Google Account or by disconnecting inside the app.</p>
      <p>We use this access <strong>only</strong> to detect and process food-order emails (for example from IRCTC eCatering, Zoop, RailRestro, YatriRestro, RailRecipe, Pooja Peda and similar platforms) for the connected restaurant. Order emails are analysed to extract order details and shown on your dashboard. Non-order emails (personal mail, bank messages, promotions) are ignored and never stored.</p>
      <p>RailFeasto's use and transfer to any other app of information received from Google APIs will adhere to the <a className="text-saffron underline" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>
    </div>
  )],
  ["6. What we never do", (
    <ul className="list-disc space-y-1.5 pl-5">
      <li>We never ask for or store your Gmail password.</li>
      <li>We never read your whole inbox for human review — only order-related emails are processed automatically.</li>
      <li>We never sell, rent or share your data or your customers' data with third parties.</li>
      <li>We never use order data for advertising or profiling.</li>
      <li>We never expose OAuth client secrets or tokens in the frontend.</li>
    </ul>
  )],
  ["7. Data storage and security", (
    <p>All data is stored in an encrypted cloud database with restaurant-level isolation, so one restaurant can never see another restaurant's orders. Email access tokens are encrypted at rest. Connections to the app are served over HTTPS.</p>
  )],
  ["8. Data deletion", (
    <p>When you disconnect Gmail, we delete the stored connection tokens. When you close your account, we delete your restaurant data on request. Write to <a className="text-saffron underline" href="mailto:railfeasto.official@gmail.com">railfeasto.official@gmail.com</a> and we will delete your data.</p>
  )],
  ["9. Third-party platforms", (
    <p>Order data received from platforms (IRCTC eCatering, Zoop, RailRestro, YatriRestro, RailRecipe, Pooja Peda, etc.) belongs to the restaurant that received the order. We use it only to run that restaurant's operations. We are not affiliated with these platforms.</p>
  )],
  ["10. Contact", (
    <p>Questions about this policy? Email <a className="text-saffron underline" href="mailto:railfeasto.official@gmail.com">railfeasto.official@gmail.com</a>.</p>
  )],
];

function Privacy() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <Link to="/"><Logo /></Link>
          <Button variant="saffron" asChild><Link to="/signup">Get Started</Link></Button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-5 py-12">
        <h1 className="text-3xl font-extrabold">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: 8 October 2026</p>
        <p className="mt-6 rounded-lg border border-saffron/30 bg-saffron-soft px-4 py-3 text-sm font-medium">
          In one line: RailFeasto Order Hub takes orders only for train food delivery, uses your information only to run those orders, and never sells or shares it with anyone.
        </p>
        <div className="mt-8 space-y-8">
          {SECTIONS.map(([title, body]) => (
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
