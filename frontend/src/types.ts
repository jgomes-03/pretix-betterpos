export interface BetterPOSPermissions {
  canManageRegisters: boolean;
  canViewAudit: boolean;
  canSessionControl: boolean;
  canSell: boolean;
}

export interface BetterPOSConfig {
  organizer: string;
  organizerName?: string;
  organizerLogoUrl?: string;
  event: string;
  eventName?: string;
  basePath: string;
  apiBase: string;
  csrfToken?: string;
  brandPrimaryColor?: string;
  brandSecondaryColor?: string;
  permissions: BetterPOSPermissions;
}

export interface Register {
  id: number;
  name: string;
  code: string;
  currency: string;
  is_active?: boolean;
}

export interface Session {
  id: number;
  register_id: number;
  register_name?: string;
  status: string;
  opened_at?: string;
  opening_float?: string;
  expected_cash?: string;
  counted_cash?: string | null;
  difference?: string;
}

export interface CatalogVariation {
  id: number;
  value: string;
  price: string;
}

export interface CatalogItem {
  id: number;
  name: string;
  price: string;
  variations: CatalogVariation[];
}

export interface CartLine {
  item_id: number;
  name: string;
  price: number;
  qty: number;
}

export interface Transaction {
  id: number;
  order_code: string;
  amount: string;
  channel: string;
  state: string;
  register_name?: string;
  operator_name?: string;
  session_id?: number;
  created_at?: string;
}

export interface ReportSummary {
  days: number;
  from: string;
  to: string;
  total_count: number;
  total_sales: string;
  by_channel: Array<{
    channel: string;
    label: string;
    count: number;
    total: string;
  }>;
}

export interface AuditRow {
  id: number;
  action_type: string;
  actor_id?: number;
  register_id?: number;
  session_id?: number;
  order_id?: number;
  payment_id?: number;
  payload?: Record<string, unknown>;
  created_at: string;
}

export type TableRow = Record<string, string | number | boolean | null | undefined>;
