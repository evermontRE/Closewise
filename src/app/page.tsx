import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-32 text-center">
      <h1 className="max-w-2xl text-4xl font-semibold tracking-tight">
        Run your real estate business like a business.
      </h1>
      <p className="mt-4 max-w-xl text-lg text-zinc-500">
        Closewise is finance, deals and taxes for agents — in one subscription.
      </p>
      <div className="mt-8 flex gap-4">
        <Link href="/sign-up" className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white">
          Get started
        </Link>
        <Link href="/pricing" className="rounded-md border border-zinc-300 px-5 py-2.5 text-sm font-medium">
          View pricing
        </Link>
      </div>
    </div>
  );
}
