import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/academy/admin/staff')({
  component: () => <Outlet />,
});
