import { route, body } from '@/lib/server/api';
import { getSettings } from '@/lib/server/common';
import { updateAlertSettings, type AlertSettingsInput } from '@/lib/server/catalog';
import { jsonSafe } from '@/lib/server/audit';

export const GET = route({ pages: ['settings'] }, async () => jsonSafe(await getSettings()));

export const PUT = route({ pages: ['settings'] }, async ({ req, user }) => jsonSafe(await updateAlertSettings(await body<AlertSettingsInput>(req), user)));
