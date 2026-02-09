/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1).
 * 2. You want to create a new middleware or type of procedure (see Part 3).
 *
 * TL;DR - This is where all the tRPC server stuff is created and plugged in. The pieces you will
 * need to use are documented accordingly near the end.
 */
import { initTRPC, TRPCError } from "@trpc/server";
import { getUser } from "@/lib/auth";
import superjson from "superjson";
import { ZodError } from "zod";

/**
 * User context interface for authentication and tracking
 */
export interface UserContext {
  userId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role: "admin" | "user";
}

/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * These allow you to access things when processing a request, like the database, the session, etc.
 *
 * This helper generates the "internals" for a tRPC context. The API handler and RSC clients each
 * wrap this and provides the required context.
 *
 * @see https://trpc.io/docs/server/context
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
  // Extract Logto user session
  const user = await getUser();

  // If no user, return context without user information
  if (!user) {
    return {
      ...opts,
      user: null,
      userContext: null,
    };
  }

  // Extract and normalize user role from Logto
  // Administrator role: users with 'admin' role in Logto
  // End User role: all other authenticated users
  const role = user.role === "admin" ? "admin" : "user";

  // Create UserContext for authentication and tracking
  const userContext: UserContext = {
    userId: user.sub,
    email: user.email ?? "",
    firstName: user.firstName,
    lastName: user.lastName,
    role,
  };

  return {
    ...opts,
    user,
    userContext,
  };
};

/**
 * Get user-friendly error message based on error type and code
 */
function getUserFriendlyMessage(error: TRPCError): string {
  // Handle specific error codes
  switch (error.code) {
    case "UNAUTHORIZED":
      return "Please sign in to continue. Your session may have expired.";
    case "FORBIDDEN":
      return "You do not have permission to access this resource. Contact your administrator if you believe this is an error.";
    case "NOT_FOUND":
      return "The requested data could not be found. Please verify your selection and try again.";
    case "BAD_REQUEST":
      return "Invalid request. Please check your input and try again.";
    case "TIMEOUT":
      return "The request took too long to complete. Please try again.";
    case "CONFLICT":
      return "This operation conflicts with existing data. Please refresh and try again.";
    case "PRECONDITION_FAILED":
      return "A required condition was not met. Please verify your data and try again.";
    case "PAYLOAD_TOO_LARGE":
      return "The request is too large. Please reduce the amount of data and try again.";
    case "METHOD_NOT_SUPPORTED":
      return "This operation is not supported.";
    case "TOO_MANY_REQUESTS":
      return "Too many requests. Please wait a moment and try again.";
    case "CLIENT_CLOSED_REQUEST":
      return "The request was cancelled. Please try again.";
    case "INTERNAL_SERVER_ERROR":
      // Check if there's a more specific message in the error
      if (error.message && !error.message.includes("Internal server error")) {
        return error.message;
      }
      return "An unexpected error occurred. Please try again or contact support if the problem persists.";
    case "UNPROCESSABLE_CONTENT":
      return "The request could not be processed. Please check your input.";
    case "PARSE_ERROR":
      return "Failed to parse the request. Please try again.";
    default:
      return error.message || "An unexpected error occurred. Please try again.";
  }
}

/**
 * 2. INITIALIZATION
 *
 * This is where the tRPC API is initialized, connecting the context and transformer. We also parse
 * ZodErrors so that you get typesafety on the frontend if your procedure fails due to validation
 * errors on the backend.
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
        userMessage: getUserFriendlyMessage(error),
      },
    };
  },
});

/**
 * Create a server-side caller.
 *
 * @see https://trpc.io/docs/server/server-side-calls
 */
export const createCallerFactory = t.createCallerFactory;

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these a lot in the
 * "/src/server/api/routers" directory.
 */

/**
 * This is how you create new routers and sub-routers in your tRPC API.
 *
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = t.router;

/**
 * Middleware for timing procedure execution and adding an artificial delay in development.
 *
 * You can remove this if you don't like it, but it can help catch unwanted waterfalls by simulating
 * network latency that would occur in production but not in local development.
 */
const timingMiddleware = t.middleware(async ({ next, path }) => {
  const start = Date.now();

  if (t._config.isDev) {
    // artificial delay in dev
    const waitMs = Math.floor(Math.random() * 400) + 100;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  const result = await next();

  const end = Date.now();
  console.log(`[TRPC] ${path} took ${end - start}ms to execute`);

  return result;
});

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */
export const publicProcedure = t.procedure.use(timingMiddleware);

/**
 * Protected (authenticated) procedure
 *
 * This procedure ensures that a user is authenticated before allowing access.
 * Use this for endpoints that require any logged-in user.
 *
 * @throws UNAUTHORIZED if user is not authenticated
 */
export const protectedProcedure = t.procedure
  .use(timingMiddleware)
  .use(async ({ ctx, next }) => {
    if (!ctx.userContext) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "You must be logged in to access this resource",
      });
    }
    return next({
      ctx: {
        ...ctx,
        userContext: ctx.userContext,
      },
    });
  });

/**
 * Admin-only procedure
 *
 * This procedure ensures that a user is authenticated AND has administrator privileges.
 * Use this for endpoints that should only be accessible to administrators.
 *
 * @throws UNAUTHORIZED if user is not authenticated
 * @throws FORBIDDEN if user is not an administrator
 */
export const adminProcedure = t.procedure
  .use(timingMiddleware)
  .use(async ({ ctx, next }) => {
    if (!ctx.userContext) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "You must be logged in to access this resource",
      });
    }
    if (ctx.userContext.role !== "admin") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You must be an administrator to access this resource",
      });
    }
    return next({
      ctx: {
        ...ctx,
        userContext: ctx.userContext,
      },
    });
  });
