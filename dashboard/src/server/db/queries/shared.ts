import type { MetricsQueryParams } from "./types";

export type QueryParam = string | number;

interface FilterOptions {
  includeUserId?: boolean;
  includeUserRole?: boolean;
  includeLang?: boolean;
  startIndex?: number;
}

export function buildFilterConditions(
  params: MetricsQueryParams,
  {
    includeUserId = false,
    includeUserRole = false,
    includeLang = false,
    startIndex = 1,
  }: FilterOptions = {},
): { conditions: string[]; queryParams: QueryParam[] } {
  const conditions: string[] = [];
  const queryParams: QueryParam[] = [];
  let paramIndex = startIndex;

  const addCondition = (
    column: string,
    operator: ">=" | "<=" | "=",
    value: string | undefined,
  ) => {
    if (!value) {
      return;
    }

    conditions.push(`${column} ${operator} $${paramIndex}`);
    queryParams.push(value);
    paramIndex += 1;
  };

  addCondition("ts", ">=", params.startDate);
  addCondition("ts", "<=", params.endDate);

  if (includeUserId) {
    addCondition("user_id", "=", params.userId);
  }

  if (includeUserRole) {
    addCondition("user_role", "=", params.userRole);
  }

  if (includeLang) {
    addCondition("lang", "=", params.lang);
  }

  return { conditions, queryParams };
}

export function appendAndConditions(
  query: string,
  conditions: string[],
): string {
  if (conditions.length === 0) {
    return query;
  }

  return `${query} AND ${conditions.join(" AND ")}`;
}

export function parseCount(value: string | undefined): number {
  return Number.parseInt(value ?? "0", 10);
}
