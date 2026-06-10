import { Outlet, createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/academy/admin/modules/$moduleSlug')({ component: () => <Outlet /> });
