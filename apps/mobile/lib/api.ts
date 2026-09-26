import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from "./config";

const TOKEN_KEY = "jock_token";

export type User = {
  id: string;
  email: string;
  cashBalance: number;
  createdAt: string;
};

export type Player = {
  id: string;
  name: string;
  team: string;
  position: string;
  price: number;
  openPrice: number;
  changePct: number;
  sharesOutstanding: number;
  sharesHeld: number;
  freeFloat: number;
  performanceScore: number;
  priceHistory?: { t: string; price: number }[];
  sparkline?: number[];
};

async function getToken() {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setToken(token: string | null) {
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  auth = false
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (auth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  signup: (email: string, password: string) =>
    request<{ user: User; token: string }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  login: (email: string, password: string) =>
    request<{ user: User; token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<{ user: User }>("/auth/me", {}, true),
  players: () => request<{ players: Player[] }>("/players"),
  player: (id: string) =>
    request<{
      player: Player;
      recentTrades: { id: string; side: string; qty: number; price: number; ts: string }[];
    }>(`/players/${id}`),
  trade: (playerId: string, side: "buy" | "sell", qty: number) =>
    request<{
      trade: unknown;
      player: Player;
      cashBalance: number;
    }>(
      "/trades",
      {
        method: "POST",
        body: JSON.stringify({ playerId, side, qty }),
      },
      true
    ),
  portfolio: () =>
    request<{
      cashBalance: number;
      positionsValue: number;
      totalValue: number;
      positions: {
        playerId: string;
        shares: number;
        avgCost: number;
        marketValue: number;
        player: Player | null;
      }[];
    }>("/portfolio", {}, true),
  payDividend: (playerId: string, payoutPerShare: number, adminToken: string) =>
    request<{ totalPaid: number; payments: unknown[] }>("/dividends/pay", {
      method: "POST",
      headers: { "x-admin-token": adminToken },
      body: JSON.stringify({ playerId, payoutPerShare }),
    }),
};
