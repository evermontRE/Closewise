# Finance Studio Incident Response Plan

**Owner:** Information Security Lead  
**Review/test:** Annual tabletop exercise and after material platform changes

## Severity

- **Critical:** confirmed exposure of bank credentials, service-role credentials, cross-tenant financial data, or active account takeover.
- **High:** credible unauthorized access, exploitable authorization failure, destructive data event, or material vendor compromise.
- **Moderate:** contained suspicious activity or vulnerability without confirmed customer-data exposure.
- **Low:** unsuccessful events, policy exceptions, and hardening opportunities.

## Response

1. **Identify:** open an incident record with UTC time, reporter, affected systems, evidence location, and incident lead. Do not place secrets or customer payloads in the record.
2. **Contain:** revoke affected sessions and credentials, disable vulnerable routes or deployments, disconnect affected Plaid Items when necessary, and preserve relevant logs.
3. **Eradicate:** repair the root cause, rotate keys, remove unauthorized access, patch dependencies, and validate tenant boundaries.
4. **Recover:** restore from verified sources, deploy through the normal review path, monitor for recurrence, and validate critical customer workflows.
5. **Notify:** assess contractual and legal notification obligations with qualified counsel and notify Plaid, Supabase, Stripe, Vercel, customers, or authorities when required.
6. **Learn:** complete a blameless review, record corrective actions and owners, update policies and tests, and track actions to closure.

## Initial checklist

- Record discovery time and reporter.
- Preserve logs and affected version identifiers.
- Rotate exposed secrets from provider consoles; never merely edit local `.env` files.
- Determine affected users, workspaces, data types, and time window.
- Confirm whether financial credentials or cross-tenant records were accessible.
- Use a separate, trusted communication channel if email or identity systems may be affected.
- Obtain legal guidance before making breach-notification conclusions.
