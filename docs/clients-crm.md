# Clients (CRM)

One validated path creates and changes clients: `lib/clients/schema.ts` (`normalizeClientInput`) and `lib/clients/service.ts`. The API routes, the AI assistant, POS checkout and the spreadsheet import all use it.

- **Country** is stored as an ISO code. Typos return a "did you mean" suggestion instead of being saved, because the country decides export (zero-tax) treatment. The tax treatment can be overridden per client.
- **Duplicates** return 409 `CLIENT_DUPLICATE` unless `force` is sent. `POST /api/clients/merge` moves invoices, proposals, retainers, contacts and notes into the client you keep.
- **Delete vs archive**: a client with billing history can only be archived; archived and walk-in clients are hidden from pickers.
- **Contacts** can opt in to invoices and reminders. `getClientRecipients()` is used by invoice email, proposal send, retainer billing and AR reminders; with no opted-in contacts the client email is used.
- **Per-client terms**: `paymentTermsDays` sets invoice due dates; `creditLimit` drives the over/near-limit flags; `currency` is the preferred billing currency.
- **Health** (`lib/clients/metrics.ts`) combines overdue share, on-time rate and days-to-pay.
- **Permissions**: `clients.view` to read, `clients.manage` to change. Bulk (max 200), export and merge are rate limited and logged.
- Schema changes ship with `prisma/migrations/20261128100000_client_crm`.
