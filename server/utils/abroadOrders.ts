export type AbroadCustomerInput = {
  abroad?: unknown;
  abroadPhone?: unknown;
};

export type NormalizedAbroadCustomer = {
  isAbroad: 0 | 1;
  abroadPhone: string | null;
};

export type AbroadOrderRow = {
  is_abroad?: unknown;
  abroad_phone?: unknown;
  phone?: unknown;
};

export type AbroadOrderFilter = {
  clause: string;
  params: number[];
};

export function normalizeAbroadCustomer(input: AbroadCustomerInput): NormalizedAbroadCustomer {
  const abroadValue = input?.abroad;
  const isAbroad =
    abroadValue === true ||
    abroadValue === 1 ||
    abroadValue === '1' ||
    abroadValue === 'true';

  if (!isAbroad) {
    return { isAbroad: 0, abroadPhone: null };
  }

  const abroadPhone =
    typeof input?.abroadPhone === 'string'
      ? input.abroadPhone.replace(/[\s()-]/g, '')
      : '';

  if (!abroadPhone) {
    return { isAbroad: 1, abroadPhone: null };
  }

  if (!/^\+?\d{8,15}$/.test(abroadPhone)) {
    throw new Error('abroad phone must include a valid country code');
  }

  return { isAbroad: 1, abroadPhone };
}

export function buildAbroadOrderFilter(value: unknown): AbroadOrderFilter {
  if (value === 'yes') {
    return { clause: ' AND is_abroad = ?', params: [1] };
  }

  if (value === 'no') {
    return { clause: ' AND is_abroad = ?', params: [0] };
  }

  return { clause: '', params: [] };
}

export function isAbroadOrder(order: AbroadOrderRow): boolean {
  const value = order?.is_abroad;
  return value === true || value === 1 || value === '1';
}

export function getAbroadDisplayPhone(order: AbroadOrderRow): string {
  const value = isAbroadOrder(order)
    ? order.abroad_phone || order.phone
    : order.phone;

  return value == null ? '' : String(value);
}
