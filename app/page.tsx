"use client";

import { FormEvent, useMemo, useState } from "react";
import type {
  ApiErrorBody,
  Balance,
  DashboardSummary,
  LedgerTransaction,
  Restaurant,
  RestaurantListItem,
  Role,
  TransactionMutationResult,
  TransactionType,
  User,
} from "@/lib/team-budget/types";

type View = "dashboard" | "restaurants" | "transactions" | "admin";
type ActionMode = "spend" | "topup" | "adjust";
type AuthMode = "login" | "signup";

type Toast = {
  tone: "success" | "warning" | "danger";
  message: string;
} | null;

type LoginResponse = {
  accessToken: string;
  user: User;
};

type ListResponse<T> = {
  items: T[];
  total: number;
};

const anonymousUser: User = {
  id: "",
  name: "",
  email: "",
  role: "MEMBER",
  status: "ACTIVE",
  avatarUrl: "/default-avatar.svg",
};

const navItems: { id: View; label: string; adminOnly?: boolean }[] = [
  { id: "dashboard", label: "대시보드" },
  { id: "restaurants", label: "식당" },
  { id: "transactions", label: "거래 내역" },
  { id: "admin", label: "관리", adminOnly: true },
];

const typeLabels: Record<TransactionType, string> = {
  SPEND: "사용",
  TOP_UP: "금액 추가",
  ADJUST: "조정",
  REVERSAL: "취소",
};

const moneyFormatter = new Intl.NumberFormat("ko-KR");

function formatMoney(value: number) {
  return `${moneyFormatter.format(value)}원`;
}

function formatNumberInput(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  return digits ? moneyFormatter.format(Number(digits)) : "";
}

