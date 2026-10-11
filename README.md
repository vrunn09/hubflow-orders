# Feasto Hub

Build a production-grade multi-tenant SaaS platform called “RailFeasto Order Hub”, inspired by MigMayo-style restaurant order aggregation.



TAGLINE:

“All Your Food Orders. One Dashboard.”



CORE PURPOSE:

Restaurants should be able to manage orders from multiple connected/authorized sources in one unified system. The complete flow is:

Order Source → Connector → Order Ingestion → Validation → Database → Real-Time Order Hub → Kitchen → Delivery → Payment → Settlement → Analytics → Reports.



BUILD THE COMPLETE PRODUCT:

Do not build only a dashboard. Build the complete frontend + backend + database architecture + authentication + APIs + real-time system + integration framework.



USER ROLES:

1. Owner – full access

2. Manager – operations, orders, kitchen, delivery, reports

3. Kitchen Staff – kitchen/order preparation

4. Delivery Staff – assigned deliveries

5. Admin – platform-wide management



AUTHENTICATION:

- Login

- Signup

- Forgot/reset password

- OTP/email verification

- Secure sessions

- Role-based access control

- Restaurant-level data isolation

- Logout



RESTAURANT ONBOARDING:

- Restaurant name

- Logo

- Owner information

- Phone/email

- Address

- GST details

- Operating hours

- Bank/settlement information

- Delivery areas/stations

- Connect order sources

- Allow skipping connections and configuring them later



MAIN DASHBOARD:

Show:

- Total orders

- New orders

- Accepted

- Preparing

- Ready

- Out for delivery

- Delivered

- Cancelled

- Today's sales

- Pending payments

- Sales graph

- Orders graph

- Platform-wise orders

- Platform-wise revenue

- Live order feed

- Integration health

- Notifications



ORDER SOURCES:

Create a dedicated “Order Sources” section with:

- RailFeasto

- Gmail / Google Email

- Zomato

- Swiggy

- IRCTC/e-Catering

- Other Platforms

- Direct/Manual Orders



Each source should show:

- Connected/Not Connected

- Connection health

- Last sync

- Sync status

- Orders received

- Connect

- Reconnect

- Pause

- Disconnect

- Sync Now



ADD NEW PLATFORM:

Create “+ Connect New Platform”.



Flow:

Choose Platform → Choose Connection Method → Authorization/Configuration → Test Connection → Sync → Connected.



Include an “Other Platform” option for future platforms.



IMPORTANT:

The platform must use a modular Connector Engine. Do not hard-code every platform into the core order system. Each source must have its own connector that converts incoming data into the same unified order format.



GMAIL:

Create a “Connect Google / Gmail” interface with:

- Connect Google Account

- Connected account

- Connection status

- Last sync

- Sync Now

- Reconnect

- Disconnect



Use Google OAuth/Gmail API architecture for the real implementation. Never store Gmail passwords in plaintext.



MERCHANT ACCOUNT CONNECTION:

Provide a generic merchant-account connection UI for supported/authorized sources. However, do not bypass authentication, CAPTCHA, MFA, platform security, or access controls. Never expose or store plaintext third-party passwords. The backend must use whatever authorized connection mechanism is permitted by the respective platform.



ORDER INGESTION ENGINE:

Every connector sends incoming order data to one central pipeline:



Connector

→ Receive Order

→ Validate

→ Normalize

→ Duplicate Detection

→ Save to Database

→ Create Status Event

→ Send Real-Time Update

→ Notify Restaurant



UNIFIED ORDER MODEL:

Every order should contain:

- Internal Order ID

- External Order ID

- Source/Platform

- Restaurant ID

- Customer information

- Train number/name when applicable

- Journey date

- Delivery station

- Coach

- Seat/berth

- Items

- Quantity

- Subtotal

- Tax

- Discount

- Delivery fee

- Total

- Payment method

- Payment status

- Order status

- Delivery status

- Created/updated timestamps



DUPLICATE PROTECTION:

Prevent duplicate orders using restaurant + source + external order ID and appropriate validation.



ORDER STATUSES:

NEW

→ ACCEPTED

→ PREPARING

→ READY

→ ASSIGNED

→ OUT_FOR_DELIVERY

→ DELIVERED



Also support:

CANCELLED

REFUNDED

FAILED



Maintain a complete status timeline/audit history.



ORDERS PAGE:

Tabs:

- All

- New

- Accepted

- Preparing

- Ready

- Assigned

- Out for Delivery

- Delivered

- Cancelled



Filters:

- Platform

- Date

- Payment

- Station

- Train

- Delivery status

- Amount



Search by:

- Order ID

- Customer

- External Order ID



ORDER DETAILS:

Show:

- Order information

- Source

- Customer

- Train/journey information

- Station

- Coach/seat

- Items

- Pricing

- Payment

- Delivery partner

- Status

- Complete timeline



KITCHEN DISPLAY:

Create a dedicated KDS with:

- New

- Accepted

- Preparing

- Ready



Kitchen cards should show:

- Order ID

- Source

- Items

- Quantity

- Train/station when applicable

- Delivery deadline

- Priority

- Status actions



Do not expose unnecessary financial/admin information to kitchen staff.



DELIVERY MANAGEMENT:

Sections:

- Unassigned

- Assigned

- Picked Up

- Out for Delivery

- Delivered



Include:

- Delivery partners

- Availability

- Assignment

- Reassignment

- Delivery timeline

- Delivery status



Create a delivery-staff interface showing assigned orders, station, train, coach, seat and delivery instructions.



PAYMENTS:

Create:

- Revenue overview

- Online payments

- Offline payments

