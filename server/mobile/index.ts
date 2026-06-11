// Mobile Gateway — public surface. The gateway is a second HTTPS+WSS listener in
// the same Node process (default :4202, OFF by default) that pairs phones by QR +
// desktop approval and exposes a redacted, deny-by-default allow-list of the hub
// API over per-device tokens. The hub at 127.0.0.1:4200 is never exposed.

export { MobileGateway } from './mobile-gateway'
export type { MobileGatewayStatus, MobileGatewayDeps } from './mobile-gateway'
export { createMobileAdminRouter } from './mobile-admin-router'
export { getMobileEventBus } from './mobile-event-bus'
export { MOBILE_ALLOWLIST } from './mobile-router'
export type { MobileDevicePublic, QrPayload } from './mobile-types'
