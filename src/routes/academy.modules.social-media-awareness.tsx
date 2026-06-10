import { createFileRoute } from "@tanstack/react-router";
import { AcademyModuleDetailView } from "@/components/academy-module-detail-view";
import { academyQueries } from "@/infrastructure/academy/container";

export const Route = createFileRoute("/academy/modules/social-media-awareness")({
  head: () => ({ meta: [{ title: "Social Media Awareness · Cliffview Academy" }] }),
  loader: () => academyQueries.getModuleExperience("social-media-awareness"),
  component: SocialMediaModuleRoute,
});

function SocialMediaModuleRoute() {
  const data = Route.useLoaderData();

  return <AcademyModuleDetailView data={data} />;
}
