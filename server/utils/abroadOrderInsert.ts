import { normalizeAbroadCustomer, type AbroadCustomerInput } from './abroadOrders';

export type AbroadOrderInsertFields = {
  columnsSql: string;
  placeholdersSql: string;
  values: [0 | 1, string | null];
};

/**
 * Build the SQL fragments and bound values for the abroad columns of the
 * bf_orders INSERT. Throws when an overseas phone is invalid so callers can
 * reject the request before any database write.
 */
export function buildAbroadOrderInsertFields(customer: AbroadCustomerInput): AbroadOrderInsertFields {
  const { isAbroad, abroadPhone } = normalizeAbroadCustomer(customer);
  return {
    columnsSql: 'is_abroad, abroad_phone',
    placeholdersSql: '?, ?',
    values: [isAbroad, abroadPhone],
  };
}
