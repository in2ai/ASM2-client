import { type MetricsResponse } from "./types";

export const getDateFormatter = () =>
  new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  });

const shortDateFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
});

export function formatShortDate(dateValue: string | Date): string {
  const date = typeof dateValue === "string" ? new Date(dateValue) : dateValue;
  return shortDateFormatter.format(date);
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
 * Produce a user-facing title for a metrics-related error.
 *
 * @param error - The error to interpret; may be an `Error` object, a string, or any other value.
 * @returns A short title describing the error, one of:
 * `"Unauthorized Access"`, `"Access Denied"`, `"Data Not Found"`, `"Request Timeout"`, `"Server Error"`, or `"Error Loading Metrics"`.
 */
export function getErrorTitle(error: unknown): string {
  if (!error) return "Error Loading Metrics";

  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown error";

  if (
    errorMessage.includes("UNAUTHORIZED") ||
    errorMessage.includes("You must be logged in")
  ) {
    return "Unauthorized Access";
  }

  if (
    errorMessage.includes("FORBIDDEN") ||
    errorMessage.includes("You must be an administrator") ||
    errorMessage.includes("You do not have permission")
  ) {
    return "Access Denied";
  }

  if (errorMessage.includes("NOT_FOUND")) {
    return "Data Not Found";
  }

  if (
    errorMessage.includes("TIMEOUT") ||
    errorMessage.includes("took too long")
  ) {
    return "Request Timeout";
  }

  if (
    errorMessage.includes("INTERNAL_SERVER_ERROR") ||
    errorMessage.includes("Failed to fetch") ||
    errorMessage.includes("Failed to calculate")
  ) {
    return "Server Error";
  }

  return "Error Loading Metrics";
}

/**
 * Generates a user-facing Spanish error message from an Error object or string.
 *
 * Inspects the provided value (Error or string) and returns a localized Spanish message for common cases:
 * authorization issues, permission denials, resource not found, timeouts, network/fetch failures, and server errors.
 * If the error is an Error with a message, that message is returned; otherwise a generic recovery message is returned.
 *
 * @param error - An Error instance or a string describing the error; other types are treated as unknown.
 * @returns A Spanish user-facing message describing the error.
 */
export function getErrorMessage(error: unknown): string {
  if (!error)
    return "No se pudieron recuperar los datos. Por favor, intenta nuevamente.";

  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown error";

  if (
    errorMessage.includes("UNAUTHORIZED") ||
    errorMessage.includes("You must be logged in")
  ) {
    return "No tienes autorización para acceder a estos datos. Por favor, inicia sesión nuevamente.";
  }

  if (
    errorMessage.includes("FORBIDDEN") ||
    errorMessage.includes("You must be an administrator") ||
    errorMessage.includes("You do not have permission")
  ) {
    return "No tienes permisos para acceder a este recurso. Contacta a tu administrador si crees que esto es un error.";
  }

  if (errorMessage.includes("NOT_FOUND")) {
    return "No se encontraron datos para la selección actual.";
  }

  if (
    errorMessage.includes("TIMEOUT") ||
    errorMessage.includes("took too long")
  ) {
    return "La solicitud tardó demasiado en completarse. Por favor, intenta nuevamente.";
  }

  if (
    errorMessage.includes("fetch failed") ||
    errorMessage.includes("Network request failed")
  ) {
    return "Error de conexión. Por favor, verifica tu conexión a internet e intenta nuevamente.";
  }

  if (
    errorMessage.includes("INTERNAL_SERVER_ERROR") ||
    errorMessage.includes("Failed to fetch") ||
    errorMessage.includes("Failed to calculate")
  ) {
    return "Error del servidor. Por favor, intenta nuevamente más tarde o contacta al soporte si el problema persiste.";
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "No se pudieron recuperar los datos. Por favor, intenta nuevamente.";
}

/**
 * Determines whether an error is recoverable — i.e., not caused by authorization or permission issues.
 *
 * @param error - The error to evaluate; may be an `Error`, a string, or any other value.
 * @returns `true` if the error is considered recoverable; `false` if it indicates an authorization or permission failure.
 */
export function isRecoverableError(error: unknown): boolean {
  if (!error) return true;

  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown error";

  if (
    errorMessage.includes("UNAUTHORIZED") ||
    errorMessage.includes("FORBIDDEN") ||
    errorMessage.includes("You must be logged in") ||
    errorMessage.includes("You must be an administrator") ||
    errorMessage.includes("You do not have permission")
  ) {
    return false;
  }

  return true;
}
