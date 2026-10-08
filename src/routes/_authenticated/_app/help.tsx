import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/states";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export const Route = createFileRoute("/_authenticated/_app/help")({
  head: () => ({ meta: [{ title: "Help — RailFeasto Order Hub" }, { name: "description", content: "How the Order Hub works." }, { property: "og:title", content: "Help" }, { property: "og:description", content: "How the Order Hub works." }] }),
  component: Help,
});

const FAQ: [string, string][] = [
  ["Are all sources live?", "Yes. Every connected source is a live connection — orders come only from your real Gmail or other authorized platforms. No sample or test orders are created."],
  ["How do orders reach the hub?", "Each source has its own connector. It hands the raw order to one central pipeline that validates, normalizes, removes duplicates, saves, records the first status event and pushes a live update to every open screen."],
  ["Can I connect Zomato or Swiggy with my merchant password?", "No. We never collect merchant passwords or sign in to partner dashboards for you. Live connections need official API or webhook access granted by the platform."],
  ["How is a payment marked paid?", "Only by server-side verification. Cash is confirmed after delivery; online payments are confirmed from gateway or platform settlement data."],
  ["What happens if an order fails to import?", "The raw payload is kept as a job, you get an integration alert, and it is retried on the next sync — nothing is silently dropped."],
  ["Sending orders from another platform", "Connect “Other Platform (Webhook)” in Live mode. You'll get an endpoint and a secret; the platform POSTs orders in the unified JSON format with the secret as a Bearer token."],
];

function Help() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Help" description="Answers to common questions." />
      <Accordion type="single" collapsible className="surface px-4">
        {FAQ.map(([q, a]) => <AccordionItem key={q} value={q}><AccordionTrigger className="text-left">{q}</AccordionTrigger><AccordionContent className="text-muted-foreground">{a}</AccordionContent></AccordionItem>)}
      </Accordion>
    </div>
  );
}
