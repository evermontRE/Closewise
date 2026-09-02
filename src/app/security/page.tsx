import Link from "next/link";

export const metadata = { title: "Security | Finance Studio", description: "Finance Studio security controls and responsible disclosure contact." };

const controls = [
  ["Protected bank connections", "Plaid handles bank authentication. Finance Studio encrypts Plaid access credentials with authenticated encryption and never exposes them to the browser."],
  ["Workspace isolation", "Database Row Level Security and server-side authorization checks separate each customer's workspace and financial records."],
  ["Verified integrations", "Plaid and Stripe webhook signatures are verified before events are accepted. Duplicate webhook deliveries are handled safely."],
  ["Limited collection", "Plaid transaction records are reduced to the fields Finance Studio needs for bookkeeping and reconciliation instead of retaining every field returned by the provider."],
  ["Controlled access", "Privileged database credentials stay in server-only modules. Sensitive bank actions are role-restricted, logged, and rate limited."],
  ["Customer control", "Workspace owners and administrators can disconnect an institution. Finance Studio then removes the Plaid Item, destroys the stored access credential, and stops future synchronization."],
];

export default function SecurityPage() {
  return <main className="min-h-screen bg-[#123f35] px-5 py-12 text-white"><article className="mx-auto max-w-4xl"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8fd3b4]">Trust center</p><h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Financial organization requires deliberate security.</h1><p className="mt-5 max-w-2xl leading-7 text-emerald-50/75">Finance Studio is being prepared for production. These controls describe the implemented application foundation; independent assurance or certification has not yet been completed.</p><div className="mt-10 grid gap-4 md:grid-cols-2">{controls.map(([title, body]) => <section key={title} className="rounded-3xl border border-white/10 bg-white/[0.06] p-6"><h2 className="font-semibold text-[#8fd3b4]">{title}</h2><p className="mt-3 text-sm leading-6 text-emerald-50/75">{body}</p></section>)}</div><section className="mt-8 rounded-3xl bg-white p-7 text-zinc-900"><h2 className="text-xl font-semibold">Report a security concern</h2><p className="mt-3 leading-7 text-zinc-600">Do not send passwords, bank credentials, Plaid access tokens, or financial records by email. Send a concise description to <a className="font-semibold text-emerald-800 underline" href="mailto:eva@evermontre.com">eva@evermontre.com</a>. A dedicated monitored security address will be established before general availability.</p><Link className="mt-5 inline-block text-sm font-semibold text-emerald-800 underline underline-offset-4" href="/privacy">Read the Privacy Policy</Link></section></article></main>;
}