- Pending payments

- Failed payments

- Refunds

- Transaction history



Payment status must be verified server-side in the real backend.



SETTLEMENTS:

Show:

- Gross sales

- Discounts

- Commission

- Refunds

- Adjustments

- Net settlement



Support platform-wise and date-wise settlement views.



ANALYTICS:

Create:

- Sales analytics

- Order analytics

- Platform performance

- Revenue by source

- Average order value

- Cancellation rate

- Refund analytics

- Delivery performance

- Best-selling items



REPORTS:

Create:

- Daily report

- Weekly report

- Monthly report

- Platform report

- Payment report

- Settlement report

- Delivery report

- Cancellation report



NOTIFICATIONS:

Create a real notification center for:

- New orders

- Payments

- Kitchen updates

- Delivery updates

- Integration errors

- System alerts



REAL-TIME SYSTEM:

Use WebSockets/SSE or another appropriate real-time mechanism.



When a new order is successfully received:

Source → Backend → Database → Real-Time Event → Dashboard/Kitchen Notification.



The dashboard must update without manual refresh.



BACKGROUND JOBS:

Implement an architecture for:

- Email processing

- Order synchronization

- Connector retries

- Notifications

- Report generation

- Settlement processing

- Cleanup



Failed integrations must retry safely and must not silently lose orders.



STAFF MANAGEMENT:

Owner can:

- Add staff

- Remove staff

- Activate/deactivate staff

- Assign roles

- Manage permissions



DATABASE:

Use a production-grade relational database such as PostgreSQL.



Core entities/tables:

- users

- restaurants

- staff

- roles

- permissions

- order_sources

- integrations

- integration_credentials/secrets

- orders

- order_items

- order_status_history

- customers

- delivery_partners

- deliveries

- payments

- refunds

- settlements

- notifications

- reports

- audit_logs



Use restaurant_id/tenant isolation throughout the system.



BACKEND:

Create a clean modular backend with:

- Authentication service

- Restaurant service

- User/staff service

- Order service

- Connector/integration service

- Kitchen service

- Delivery service

- Payment service

- Settlement service

- Notification service

- Analytics/report service



Create secure REST APIs or an equally appropriate API architecture.



Example routes:

 /auth

 /restaurants

 /staff

 /orders

 /orders/:id

 /orders/:id/status

 /sources

 /sources/:id/connect

 /sources/:id/disconnect

 /sources/:id/sync

 /kitchen

 /delivery

 /payments

 /refunds

 /settlements

 /analytics

 /reports

 /notifications



ADMIN PANEL:

Create:

- Admin dashboard

- Restaurant management

- User management

- Global order monitoring

- Integration/connector health

- System analytics

- Audit logs

- Platform settings



SECURITY:

Implement:

- Secure password hashing

- HTTPS-ready architecture

- Secure sessions/tokens

- RBAC

- Tenant isolation

- Server-side authorization

- Input validation

- Rate limiting

- Audit logging

- Encrypted secrets/tokens

- Secure environment variables



Never:

- store passwords in plaintext

- expose secrets in frontend

- trust frontend payment status

- bypass third-party authentication/security

- bypass CAPTCHA/MFA

- access accounts without authorization



FRONTEND ROUTES:

Create proper routing for:



/login

/signup

/forgot-password

/onboarding

/dashboard

/orders

/orders/:id

/order-sources

/order-sources/connect

/kitchen

/delivery

/delivery-partners

/payments

/settlements

/analytics

/reports

/notifications

/staff

/profile

/settings

/help



Admin:

/admin

/admin/restaurants

/admin/users

/admin/orders

/admin/integrations

/admin/audit-logs



DESIGN:

Create a premium professional B2B SaaS interface.



Style:

- Deep navy

- White/light surfaces

- Saffron/orange accent

- Clean modern typography

- Professional tables

- Subtle shadows

- Controlled animations

- Excellent spacing

- Strong visual hierarchy



Avoid:

- excessive glassmorphism

- excessive gradients

- generic AI-looking UI

- unnecessary huge cards

- fake futuristic effects



RESPONSIVE:

The entire platform must work properly on:

- Desktop

- Laptop

- Tablet

- Android/mobile



Use desktop sidebar navigation and a compact mobile navigation.



UI STATES:

Every major page must include:

- Loading

- Skeleton

- Empty

- Error

- Success

- Confirmation

- Permission denied

- Offline/connection error

- Syncing

- Connection failed



MOCK DATA:

During development, use realistic mock data and mock connectors where real external integrations are unavailable.



Clearly separate mock/test integrations from production integrations.



IMPORTANT ARCHITECTURE:

The Connector Engine must be modular so future authorized platforms can be added without rebuilding the Order Hub.



Example:



Gmail Connector

RailFeasto Connector

Platform Connector

Manual Connector

Future Connector

        ↓

Common Order Normalizer

        ↓

Order Processing Engine

        ↓

Database

        ↓

Unified Order Hub



BUILD QUALITY:

Do not create a static UI prototype.



Build reusable components, proper routing, database models, API structure, authentication, backend services, validation, error handling, security architecture and scalable modules.



The final product should feel like a real production SaaS product that a restaurant could eventually use to manage its complete order operation from one place.



IMPORTANT DEVELOPMENT APPROACH:

First establish the complete application architecture and database schema, then build authentication, then core orders, then connector engine, then kitchen/delivery, then payments/settlements, then analytics/reports, then admin and production hardening.



Do not claim an external platform is actually connected unless a real authorized integration has been implemented and tested.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://hubflow-orders.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/2f6a4c50-7289-445b-9f2e-7a5359a1ba4f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
