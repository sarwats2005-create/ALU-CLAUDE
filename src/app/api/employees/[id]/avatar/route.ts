import { route } from '@/lib/server/api';
import { employeeAvatar } from '@/lib/server/employees';

export const GET = route<{ id: string }>({ pages: ['employees'] }, async ({ params }) => employeeAvatar(params.id));
