# Finance Studio Security Control Register

This register separates implemented code controls from external deployment actions. A policy document alone is not evidence that a control operates.

| Control | Implementation or evidence | Status before deployment |
| --- | --- | --- |
| Tenant authorization | Server workspace checks plus Supabase RLS and pgTAP isolation tests | Implemented; rerun database CI |
| Plaid-token encryption | AES-256-GCM token vault; key supplied separately | Implemented; production key required |
| Plaid webhook verification | ES256 signature, timestamp, and body-hash validation | Implemented; Sandbox verification required |
| Stripe webhook verification | Stripe signature verification route | Implemented; production secret required |
| Data minimization | Plaid raw transaction allowlist | Implemented and unit tested |
| Request forgery protection | Cross-site mutation rejection with signed-webhook exceptions | Implemented and unit tested |
| Security response headers | CSP, anti-framing, no-sniff, referrer, capability, and HSTS headers | Implemented; browser verification required |
| Sensitive-action throttling | Durable database counter for Plaid and privacy actions | Implemented; migration required |
| Bank disconnection | Plaid Item removal followed by ciphertext destruction and audit event | Implemented; end-to-end test required |
| Privacy request intake | Authenticated, rate-limited request ledger | Implemented; support procedure required |
| Admin MFA | Provider-console configuration | **Required external action** |
| Secret configuration | Vercel/Supabase/Plaid/Stripe managed environment variables | **Required external action** |
| Backup restoration | Supabase backup plan and documented restore test | **Required external action** |
| Security mailbox | Monitored `security@evermontre.com` or equivalent | **Required external action** |
| Legal review | Privacy, terms, retention, and incident notices reviewed by counsel | **Required external action** |
| Vulnerability monitoring | Production `npm audit` and Dependabot are active. Enable GitHub Dependency Graph, then set the repository variable `DEPENDENCY_REVIEW_ENABLED=true` to enforce pull-request dependency review. Assign an alert owner. | **Partially implemented/external action required** |

The Security Lead must date and attach evidence for every required action before answering that the program is fully operational in a production questionnaire.
