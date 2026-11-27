import { buildAbroadOrderFilter } from './abroadOrders.ts';

export type AdminOrdersQueryResult = {
  whereString: string;
  params: any[];
};

// Append the shared abroad filter to an existing WHERE clause using bound params.
export function buildAdminOrdersListQuery(whereClauses: string[], params: any[], abroadValue: unknown): AdminOrdersQueryResult {
  const abroad = buildAbroadOrderFilter(abroadValue);
  const allClauses = abroad.clause ? [...whereClauses, abroad.clause.trim().replace(/^AND\s+/, '')] : [...whereClauses];
  return {
    whereString: allClauses.length ? `WHERE ${allClauses.join(' AND ')}` : '',
    params: [...params, ...abroad.params],
  };
}

export function buildAdminOrdersExportQuery(whereClauses: string[], params: any[], abroadValue: unknown): AdminOrdersQueryResult {
  const { whereString, params: allParams } = buildAdminOrdersListQuery(whereClauses, params, abroadValue);
  return {
    whereString,
    params: allParams,
  };
}
