import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom'

import { App } from '../App'
import { AdminHomePage } from '../admin/admin-home-page'
import { ApiKeysPage } from '../admin/api-keys-page'
import { WebhooksPage } from '../admin/webhooks-page'
import { BmaSyncPage } from '../admin/bma-sync-page'
import { BrandingPage } from '../settings/branding-page'
import { DashboardSettingsPage } from '../admin/dashboard-settings-page'
import { MySettingsPage } from '../settings/my-settings-page'
import { SettingsPage } from '../settings/settings-page'
import { NotFoundPage } from '../components/not-found-page'
import { RolesPage } from '../admin/roles-page'
import { GroupsPage } from '../admin/groups-page'
import { RouteErrorPage } from '../components/route-error-page'
import { DeadlinesPage } from '../admin/deadlines-page'
import { EscalationStagesPage } from '../admin/escalation-stages-page'
import { DetectedErrorsPage } from '../admin/detected-errors-page'
import { OncallPage } from '../admin/oncall-page'
import { TextTemplatesPage } from '../admin/text-templates-page'
import { UsersPage } from '../admin/users-page'
import { RequireSession } from '../auth/require-session'
import { MyShiftsPage } from '../features/oncall/my-shifts-page'
import { StartPage } from '../features/dashboard/start-page'
import { TvPage } from '../features/dashboard/tv-page'
import { StatsPage } from '../features/stats/stats-page'
import { StickerPage } from '../features/objects/sticker-page'
import { ObjectListPage } from '../features/objects/object-list-page'
import { ObjectCreatePage } from '../features/objects/object-create-page'
import { ObjectImportPage } from '../features/objects/object-import-page'
import { ObjectEditPage } from '../features/objects/object-edit-page'
import { InternalCreatePage } from '../features/tickets/internal-create-page'
import { TicketListPage } from '../features/tickets/ticket-list-page'
import { TicketDetailPage } from '../features/tickets/ticket-detail-page'
import { TicketEmailPage } from '../features/tickets/ticket-email-page'
import { TicketPdfPage } from '../features/tickets/ticket-pdf-page'
import { ReportFormPage } from '../features/tickets/report-form-page'
import { StatusPage } from '../features/tickets/status-page'

