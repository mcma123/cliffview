import { createFileRoute } from "@tanstack/react-router";
import { AcademyModuleDetailView } from "@/components/academy-module-detail-view";
import { academyQueries } from "@/infrastructure/academy/container";

export const Route = createFileRoute("/academy/modules/$moduleSlug/")({
  head: () => ({ meta: [{ title: "Module Detail · Cliffview Academy" }] }),
  loader: ({ params }) => academyQueries.getModuleExperience(params.moduleSlug),
  component: ModuleDetailRoute,
});

function ModuleDetailRoute() {
  const data = Route.useLoaderData();

  return <AcademyModuleDetailView data={data} />;
}
