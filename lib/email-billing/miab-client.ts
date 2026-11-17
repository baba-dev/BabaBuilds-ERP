import 'server-only';

// Public surface of the Mail-in-a-Box client. Implementation lives in ./miab:
//   guard.ts      URL validation and SSRF protection (private/reserved address blocking)
//   normalize.ts  response shapes -> MailBillingInventory
//   client.ts     read-only fetches against an adapter or the direct Mail-in-a-Box API
export {
  isPrivateOrReservedAddress,
  validateMailBillingUrl,
  validateMailBillingUrlForFetch,
} from './miab/guard';
export type { MailBillingInventory } from './miab/normalize';
export {
  fetchMailBillingInventory,
  getDirectMiabReadEndpoints,
  type MailBillingAccessMode,
} from './miab/client';