/**
 * The route table of the application (`apps/web/src/routes/index.tsx`).
 *
 * The table is exported next to the router, so a test can build a memory
 * router from the same routes (WP-M3-13).
 *
 * Two rules keep a wrong address out of the developer page of React Router:
 * the root route carries an `errorElement` (`RouteErrorPage`) and the last
 * child is the catch-all route of the not found page (`NotFoundPage`). The
 * public routes `/m/:token` and `/s/:token` stay outside the shell and are
 * more specific than the catch-all, so a reporter never sees the not found
 * page of the internal app.
 */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <App />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        path: '/',
        element: (
          <RequireSession>
            <StartPage />
          </RequireSession>
        ),
      },
      {
        path: '/admin',
        element: (
          <RequireSession>
            <AdminHomePage />
          </RequireSession>
        ),
      },
      {
        path: '/admin/users',
        element: (
          <RequireSession>
            <UsersPage />
          </RequireSession>
        ),
      },
      {
        path: '/admin/roles',
        element: (
          <RequireSession>
            <RolesPage />
          </RequireSession>
        ),
      },
      {
        path: '/admin/groups',
        element: (
          <RequireSession>
            <GroupsPage />
          </RequireSession>
        ),
      },
      {
        path: '/admin/api-keys',
        element: (
          <RequireSession>
            <ApiKeysPage />
          </RequireSession>
        ),
      },
      {
        path: '/admin/webhooks',
        element: (
          <RequireSession>
            <WebhooksPage />
          </RequireSession>
        ),
      },
      {
        path: '/admin/bma-sync',
        element: (
          <RequireSession>
            <BmaSyncPage />
          </RequireSession>
        ),
      },
      {
        path: '/admin/deadlines',
        element: (
          <RequireSession>
            <DeadlinesPage />
          </RequireSession>
        ),
      },
      {
        path: '/admin/escalation-stages',
        element: (
          <RequireSession>
            <EscalationStagesPage />
          </RequireSession>
        ),
      },
      {
        path: '/admin/detected-errors',
        element: (
          <RequireSession>
            <DetectedErrorsPage />
          </RequireSession>
        ),
      },
      {
        path: '/admin/oncall',
        element: (
          <RequireSession>
            <OncallPage />
          </RequireSession>
        ),
      },
      {
        path: '/oncall',
        element: (
          <RequireSession>
            <MyShiftsPage />
          </RequireSession>
        ),
      },
      {
        path: '/admin/text-templates',
        element: (
          <RequireSession>
            <TextTemplatesPage />
          </RequireSession>
        ),
      },
      {
        path: '/admin/branding',
        element: (
          <RequireSession>
            <BrandingPage />
          </RequireSession>
        ),
      },
      {
        path: '/admin/dashboard',
        element: (
          <RequireSession>
            <DashboardSettingsPage />
          </RequireSession>
        ),
      },
      {
        path: '/settings',
        element: (
          <RequireSession>
            <SettingsPage />
          </RequireSession>
        ),
      },
      {
        path: '/settings/me',
        element: (
          <RequireSession>
            <MySettingsPage />
          </RequireSession>
        ),
      },
      {
        path: '/objects/stickers',
        element: (
          <RequireSession>
            <StickerPage />
          </RequireSession>
        ),
      },
      {
        path: '/objects',
        element: (
          <RequireSession>
            <ObjectListPage />
          </RequireSession>
        ),
      },
      {
        path: '/objects/create',
        element: (
          <RequireSession>
            <ObjectCreatePage />
          </RequireSession>
        ),
      },
      {
        // The CSV import page keeps the office spreadsheet in the browser (WP-M10-14);
        // the API only ever sees the posted file text.
        path: '/objects/import',
        element: (
          <RequireSession>
            <ObjectImportPage />
          </RequireSession>
        ),
      },
      {
        path: '/objects/:objectNo/edit',
        element: (
          <RequireSession>
            <ObjectEditPage />
          </RequireSession>
        ),
      },
      {
        path: '/tickets/create',
        element: (
          <RequireSession>
            <InternalCreatePage />
          </RequireSession>
        ),
      },
      {
        path: '/tickets',
        element: (
          <RequireSession>
            <TicketListPage />
          </RequireSession>
        ),
      },
      {
        path: '/stats',
        element: (
          <RequireSession>
            <StatsPage />
          </RequireSession>
        ),
      },
      {
        path: '/tickets/:ticketNo',
        element: (
          <RequireSession>
            <TicketDetailPage />
          </RequireSession>
        ),
      },
      {
        path: '/tickets/:ticketNo/email',
        element: (
          <RequireSession>
            <TicketEmailPage />
          </RequireSession>
        ),
      },
      {
        path: '/tickets/:ticketNo/pdf',
        element: (
          <RequireSession>
            <TicketPdfPage />
          </RequireSession>
        ),
      },
      {
        // The update page of the retired host update (WP-M2-44) is gone: the
        // update menu lives in the version badge of the header (WP-M3-10). An
        // old bookmark lands on the administration home instead of a 404.
        path: '/admin/update',
        element: <Navigate replace to="/admin" />,
      },
      {
        // Every address that does not exist shows the not found page of the
        // application instead of the developer page of React Router.
        path: '*',
        element: (
          <RequireSession>
            <NotFoundPage />
          </RequireSession>
        ),
      },
    ],
  },
  // A QR reporter has no session: `/m/:token` is deliberately outside the `App` shell, so
  // it never renders the login form of `Shell` (WP-M2-05, specs/06-report-form.md §7.2).
  {
    path: '/m/:token',
    element: <ReportFormPage />,
  },
  // The status link of the confirmation page is public as well: a reporter has no
  // session, so `/s/:token` stays outside the `Shell` (WP-M2-06b, PLAN §10).
  {
    path: '/s/:token',
    element: <StatusPage />,
  },
  // The wall display has no session either: `/tv/:token` is public, outside the
  // `Shell`, and more specific than the catch-all (WP-M9-16, specs/11-dashboard.md §11.7).
  {
    path: '/tv/:token',
    element: <TvPage />,
  },
]

export const router = createBrowserRouter(routes)
