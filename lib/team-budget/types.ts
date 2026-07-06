export type Role = "ADMIN" | "MEMBER";
export type UserStatus = "ACTIVE" | "INACTIVE";
export type RestaurantStatus = "ACTIVE" | "INACTIVE";
export type TransactionType = "SPEND" | "TOP_UP" | "ADJUST" | "REVERSAL";

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  avatarUrl: string;
};

export type Restaurant = {
  id: string;
  name: string;
  category: string;
  status: RestaurantStatus;
  memo: string;
  lowBalanceThreshold: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type Balance = {
  restaurantId: string;
  currentAmount: number;
  totalAddedAmount: number;
  totalSpentAmount: number;
  version: number;
  lastTransactionId: string | null;
  updatedAt: string;
};

export type LedgerTransaction = {
  id: string;
  restaurantId: string;
  userId: string;
  userName: string;
  type: TransactionType;
  amountDelta: number;
  balanceBefore: number;
  balanceAfter: number;
  memo: string;
  usedAt: string;
  idempotencyKey: string;
  relatedTransactionId: string | null;
  receiptObjectKey: string | null;
  receiptFileName: string | null;
  receiptContentType: string | null;
  receiptSize: number | null;
  receiptUrl: string | null;
  createdAt: string;
};

export type ReceiptUpload = {
  fileName: string;
  contentType: string;
  size: number;
  bytes: ArrayBuffer;
};

export type AvatarUpload = ReceiptUpload;

export type RestaurantListItem = Restaurant & {
  balance: Balance;
};

export type TransactionMutationResult = {
  transaction: LedgerTransaction;
  balance: Balance;
};

export type DashboardSummary = {
  totalBalance: number;
  totalSpent: number;
  restaurants: RestaurantListItem[];
  recentTransactions: LedgerTransaction[];
};

export type ApiErrorBody = {
  code: string;
  message: string;
  details?: unknown;
};
