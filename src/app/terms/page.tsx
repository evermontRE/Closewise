import Link from "next/link";

export const metadata = { title: "Terms of Use | Finance Studio", description: "Prelaunch terms governing access to Finance Studio." };

const sections = [
  ["Permitted use", "Finance Studio is licensed for a customer's own lawful business use. Accounts, access credentials, exports, and connected financial data may not be resold, sublicensed, or used to provide unauthorized access to another person."],
  ["Planning tool—not professional advice", "Finance Studio organizes information and provides business and financial-planning estimates. It does not provide accounting, tax, legal, brokerage, lending, appraisal, investment, or financial advice and is not a substitute for a qualified professional."],
  ["No tax filing", "Finance Studio does not prepare or file tax returns. Tax-related views are organizational and planning tools. Customers are responsible for reviewing records, assumptions, classifications, rates, and results."],
  ["Customer responsibilities", "Customers are responsible for accurate information, lawful account connections, device and account security, exports and backups, and timely review of imported transactions and reconciliation differences."],
  ["Subscriptions and cancellation", "Paid access is governed by the plan selected at checkout. Current pricing, renewal timing, cancellation controls, and applicable refund terms are displayed before purchase or in the billing portal."],
  ["Availability and warranties", "The prelaunch service is provided for evaluation and may change. Availability, compatibility, estimates, and results may vary with provider availability, customer inputs, browser or device behavior, and changes in law or industry practices."],
  ["Contact", "Questions about these terms may be sent to eva@evermontre.com. Final commercial terms, refund language, governing law, and liability provisions require professional legal review before general availability."],
];

export default function TermsPage() {
  return <main className="min-h-screen bg-[#f4f8f6] px-5 py-12 text-zinc-900"><article className="mx-auto max-w-3xl rounded-3xl border border-emerald-950/10 bg-white p-7 shadow-sm sm:p-12"><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Evermont Finance Studio</p><h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">Terms of Use</h1><p className="mt-3 text-sm text-zinc-500">Effective September 3, 2026 · Prelaunch terms</p><p className="mt-7 leading-7 text-zinc-700">These terms describe the intended prelaunch use of Finance Studio. Accessing the private beta indicates agreement to use the service responsibly and only with information you are authorized to manage.</p><div className="mt-9 space-y-8">{sections.map(([title, body]) => <section key={title}><h2 className="text-lg font-semibold">{title}</h2><p className="mt-2 leading-7 text-zinc-600">{body}</p></section>)}</div><div className="mt-10 flex flex-wrap gap-5 border-t border-zinc-200 pt-6 text-sm"><Link className="font-semibold text-emerald-800 underline underline-offset-4" href="/privacy">Privacy Policy</Link><Link className="font-semibold text-emerald-800 underline underline-offset-4" href="/security">Security Overview</Link></div></article></main>;
}