function formatDelta(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatMoney(value)}`;
}

function getToday() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function createIdempotencyKey(prefix: string) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function splitRestaurantItems(items: RestaurantListItem[]) {
  return {
    restaurants: items.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      status: item.status,
      memo: item.memo,
      lowBalanceThreshold: item.lowBalanceThreshold,
      createdBy: item.createdBy,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
    balances: items.map((item) => item.balance),
  };
}

async function parseApiError(response: Response) {
  try {
    const error = (await response.json()) as ApiErrorBody;
    return error.message || "요청 처리 중 오류가 발생했습니다.";
  } catch {
    return "요청 처리 중 오류가 발생했습니다.";
  }
}

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [loginRole, setLoginRole] = useState<Role>("ADMIN");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupAvatarFile, setSignupAvatarFile] = useState<File | null>(null);
  const [signupAvatarPreviewUrl, setSignupAvatarPreviewUrl] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<User>(anonymousUser);
  const [users, setUsers] = useState<User[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [selectedRestaurantId, setSelectedRestaurantId] = useState("");
  const [restaurantQuery, setRestaurantQuery] = useState("");
  const [transactionFilter, setTransactionFilter] = useState<
    "ALL" | TransactionType
  >("ALL");
  const [actionMode, setActionMode] = useState<ActionMode>("spend");
  const [amountInput, setAmountInput] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState("");
  const [dateInput, setDateInput] = useState(getToday());
  const [adjustDirection, setAdjustDirection] = useState<"increase" | "decrease">(
    "increase",
  );
  const [toast, setToast] = useState<Toast>(null);
  const [newRestaurantName, setNewRestaurantName] = useState("");
  const [newRestaurantAmount, setNewRestaurantAmount] = useState("");

  const isAdmin = currentUser.role === "ADMIN";

  const balanceByRestaurant = useMemo(() => {
    return new Map(balances.map((balance) => [balance.restaurantId, balance]));
  }, [balances]);

  const restaurantById = useMemo(() => {
    return new Map(restaurants.map((restaurant) => [restaurant.id, restaurant]));
  }, [restaurants]);

  const activeRestaurants = restaurants.filter(
    (restaurant) => restaurant.status === "ACTIVE",
  );

  const totalBalance = balances.reduce(
    (total, balance) => total + balance.currentAmount,
    0,
  );

  const totalSpent = balances.reduce(
    (total, balance) => total + balance.totalSpentAmount,
    0,
  );

  const lowBalanceRestaurants = activeRestaurants.filter((restaurant) => {
    const balance = balanceByRestaurant.get(restaurant.id);
    return balance
      ? balance.currentAmount <= restaurant.lowBalanceThreshold
      : false;
  });

  const filteredRestaurants = activeRestaurants.filter((restaurant) => {
    const query = restaurantQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      restaurant.name.toLowerCase().includes(query) ||
      restaurant.category.toLowerCase().includes(query)
    );
  });

  const filteredTransactions = transactions.filter((transaction) => {
    if (transactionFilter === "ALL") return true;
    return transaction.type === transactionFilter;
  });

  const selectedRestaurant =
    restaurantById.get(selectedRestaurantId) ?? restaurants[0] ?? null;
  const selectedBalance = selectedRestaurant
    ? balanceByRestaurant.get(selectedRestaurant.id)
    : null;
  const reversedTransactionIds = useMemo(() => {
    return new Set(
      transactions
        .filter((transaction) => transaction.type === "REVERSAL")
        .map((transaction) => transaction.relatedTransactionId),
    );
  }, [transactions]);
  const selectedTransactions = selectedRestaurant
    ? transactions.filter(
        (transaction) =>
          transaction.restaurantId === selectedRestaurant.id &&
          transaction.type !== "REVERSAL" &&
          !reversedTransactionIds.has(transaction.id),
      )
    : [];

  async function apiFetch<T>(
    path: string,
    options: RequestInit = {},
    tokenOverride = accessToken,
  ) {
    const isFormData = options.body instanceof FormData;
    const headers = new Headers(options.headers);
    if (!isFormData && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    if (tokenOverride) {
      headers.set("authorization", `Bearer ${tokenOverride}`);
    }

    const response = await fetch(`/api${path}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new Error(await parseApiError(response));
    }

    return (await response.json()) as T;
  }

  async function loadAppData(token: string, user: User) {
    const [summary, transactionResponse, usersResponse] = await Promise.all([
      apiFetch<DashboardSummary>("/dashboard/summary", {}, token),
      apiFetch<ListResponse<LedgerTransaction>>("/transactions", {}, token),
      user.role === "ADMIN"
        ? apiFetch<ListResponse<User>>("/users", {}, token)
        : Promise.resolve({ items: [user], total: 1 }),
    ]);
    const next = splitRestaurantItems(summary.restaurants);

    setRestaurants(next.restaurants);
    setBalances(next.balances);
    setTransactions(transactionResponse.items);
    setUsers(usersResponse.items);
    setSelectedRestaurantId((current) => {
      if (current && next.restaurants.some((item) => item.id === current)) {
        return current;
      }
      return next.restaurants[0]?.id ?? "";
    });
  }

  function selectRestaurant(restaurantId: string) {
    setSelectedRestaurantId(restaurantId);
    setActiveView("restaurants");
    setToast(null);
  }

  function resetTransactionForm(mode: ActionMode) {
    setActionMode(mode);
    setAmountInput("");
    setReceiptFile(null);
    setReceiptPreviewUrl("");
    setDateInput(getToday());
    setAdjustDirection("increase");
    setToast(null);
  }

  function handleReceiptFileChange(file: File | null) {
    if (receiptPreviewUrl) {
      URL.revokeObjectURL(receiptPreviewUrl);
    }
    setReceiptFile(file);
    setReceiptPreviewUrl(file ? URL.createObjectURL(file) : "");
  }

  function handleSignupAvatarChange(file: File | null) {
    if (signupAvatarPreviewUrl) {
      URL.revokeObjectURL(signupAvatarPreviewUrl);
    }
    setSignupAvatarFile(file);
    setSignupAvatarPreviewUrl(file ? URL.createObjectURL(file) : "");
  }

  async function completeAuthentication(result: LoginResponse) {
    setAccessToken(result.accessToken);
    setCurrentUser(result.user);
    await loadAppData(result.accessToken, result.user);
    setIsAuthenticated(true);
    setActiveView("dashboard");
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    try {
      const result = await apiFetch<LoginResponse>(
        "/auth/login",
        {
          method: "POST",
          body: JSON.stringify({ role: loginRole }),
        },
        "",
      );
      await completeAuthentication(result);
      setToast({
        tone: "success",
        message: `${result.user.name}님으로 로그인했습니다.`,
      });
    } catch (error) {
      setToast({
        tone: "danger",
        message:
          error instanceof Error ? error.message : "로그인에 실패했습니다.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    try {
      const body = new FormData();
      body.append("name", signupName);
      body.append("email", signupEmail);
      if (signupAvatarFile) {
        body.append("avatar", signupAvatarFile);
      }

      const result = await apiFetch<LoginResponse>(
        "/auth/signup",
        {
          method: "POST",
          body,
        },
        "",
      );
      await completeAuthentication(result);
      setSignupName("");
      setSignupEmail("");
      handleSignupAvatarChange(null);
      setToast({
        tone: "success",
        message: `${result.user.name}님, 팀 가계부에 오신 것을 환영합니다.`,
      });
    } catch (error) {
      setToast({
        tone: "danger",
        message:
          error instanceof Error ? error.message : "회원가입에 실패했습니다.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleTransactionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRestaurant || !selectedBalance) return;

    const amount = Number(amountInput.replace(/[^\d]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      setToast({ tone: "danger", message: "0원보다 큰 금액을 입력해 주세요." });
      return;
    }
    if (actionMode === "spend" && !receiptFile) {
      window.alert("영수증 사진을 첨부해주세요.");
      return;
    }

    const endpoint =
      actionMode === "spend"
        ? `/restaurants/${selectedRestaurant.id}/transactions/spend`
        : actionMode === "topup"
          ? `/restaurants/${selectedRestaurant.id}/transactions/top-up`
          : `/restaurants/${selectedRestaurant.id}/transactions/adjust`;
    const amountDelta = adjustDirection === "increase" ? amount : -amount;
    const body =
      actionMode === "spend"
        ? new FormData()
        : actionMode === "adjust"
          ? {
              amountDelta,
              idempotencyKey: createIdempotencyKey("adjust"),
            }
          : {
              amount,
              usedAt: dateInput || getToday(),
              idempotencyKey: createIdempotencyKey(actionMode),
            };

    if (body instanceof FormData) {
      body.append("amount", String(amount));
      body.append("usedAt", dateInput || getToday());
      body.append("idempotencyKey", createIdempotencyKey("spend"));
      if (receiptFile) {
        body.append("receipt", receiptFile);
      }
    }

    setIsLoading(true);
    try {
      const result = await apiFetch<TransactionMutationResult>(endpoint, {
        method: "POST",
        body: body instanceof FormData ? body : JSON.stringify(body),
      });
      await loadAppData(accessToken, currentUser);
      setAmountInput("");
      handleReceiptFileChange(null);
      setToast({
        tone: result.transaction.amountDelta < 0 ? "warning" : "success",
        message: `${selectedRestaurant.name} 잔액이 ${formatDelta(
          result.transaction.amountDelta,
        )} 변경되었습니다.`,
      });
    } catch (error) {
      setToast({
        tone: "danger",
        message:
          error instanceof Error ? error.message : "거래 저장에 실패했습니다.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateRestaurant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin) return;

    const trimmedName = newRestaurantName.trim();
    const initialAmount = Number(newRestaurantAmount.replace(/[^\d]/g, ""));
    if (!trimmedName) {
      setToast({ tone: "danger", message: "식당명을 입력해 주세요." });
      return;
    }
    if (!Number.isFinite(initialAmount) || initialAmount < 0) {
      setToast({ tone: "danger", message: "초기 금액을 확인해 주세요." });
      return;
    }

    setIsLoading(true);
    try {
      const result = await apiFetch<{ restaurant: RestaurantListItem }>(
        "/restaurants",
        {
          method: "POST",
          body: JSON.stringify({
            name: trimmedName,
            initialAmount,
          }),
        },
      );
      await loadAppData(accessToken, currentUser);
      setSelectedRestaurantId(result.restaurant.id);
      setNewRestaurantName("");
      setNewRestaurantAmount("");
      setToast({ tone: "success", message: `${trimmedName}을 추가했습니다.` });
    } catch (error) {
      setToast({
        tone: "danger",
        message:
          error instanceof Error ? error.message : "식당 추가에 실패했습니다.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDeleteRestaurant(restaurant: Restaurant) {
    if (!isAdmin) return;
    const confirmed = window.confirm(
      `${restaurant.name} 식당을 목록에서 삭제할까요? 기존 잔액과 거래 이력은 보존됩니다.`,
    );
    if (!confirmed) return;

    setIsLoading(true);
    try {
      await apiFetch<{ restaurant: RestaurantListItem }>(
        `/restaurants/${restaurant.id}`,
        { method: "DELETE" },
      );
      setRestaurants((items) =>
        items.filter((item) => item.id !== restaurant.id),
      );
      setBalances((items) =>
        items.filter((item) => item.restaurantId !== restaurant.id),
      );
      setSelectedRestaurantId((current) => {
        if (current !== restaurant.id) {
          return current;
        }

        return restaurants.find(
          (item) => item.id !== restaurant.id && item.status === "ACTIVE",
        )?.id ?? "";
      });
      setToast({
        tone: "success",
        message: `${restaurant.name} 식당을 목록에서 삭제했습니다.`,
      });
    } catch (error) {
      setToast({
        tone: "danger",
        message:
          error instanceof Error ? error.message : "식당 삭제에 실패했습니다.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleVoidOwnSpendTransaction(transaction: LedgerTransaction) {
    const canDelete =
      currentUser.role === "MEMBER" &&
      transaction.type === "SPEND" &&
      transaction.userId === currentUser.id;
    if (!canDelete) return;

    const confirmed = window.confirm(
      "이 사용 내역을 삭제할까요? 삭제하면 사용 금액이 식당 잔액으로 복구됩니다.",
    );
    if (!confirmed) return;

    setIsLoading(true);
    try {
      await apiFetch<TransactionMutationResult>(
        `/transactions/${transaction.id}/void`,
        {
          method: "POST",
          body: JSON.stringify({
            reason: "팀원 본인 사용 내역 삭제",
            idempotencyKey: createIdempotencyKey("void"),
          }),
        },
      );
      await loadAppData(accessToken, currentUser);
      setToast({
        tone: "success",
        message: "사용 내역을 삭제했고 식당 잔액을 복구했습니다.",
      });
    } catch (error) {
      setToast({
        tone: "danger",
        message:
          error instanceof Error
            ? error.message
            : "사용 내역 삭제에 실패했습니다.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function updateUserRole(userId: string, role: Role) {
    setIsLoading(true);
    try {
      const result = await apiFetch<{ user: User }>(`/users/${userId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      setUsers((items) =>
        items.map((user) => (user.id === userId ? result.user : user)),
      );
      if (currentUser.id === userId) {
        setCurrentUser(result.user);
      }
      setToast({ tone: "success", message: "사용자 권한을 변경했습니다." });
    } catch (error) {
      setToast({
        tone: "danger",
        message:
          error instanceof Error ? error.message : "권한 변경에 실패했습니다.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function openReceipt(transaction: LedgerTransaction) {
    if (!transaction.receiptUrl) return;
    try {
      const response = await fetch(transaction.receiptUrl, {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });
      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      setToast({
        tone: "danger",
        message:
          error instanceof Error ? error.message : "영수증을 열 수 없습니다.",
      });
    }
  }

  if (!isAuthenticated) {
    return (
      <main className="login-screen">
        <div className="login-nav">
          <div className="brand-mark" aria-hidden="true" />
          <span>팀 가계부</span>
        </div>
        {toast && (
          <aside className={`toast ${toast.tone}`} role="status">
            {toast.message}
          </aside>
        )}
        <section className="login-panel" aria-labelledby="login-title">
          <p className="eyebrow">Mydata Team</p>
          <h1 id="login-title">
            {authMode === "login" ? "Bookkeeping" : "팀원 계정을 만듭니다."}
          </h1>
          {authMode === "signup" && (
            <p className="login-copy">
              이름과 이메일을 등록하면 팀원 권한으로 바로 시작할 수 있습니다.
            </p>
          )}
          {authMode === "login" ? (
            <form className="login-form" onSubmit={handleLogin}>
              <label>
                계정
                <input
                  value={
                    loginRole === "ADMIN"
                      ? "admin@team.local"
                      : "member@team.local"
                  }
                  readOnly
                />
              </label>
              <label>
                비밀번호
                <input value="front-demo" readOnly type="password" />
              </label>
              <div className="segmented" aria-label="로그인 역할 선택">
                <button
                  className={loginRole === "MEMBER" ? "active" : ""}
                  type="button"
                  onClick={() => setLoginRole("MEMBER")}
                >
                  팀원
                </button>
                <button
                  className={loginRole === "ADMIN" ? "active" : ""}
                  type="button"
                  onClick={() => setLoginRole("ADMIN")}
                >
                  관리자
                </button>
              </div>
              <button
                className="secondary-button"
                disabled={isLoading}
                type="button"
                onClick={() => {
                  setAuthMode("signup");
                  setToast(null);
                }}
              >
                회원가입
              </button>
              <button className="primary-button" disabled={isLoading} type="submit">
                {isLoading ? "로그인 중" : "로그인"}
              </button>
            </form>
          ) : (
            <form className="login-form" onSubmit={handleSignup}>
              <label>
                이름
                <input
                  autoComplete="name"
                  placeholder="홍길동"
                  value={signupName}
                  onChange={(event) => setSignupName(event.target.value)}
                />
              </label>
              <label>
                이메일
                <input
                  autoComplete="email"
                  inputMode="email"
                  placeholder="name@team.local"
                  type="email"
                  value={signupEmail}
                  onChange={(event) => setSignupEmail(event.target.value)}
                />
              </label>
              <div className="signup-avatar-field">
                <span>프로필 사진</span>
                <div className="signup-avatar-control">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt=""
                    src={signupAvatarPreviewUrl || "/default-avatar.svg"}
                  />
                  <label className="file-button">
                    사진 선택
                    <input
                      accept="image/jpeg,image/png,image/webp"
                      type="file"
                      onChange={(event) =>
                        handleSignupAvatarChange(event.target.files?.[0] ?? null)
                      }
                    />
                  </label>
                  {signupAvatarFile && (
                    <button
                      className="secondary-button compact-button"
                      type="button"
                      onClick={() => handleSignupAvatarChange(null)}
                    >
                      기본 사진 사용
                    </button>
                  )}
                </div>
                <small>사진을 첨부하지 않으면 기본 프로필 사진이 사용됩니다.</small>
              </div>
              <p className="auth-help">
                가입한 계정은 팀원 권한으로 생성되며, 관리자가 관리자 권한으로
                변경할 수 있습니다.
              </p>
              <button className="primary-button" disabled={isLoading} type="submit">
                {isLoading ? "가입 중" : "가입하기"}
              </button>
              <button
                className="secondary-button"
                disabled={isLoading}
                type="button"
                onClick={() => {
                  setAuthMode("login");
                  setToast(null);
                }}
              >
                로그인으로 돌아가기
              </button>
            </form>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="top-nav">
        <button
          className="brand-button"
          type="button"
          onClick={() => setActiveView("dashboard")}
        >
          <span className="brand-mark" aria-hidden="true" />
          <span>마이데이터팀 가계부</span>
        </button>
        <nav aria-label="주요 화면">
          {navItems
            .filter((item) => !item.adminOnly || isAdmin)
            .map((item) => (
              <button
                className={activeView === item.id ? "active" : ""}
                key={item.id}
                type="button"
                onClick={() => setActiveView(item.id)}
              >
                {item.label}
              </button>
            ))}
        </nav>
        <div className="user-area">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="user-avatar" alt="" src={currentUser.avatarUrl} />
          <span className={`role-pill ${currentUser.role.toLowerCase()}`}>
            {currentUser.role === "ADMIN" ? "관리자" : "팀원"}
          </span>
          <span>{currentUser.name}</span>
          <button type="button" onClick={() => setIsAuthenticated(false)}>
            로그아웃
          </button>
        </div>
      </header>

      {toast && (
        <aside className={`toast ${toast.tone}`} role="status">
          {toast.message}
        </aside>
      )}

      <section className="workspace">
        {activeView === "dashboard" && (
          <DashboardView
            balances={balances}
            lowBalanceRestaurants={lowBalanceRestaurants}
            recentTransactions={transactions.slice(0, 5)}
            restaurants={restaurants}
            totalBalance={totalBalance}
            totalSpent={totalSpent}
            onSelectRestaurant={selectRestaurant}
            onOpenReceipt={openReceipt}
            onStartSpend={(restaurantId) => {
              setSelectedRestaurantId(restaurantId);
              resetTransactionForm("spend");
              setActiveView("restaurants");
            }}
          />
        )}

        {activeView === "restaurants" && selectedRestaurant && selectedBalance && (
          <RestaurantsView
            actionMode={actionMode}
            adjustDirection={adjustDirection}
            amountInput={amountInput}
            balanceByRestaurant={balanceByRestaurant}
            currentUser={currentUser}
            dateInput={dateInput}
            filteredRestaurants={filteredRestaurants}
            isAdmin={isAdmin}
            newRestaurantAmount={newRestaurantAmount}
            newRestaurantName={newRestaurantName}
            query={restaurantQuery}
            receiptFile={receiptFile}
            receiptPreviewUrl={receiptPreviewUrl}
            selectedBalance={selectedBalance}
            selectedRestaurant={selectedRestaurant}
            selectedTransactions={selectedTransactions}
            onActionModeChange={resetTransactionForm}
            onAdjustDirectionChange={setAdjustDirection}
            onAmountInputChange={(value) =>
              setAmountInput(formatNumberInput(value))
            }
            onCreateRestaurant={handleCreateRestaurant}
            onDateInputChange={setDateInput}
            onDeleteRestaurant={handleDeleteRestaurant}
            onDeleteTransaction={handleVoidOwnSpendTransaction}
            onNewRestaurantAmountChange={(value) =>
              setNewRestaurantAmount(formatNumberInput(value))
            }
            onNewRestaurantNameChange={setNewRestaurantName}
            onQueryChange={setRestaurantQuery}
            onReceiptFileChange={handleReceiptFileChange}
            onSelectRestaurant={setSelectedRestaurantId}
            onSubmitTransaction={handleTransactionSubmit}
            onOpenReceipt={openReceipt}
          />
        )}

        {activeView === "transactions" && (
          <TransactionsView
            filter={transactionFilter}
            restaurants={restaurantById}
            transactions={filteredTransactions}
            onFilterChange={setTransactionFilter}
            onOpenReceipt={openReceipt}
          />
        )}

        {activeView === "admin" && isAdmin && (
          <AdminView
            balances={balances}
            restaurants={restaurants}
            transactions={transactions}
            users={users}
            onRoleChange={updateUserRole}
          />
        )}
      </section>
    </main>
  );
}

function DashboardView({
  balances,
  lowBalanceRestaurants,
  onOpenReceipt,
  onSelectRestaurant,
  onStartSpend,
  recentTransactions,
  restaurants,
  totalBalance,
  totalSpent,
}: {
  balances: Balance[];
  lowBalanceRestaurants: Restaurant[];
  onOpenReceipt: (transaction: LedgerTransaction) => void;
  onSelectRestaurant: (restaurantId: string) => void;
  onStartSpend: (restaurantId: string) => void;
  recentTransactions: LedgerTransaction[];
  restaurants: Restaurant[];
  totalBalance: number;
  totalSpent: number;
}) {
  const restaurantById = new Map(
    restaurants.map((restaurant) => [restaurant.id, restaurant]),
  );
  const firstRestaurant = restaurants[0];
  const maxBalance = Math.max(
    1,
    ...balances.map((balance) => balance.currentAmount),
  );
  const balancesByAmountDesc = [...balances].sort(
    (a, b) => b.currentAmount - a.currentAmount,
  );

  return (
    <div className="view-stack">
      <section className="summary-hero">
        <div>
          <p className="eyebrow">현재 사용 가능 잔액</p>
          <h1>{formatMoney(totalBalance)}</h1>
          <p>
            활성 식당 {restaurants.length}곳의 예산을 원장 기준으로 관리합니다.
          </p>
        </div>
        <div className="hero-actions">
          <button
            disabled={!firstRestaurant}
            type="button"
            onClick={() => firstRestaurant && onStartSpend(firstRestaurant.id)}
          >
            사용 등록
          </button>
          <button
            disabled={!firstRestaurant}
            type="button"
            onClick={() =>
              firstRestaurant && onSelectRestaurant(firstRestaurant.id)
            }
          >
            식당 보기
          </button>
        </div>
      </section>

      <section className="metric-grid" aria-label="요약 지표">
        <article>
          <span>누적 사용</span>
          <strong>{formatMoney(totalSpent)}</strong>
          <small>이번 원장 기준 합계</small>
        </article>
        <article>
          <span>잔액 부족</span>
          <strong>{lowBalanceRestaurants.length}곳</strong>
          <small>관리자 확인 필요</small>
        </article>
        <article>
          <span>최근 거래</span>
          <strong>{recentTransactions.length}건</strong>
          <small>최신순 표시</small>
        </article>
      </section>

      <section className="split-layout">
        <div className="surface-block">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Restaurants</p>
              <h2>식당별 잔액</h2>
            </div>
          </div>
          <div className="balance-list">
            {balancesByAmountDesc.map((balance) => {
              const restaurant = restaurantById.get(balance.restaurantId);
              if (!restaurant) return null;
              const ratio = Math.max(
                8,
                Math.round((balance.currentAmount / maxBalance) * 100),
              );
              return (
                <button
                  className="balance-row"
                  key={balance.restaurantId}
                  type="button"
                  onClick={() => onSelectRestaurant(balance.restaurantId)}
                >
                  <span>
                    <strong>{restaurant.name}</strong>
                    <small>{restaurant.category}</small>
                  </span>
                  <span className="balance-meter" aria-hidden="true">
                    <i style={{ width: `${ratio}%` }} />
                  </span>
                  <b>{formatMoney(balance.currentAmount)}</b>
                </button>
              );
            })}
          </div>
        </div>

        <div className="surface-block">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Recent</p>
              <h2>최근 거래</h2>
            </div>
          </div>
          <TransactionTable
            onOpenReceipt={onOpenReceipt}
            restaurants={restaurantById}
            transactions={recentTransactions}
          />
        </div>
      </section>
    </div>
  );
}

function RestaurantsView({
  actionMode,
  adjustDirection,
  amountInput,
  balanceByRestaurant,
  currentUser,
  dateInput,
  filteredRestaurants,
  isAdmin,
  newRestaurantAmount,
  newRestaurantName,
  receiptFile,
  receiptPreviewUrl,
  onActionModeChange,
  onAdjustDirectionChange,
  onAmountInputChange,
  onCreateRestaurant,
  onDateInputChange,
  onDeleteRestaurant,
  onDeleteTransaction,
  onNewRestaurantAmountChange,
  onNewRestaurantNameChange,
  onOpenReceipt,
  onQueryChange,
  onReceiptFileChange,
  onSelectRestaurant,
  onSubmitTransaction,
  query,
  selectedBalance,
  selectedRestaurant,
  selectedTransactions,
}: {
  actionMode: ActionMode;
  adjustDirection: "increase" | "decrease";
  amountInput: string;
  balanceByRestaurant: Map<string, Balance>;
  currentUser: User;
  dateInput: string;
  filteredRestaurants: Restaurant[];
  isAdmin: boolean;
  newRestaurantAmount: string;
  newRestaurantName: string;
  receiptFile: File | null;
  receiptPreviewUrl: string;
  onActionModeChange: (mode: ActionMode) => void;
  onAdjustDirectionChange: (direction: "increase" | "decrease") => void;
  onAmountInputChange: (value: string) => void;
  onCreateRestaurant: (event: FormEvent<HTMLFormElement>) => void;
  onDateInputChange: (value: string) => void;
  onDeleteRestaurant: (restaurant: Restaurant) => void;
  onDeleteTransaction: (transaction: LedgerTransaction) => void;
  onNewRestaurantAmountChange: (value: string) => void;
  onNewRestaurantNameChange: (value: string) => void;
  onOpenReceipt: (transaction: LedgerTransaction) => void;
  onQueryChange: (value: string) => void;
  onReceiptFileChange: (file: File | null) => void;
  onSelectRestaurant: (restaurantId: string) => void;
  onSubmitTransaction: (event: FormEvent<HTMLFormElement>) => void;
  query: string;
  selectedBalance: Balance;
  selectedRestaurant: Restaurant;
  selectedTransactions: LedgerTransaction[];
}) {
  const canDeleteOwnSpend = (transaction: LedgerTransaction) =>
    currentUser.role === "MEMBER" &&
    transaction.type === "SPEND" &&
    transaction.userId === currentUser.id;
  const actionTitle =
    actionMode === "spend"
      ? "사용 내역 등록"
      : actionMode === "topup"
        ? "관리자 금액 추가"
        : "관리자 잔액 조정";

  return (
    <div className="view-stack">
      <section className="detail-hero">
        <div>
          <p className="eyebrow">Selected Restaurant</p>
          <h1>{selectedRestaurant.name}</h1>
          <p>{selectedRestaurant.memo}</p>
        </div>
        <div className="balance-focus">
          <span>현재 잔액</span>
          <strong>{formatMoney(selectedBalance.currentAmount)}</strong>
          <small>마지막 갱신 {selectedBalance.updatedAt}</small>
        </div>
      </section>

      <section className="split-layout restaurants-layout">
        <div className="surface-block">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Browse</p>
              <h2>식당 목록</h2>
            </div>
          </div>
          <input
            className="search-input"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="식당명 또는 카테고리 검색"
          />
          <div className="restaurant-list">
            {filteredRestaurants.map((restaurant) => {
              const balance = balanceByRestaurant.get(restaurant.id);
              const isSelected = selectedRestaurant.id === restaurant.id;
              const isLow =
                balance &&
                balance.currentAmount <= restaurant.lowBalanceThreshold;
              return (
                <div className="restaurant-list-row" key={restaurant.id}>
                  <button
                    className={`restaurant-item ${isSelected ? "active" : ""}`}
                    type="button"
                    onClick={() => onSelectRestaurant(restaurant.id)}
                  >
                    <span>
                      <strong>{restaurant.name}</strong>
                      <small>{restaurant.category}</small>
                    </span>
                    <span>
                      <b>{balance ? formatMoney(balance.currentAmount) : "-"}</b>
                      {isLow && <small className="warning-text">잔액 주의</small>}
                    </span>
                  </button>
                  {isAdmin && (
                    <button
                      className="delete-restaurant-button"
                      type="button"
                      onClick={() => onDeleteRestaurant(restaurant)}
                    >
                      삭제
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="surface-block">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Action</p>
              <h2>{actionTitle}</h2>
            </div>
            <div className="segmented compact">
              <button
                className={actionMode === "spend" ? "active" : ""}
                type="button"
                onClick={() => onActionModeChange("spend")}
              >
                사용
              </button>
              {isAdmin && (
                <>
                  <button
                    className={actionMode === "topup" ? "active" : ""}
                    type="button"
                    onClick={() => onActionModeChange("topup")}
                  >
                    추가
                  </button>
                  <button
                    className={actionMode === "adjust" ? "active" : ""}
                    type="button"
                    onClick={() => onActionModeChange("adjust")}
                  >
                    조정
                  </button>
                </>
              )}
            </div>
          </div>

          <form className="action-form" onSubmit={onSubmitTransaction}>
            {actionMode === "adjust" && (
              <div className="segmented">
                <button
                  className={adjustDirection === "increase" ? "active" : ""}
                  type="button"
                  onClick={() => onAdjustDirectionChange("increase")}
                >
                  증액
                </button>
                <button
                  className={adjustDirection === "decrease" ? "active" : ""}
                  type="button"
                  onClick={() => onAdjustDirectionChange("decrease")}
                >
                  감액
                </button>
              </div>
            )}
            <label>
              금액
              <input
                inputMode="numeric"
                placeholder="예: 25,000"
                value={amountInput}
                onChange={(event) => onAmountInputChange(event.target.value)}
              />
            </label>
            <label>
              사용일
              <input
                type="date"
                value={dateInput}
                onChange={(event) => onDateInputChange(event.target.value)}
              />
            </label>
            {actionMode === "spend" && (
              <div className="receipt-field">
                <label>
                  영수증 사진
                  <input
                    accept="image/jpeg,image/png,image/webp"
                    type="file"
                    onChange={(event) =>
                      onReceiptFileChange(event.target.files?.[0] ?? null)
                    }
                  />
                </label>
                {receiptFile && (
                  <div className="receipt-preview">
                    {receiptPreviewUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img alt="첨부한 영수증 미리보기" src={receiptPreviewUrl} />
                    )}
                    <span>
                      <strong>{receiptFile.name}</strong>
                      <small>{Math.ceil(receiptFile.size / 1024)}KB</small>
                    </span>
                    <button type="button" onClick={() => onReceiptFileChange(null)}>
                      제거
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className="balance-preview">
              <span>변경 전</span>
              <b>{formatMoney(selectedBalance.currentAmount)}</b>
            </div>
            <button className="primary-button" type="submit">
              저장
            </button>
          </form>
        </div>
      </section>

      {isAdmin && (
        <section className="surface-block">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Admin</p>
              <h2>식당 추가</h2>
            </div>
          </div>
          <form className="inline-form" onSubmit={onCreateRestaurant}>
            <label>
              식당명
              <input
                value={newRestaurantName}
                onChange={(event) =>
                  onNewRestaurantNameChange(event.target.value)
                }
                placeholder="새 식당명"
              />
            </label>
            <label>
              초기 금액
              <input
                inputMode="numeric"
                value={newRestaurantAmount}
                onChange={(event) =>
                  onNewRestaurantAmountChange(event.target.value)
                }
                placeholder="예: 100,000"
              />
            </label>
            <button type="submit">식당 추가</button>
          </form>
        </section>
      )}

      <section className="surface-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Ledger</p>
            <h2>식당 상세 거래</h2>
          </div>
        </div>
        <TransactionTable
          canDeleteTransaction={canDeleteOwnSpend}
          onDeleteTransaction={onDeleteTransaction}
          onOpenReceipt={onOpenReceipt}
          restaurants={new Map([[selectedRestaurant.id, selectedRestaurant]])}
          transactions={selectedTransactions}
        />
      </section>
    </div>
  );
}

function TransactionsView({
  filter,
  onFilterChange,
  onOpenReceipt,
  restaurants,
  transactions,
}: {
  filter: "ALL" | TransactionType;
  onFilterChange: (filter: "ALL" | TransactionType) => void;
  onOpenReceipt: (transaction: LedgerTransaction) => void;
  restaurants: Map<string, Restaurant>;
  transactions: LedgerTransaction[];
}) {
  return (
    <div className="view-stack">
      <section className="section-hero">
        <div>
          <p className="eyebrow">Ledger</p>
          <h1>거래 내역</h1>
          <p>사용, 금액 추가, 조정 내역을 최신순으로 확인합니다.</p>
        </div>
      </section>
      <section className="surface-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Filter</p>
            <h2>이력 조회</h2>
          </div>
          <div className="segmented compact">
            {(["ALL", "SPEND", "TOP_UP", "ADJUST"] as const).map((type) => (
              <button
                className={filter === type ? "active" : ""}
                key={type}
                type="button"
                onClick={() => onFilterChange(type)}
              >
                {type === "ALL" ? "전체" : typeLabels[type]}
              </button>
            ))}
          </div>
        </div>
        <TransactionTable
          onOpenReceipt={onOpenReceipt}
          restaurants={restaurants}
          transactions={transactions}
        />
      </section>
    </div>
  );
}

function AdminView({
  balances,
  onRoleChange,
  restaurants,
  transactions,
  users,
}: {
  balances: Balance[];
  onRoleChange: (userId: string, role: Role) => void;
  restaurants: Restaurant[];
  transactions: LedgerTransaction[];
  users: User[];
}) {
  const totalAdded = balances.reduce(
    (total, balance) => total + balance.totalAddedAmount,
    0,
  );
  const reversedTransactionIds = new Set(
    transactions
      .filter((transaction) => transaction.type === "REVERSAL")
      .map((transaction) => transaction.relatedTransactionId)
      .filter(Boolean),
  );
  const spendTotalsByUser = transactions.reduce((totals, transaction) => {
    if (
      transaction.type === "SPEND" &&
      !reversedTransactionIds.has(transaction.id)
    ) {
      totals.set(
        transaction.userId,
        (totals.get(transaction.userId) ?? 0) + Math.abs(transaction.amountDelta),
      );
    }
    return totals;
  }, new Map<string, number>());
  const memberSpendRows = users
    .filter((user) => user.role === "MEMBER")
    .map((user) => ({
      user,
      totalSpent: spendTotalsByUser.get(user.id) ?? 0,
    }))
    .sort((a, b) => b.totalSpent - a.totalSpent);

  return (
    <div className="view-stack">
      <section className="section-hero">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>관리자 콘솔</h1>
          <p>식당 예산, 사용자 권한, 운영 상태를 관리합니다.</p>
        </div>
      </section>
      <section className="metric-grid">
        <article>
          <span>활성 식당</span>
          <strong>{restaurants.length}곳</strong>
          <small>예산 관리 대상</small>
        </article>
        <article>
          <span>누적 추가</span>
          <strong>{formatMoney(totalAdded)}</strong>
          <small>원장 기준</small>
        </article>
        <article>
          <span>사용자</span>
          <strong>{users.length}명</strong>
          <small>활성 계정</small>
        </article>
      </section>
      <section className="surface-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Team Spend</p>
            <h2>팀원별 사용금액</h2>
          </div>
        </div>
        <div className="spend-total-list">
          {memberSpendRows.length ? (
            memberSpendRows.map(({ user, totalSpent }) => (
              <div className="spend-total-row" key={user.id}>
                <div className="user-identity">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="user-avatar" alt="" src={user.avatarUrl} />
                  <span>
                    <strong>{user.name}</strong>
                    <small>{user.email}</small>
                  </span>
                </div>
                <strong className="spend-total-amount">
                  {formatMoney(totalSpent)}
                </strong>
              </div>
            ))
          ) : (
            <p className="empty-state">표시할 팀원 사용금액이 없습니다.</p>
          )}
        </div>
      </section>
      <section className="surface-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Permissions</p>
            <h2>사용자 권한</h2>
          </div>
        </div>
        <div className="user-list">
          {users.map((user) => (
            <div className="user-row" key={user.id}>
              <div className="user-identity">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="user-avatar" alt="" src={user.avatarUrl} />
                <span>
                  <strong>{user.name}</strong>
                  <small>{user.email}</small>
                </span>
              </div>
              <div className="segmented compact">
                <button
                  className={user.role === "ADMIN" ? "active" : ""}
                  type="button"
                  onClick={() => onRoleChange(user.id, "ADMIN")}
                >
                  관리자
                </button>
                <button
                  className={user.role === "MEMBER" ? "active" : ""}
                  type="button"
                  onClick={() => onRoleChange(user.id, "MEMBER")}
                >
                  팀원
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function TransactionTable({
  canDeleteTransaction,
  onDeleteTransaction,
  onOpenReceipt,
  restaurants,
  transactions,
}: {
  canDeleteTransaction?: (transaction: LedgerTransaction) => boolean;
  onDeleteTransaction?: (transaction: LedgerTransaction) => void;
  onOpenReceipt: (transaction: LedgerTransaction) => void;
  restaurants: Map<string, Restaurant>;
  transactions: LedgerTransaction[];
}) {
  if (transactions.length === 0) {
    return <p className="empty-state">표시할 거래 내역이 없습니다.</p>;
  }
  const showDeleteAction = Boolean(canDeleteTransaction && onDeleteTransaction);

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>유형</th>
            <th>식당</th>
            <th>금액</th>
            <th>잔액</th>
            <th>영수증</th>
            <th>사용자</th>
            <th>일시</th>
            {showDeleteAction && <th>관리</th>}
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction) => {
            const restaurant = restaurants.get(transaction.restaurantId);
            const canDelete = canDeleteTransaction?.(transaction) ?? false;
            return (
              <tr key={transaction.id}>
                <td>
                  <span className={`type-badge ${transaction.type.toLowerCase()}`}>
                    {typeLabels[transaction.type]}
                  </span>
                </td>
                <td>
                  <strong>{restaurant?.name ?? "-"}</strong>
                  <small>{transaction.memo || typeLabels[transaction.type]}</small>
                </td>
                <td
                  className={
                    transaction.amountDelta < 0 ? "money out" : "money in"
                  }
                >
                  {formatDelta(transaction.amountDelta)}
                </td>
                <td>{formatMoney(transaction.balanceAfter)}</td>
                <td>
                  {transaction.receiptUrl ? (
                    <button
                      className="receipt-link"
                      type="button"
                      onClick={() => onOpenReceipt(transaction)}
                    >
                      보기
                    </button>
                  ) : (
                    <span className="muted-cell">없음</span>
                  )}
                </td>
                <td>{transaction.userName}</td>
                <td>
                  {transaction.usedAt}
                  <small>{transaction.createdAt}</small>
                </td>
                {showDeleteAction && (
                  <td>
                    {canDelete && onDeleteTransaction ? (
                      <button
                        className="delete-transaction-button"
                        type="button"
                        onClick={() => onDeleteTransaction(transaction)}
                      >
                        삭제
                      </button>
                    ) : (
                      <span className="muted-cell">-</span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
