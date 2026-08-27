import Link from "next/link";
import { PLAN_ORDER, PLANS } from "@/lib/plans";

export default function PricingPage() {
  return (
    <div className="flex-1 px-6 py-20">
      <div className="mx-auto max-w-5xl text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Plans for every stage of your business</h1>
        <p className="mt-3 text-zinc-500">Start free-forming, upgrade when you need more.</p>
      </div>

      <div className="mx-auto mt-12 grid max-w-5xl gap-6 sm:grid-cols-3">
        {PLAN_ORDER.map((id) => {
          const plan = PLANS[id];
          return (
            <div key={id} className="flex flex-col rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">{plan.name}</h2>
              <p className="mt-2 min-h-[3rem] text-sm text-zinc-500">{plan.tag}</p>
              <p className="mt-4 text-3xl font-semibold">
                ${plan.priceMonthlyUsd}
                <span className="text-base font-normal text-zinc-500">/mo</span>
              </p>
              <ul className="mt-6 flex-1 space-y-2 text-sm text-zinc-600">
                {plan.modules.slice(0, 6).map((m) => (
                  <li key={m} className="capitalize">
                    {m}
                  </li>
                ))}
              </ul>
              <Link
                href="/sign-up"
                className="mt-6 rounded-md bg-zinc-900 px-4 py-2 text-center text-sm font-medium text-white"
              >
                Get started
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
