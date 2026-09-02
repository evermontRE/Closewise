# Finance Studio Data Retention and Deletion Standard

**Owner:** Information Security Lead  
**Review cycle:** Annual

## Schedule

| Information | Active use | Post-deletion target | Notes |
| --- | --- | --- | --- |
| Plaid access credential | While institution is connected | Immediate destruction after confirmed Plaid disconnection | Ciphertext is set to null and the action is audited. |
| Imported financial records | While workspace is active | Delete after verified account-deletion workflow, subject to legal hold | Customer export should be offered first. |
| Receipt files | While workspace is active | Delete with workspace/account workflow | Stored privately; signed access is short-lived. |
| Plaid webhook payloads | Troubleshooting and audit | 90 days | A cleanup job must be enabled before production. |
| API throttling buckets | Abuse prevention | 48 hours or less | Expired rows must be cleaned automatically. |
| Application security logs | Security operations | 12 months | Must not contain secrets or unnecessary financial payloads. |
| Privacy-request record | Request evidence | 3 years after completion | Store request metadata, not copies of exported data. |
| Database backups | Recovery | 35 days after creation | Final duration must match the contracted production backup plan. |
| Billing records | Contract and accounting | As legally required | Coordinate with Stripe and company recordkeeping obligations. |

## Deletion procedure

Identity must be verified before disclosing or deleting customer data. Disconnect linked institutions first, confirm Plaid Item removal, destroy stored bank-access credentials, provide or confirm export when appropriate, delete tenant records and files, allow scheduled backups to expire, and record completion without retaining the deleted contents.

Legal holds, fraud investigations, charge disputes, or statutory duties may pause deletion. The reason, approver, affected scope, and review date must be recorded.
