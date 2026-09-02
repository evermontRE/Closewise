# Vendor and Access Management Standard

## Covered providers

Production providers currently include GitHub, Vercel, Supabase, Plaid, Stripe, domain/DNS services, and business email. New providers that receive customer information or privileged access require review before use.

## Vendor review

Record the service purpose, information categories, access level, contractual terms, security and privacy documentation, breach-notification terms, deletion/export capability, subprocessors, business continuity, owner, approval date, and annual review date. Minimize the products and permissions enabled; Finance Studio requests Plaid Transactions only for its initial bank-feed use case.

## Access rules

- Use named accounts and MFA for every privileged provider.
- Grant the minimum role required and prohibit routine use of owner/service-role credentials.
- Review privileged access quarterly and immediately after personnel or contractor changes.
- Store recovery codes offline in an access-controlled location.
- Rotate a credential after suspected disclosure and according to provider guidance.
- Remove access on the same day a role ends.
- Never send secrets through email, chat, screenshots, source control, or issue trackers.

## Production access register

The Security Lead maintains a private register of people, provider roles, approval dates, MFA status, and last review date. The register must not contain passwords, API secrets, recovery codes, or customer financial data.
