# Finance Studio Written Information Security Program

**Owner:** Eva Morais, Founder and Information Security Lead  
**Effective:** September 2, 2026  
**Review cycle:** At least annually and after a material security incident or architecture change  
**Status:** Operational foundation; deployment evidence must be completed before general availability

## Purpose and scope

This program establishes administrative, technical, and operational safeguards for Evermont Realty Partners LLC's Finance Studio service. It applies to customer profile information, financial records, uploaded documents, Plaid-derived account and transaction information, credentials, audit records, source code, production infrastructure, personnel, contractors, and service providers.

## Responsibility

The Information Security Lead owns this program, approves access, reviews risks and vendors, coordinates incidents, and records the annual review. Engineering changes affecting authentication, authorization, encryption, financial data, or external integrations require security review before release.

## Risk management

Risks are recorded in `CONTROL_REGISTER.md` with an owner, treatment, evidence, and status. Reviews consider unauthorized tenant access, credential disclosure, account takeover, vulnerable dependencies, webhook forgery, data loss, excessive collection, vendor failure, and unavailable recovery paths.

## Required controls

1. Require individual accounts; prohibit shared privileged credentials.
2. Require MFA for production infrastructure, source control, Supabase, Plaid, Stripe, Vercel, domain, and business email administrators.
3. Grant least privilege and review privileged access quarterly.
4. Keep service-role, Plaid, Stripe, encryption, and signing secrets in managed server environment variables; never commit them or expose them with `NEXT_PUBLIC_` names.
5. Encrypt transport with HTTPS and bank-access credentials with AES-256-GCM using a separately managed key.
6. Enforce server-side authorization and database Row Level Security for tenant data.
7. Verify third-party webhook signatures before processing events.
8. Record security-sensitive actions without logging plaintext secrets or full financial payloads.
9. Apply security updates promptly according to severity and test changes before production.
10. Maintain tested backups and restoration procedures appropriate to the production database plan.
11. Collect and retain only information needed for documented product purposes.
12. Provide authenticated customer workflows for exports, privacy requests, and bank disconnection.

## Secure development and change management

Changes use branches and peer-reviewable pull requests. Automated checks must run linting, application tests, production builds, secret scanning, dependency review, migration reconstruction, database tests, and database linting where applicable. Direct production database changes outside tracked migrations are prohibited except documented emergency response.

## Monitoring and review

The Security Lead reviews authentication alerts, hosting and database alerts, failed webhooks, dependency findings, bank-connection errors, privacy requests, and security reports. Material exceptions receive an owner and due date. Evidence must be retained without copying customer financial data into tickets.

## Enforcement

Access may be suspended immediately when a person, credential, device, dependency, or provider presents material risk. Intentional policy violations may result in access removal or contract termination.
