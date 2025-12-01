import { MetricsDashboard } from "@/app/_components/metrics-dashboard";
import { HydrateClient, api } from "@/trpc/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";

export default async function Home() {
  const { user } = await withAuth();

  if (!user) {
    redirect("/sign-in");
  }

  // Prefetch metrics, stats, and preferences for better initial load performance
  await Promise.all([
    api.metrics.get.prefetch({}),
    api.metrics.getStats.prefetch({}),
    api.preferences.get.prefetch(),
  ]);

  return (
    <HydrateClient>
      <MetricsDashboard />
    </HydrateClient>
  );
}
