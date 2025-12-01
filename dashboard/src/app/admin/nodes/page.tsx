import { NodesManagementPage } from "@/app/admin/nodes/_components/nodes-management-page";
import { HydrateClient, api } from "@/trpc/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";

/**
 * Admin Nodes Management Page
 *
 * Server component that handles authentication and authorization for the nodes
 * management page. Only administrators can access this page.
 */
export default async function AdminNodesPage() {
  const { user, role } = await withAuth();

  // Redirect unauthenticated users to sign-in
  if (!user) {
    redirect("/sign-in");
  }

  // Redirect non-admin users to home page
  if (role !== "admin") {
    redirect("/");
  }

  // Prefetch nodes data for better performance
  await api.metrics.listNodes.prefetch({ includeInactive: false });

  return (
    <HydrateClient>
      <NodesManagementPage />
    </HydrateClient>
  );
}
