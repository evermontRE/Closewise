import "server-only";

import { randomBytes } from "node:crypto";
import Stripe from "stripe";

let client: Stripe | null = null;

export function getStripe() {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) throw new Error("STRIPE_SECRET_KEY is not configured");
  client ??= new Stripe(apiKey, { apiVersion: "2026-08-26.dahlia", typescript: true });
  return client;
}

export function billingSiteUrl() {
  const value = process.env.NEXT_PUBLIC_SITE_URL;
  if (!value) throw new Error("NEXT_PUBLIC_SITE_URL is not configured");
  const url = new URL(value);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_SITE_URL must use HTTPS in production");
  }
  return url.origin;
}

export function checkoutIntegrationIdentifier() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  const suffix = Array.from(randomBytes(8), value => alphabet[value % alphabet.length]).join("");
  return `finance_studio_${suffix}`;
}
