import { Outlet, createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/academy/modules/$moduleSlug")({
  component: () => <Outlet />,
});
