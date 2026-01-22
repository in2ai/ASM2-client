import { getLogtoContext } from "@logto/next/server-actions";
import { logtoConfig } from "@/lib/logto";

export interface LogtoUser {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  role?: string | null;
  organizationId?: string | null;
}

/**
 * Retrieves the current authenticated user from Logto context.
 * Maps Logto userInfo to LogtoUser interface with appropriate fallbacks.
 *
 * @returns The user object if authenticated, null otherwise
 */
export async function getUser(): Promise<LogtoUser | null> {
  const context = await getLogtoContext(logtoConfig, {
    fetchUserInfo: true,
  });

  if (!context.isAuthenticated || !context.userInfo) {
    return null;
  }

  const { userInfo, claims } = context;

  // Extract organization info from claims
  const organizations = claims?.organizations ?? [];
  const organizationRoles = claims?.organization_roles ?? [];

  // Parse name from userInfo - split on space to get first/last name
  const nameParts = userInfo.name?.split(" ") ?? [];
  const firstName = nameParts[0] ?? null;
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : null;

  // Extract role from organization_roles (format: "org_id:role")
  let role: string | null = "user";
  if (organizationRoles && organizationRoles.length > 0) {
    const firstRole = organizationRoles[0];
    if (firstRole) {
      const roleParts = firstRole.split(":");
      role = roleParts.length > 1 ? (roleParts[1] ?? "user") : "user";
    }
  }

  return {
    firstName,
    lastName,
    email: userInfo.email ?? null,
    role,
    organizationId: organizations?.[0] ?? null,
  };
}
