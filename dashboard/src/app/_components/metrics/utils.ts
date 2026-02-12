import { toIntlLocale } from "@/i18n/config";
import { type MetricsResponse } from "./types";

export const getDateFormatter = (locale: string) =>
  new Intl.DateTimeFormat(toIntlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  });

export function formatShortDate(
  dateValue: string | Date,
  locale: string,
): string {
  const date = typeof dateValue === "string" ? new Date(dateValue) : dateValue;
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    day: "2-digit",
    month: "short",
  }).format(date);
}

export type MetricsErrorCode =
  | "unauthorized"
  | "forbidden"
  | "notFound"
  | "timeout"
  | "network"
  | "server"
  | "unknown";

function getErrorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

/**
 * Determines whether the provided metrics response contains no user activity.
 *
 * @param data - The metrics response to inspect. If `data` or its `user_activity` is missing, the function returns `false`.
 * @returns `true` if both `user_activity.total_events` and `user_activity.unique_users` are 0, `false` otherwise.
 */
export function isEmptyData(data: MetricsResponse): boolean {
  return (
    data?.user_activity?.total_events === 0 &&
    data?.user_activity?.unique_users === 0
  );
}

/**
 * Resolve an error into a stable code for localized UI messaging.
 */
export function getMetricsErrorCode(error: unknown): MetricsErrorCode {
  const errorMessage = getErrorText(error);

  if (
    errorMessage.includes("UNAUTHORIZED") ||
    errorMessage.includes("You must be logged in")
  ) {
    return "unauthorized";
  }

  if (
    errorMessage.includes("FORBIDDEN") ||
    errorMessage.includes("You must be an administrator") ||
    errorMessage.includes("You do not have permission")
  ) {
    return "forbidden";
  }

  if (errorMessage.includes("NOT_FOUND")) {
    return "notFound";
  }

  if (
    errorMessage.includes("TIMEOUT") ||
    errorMessage.includes("took too long")
  ) {
    return "timeout";
  }

  if (
    errorMessage.includes("fetch failed") ||
    errorMessage.includes("Network request failed")
  ) {
    return "network";
  }

  if (
    errorMessage.includes("INTERNAL_SERVER_ERROR") ||
    errorMessage.includes("Failed to fetch") ||
    errorMessage.includes("Failed to calculate")
  ) {
    return "server";
  }

  return "unknown";
}

/**
 * Determines whether an error is recoverable — i.e., not caused by authorization or permission issues.
 *
 * @param error - The error to evaluate; may be an `Error`, a string, or any other value.
 * @returns `true` if the error is considered recoverable; `false` if it indicates an authorization or permission failure.
 */
export function isRecoverableError(error: unknown): boolean {
  const code = getMetricsErrorCode(error);
  return code !== "unauthorized" && code !== "forbidden";
}
