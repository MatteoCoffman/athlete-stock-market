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
  headshotUrl?: string | null;
  sleeperId?: string | null;
  gsisId?: string | null;
};

export type StatChip = { label: string; value: string };

export type PlayerProfile = {
  player: {
    id: string;
    name: string;
    team: string;
    position: string;
    headshotUrl?: string | null;
    sleeperId?: string | null;
  };
  season: number | null;
  week: number | null;
  seasonStats: Record<string, number>;
  seasonChips: StatChip[];
  recentGames: {
    week: number;
    season: number;
    stats: Record<string, number>;
    chips: StatChip[];
  }[];
  statsAvailable: boolean;
};

export type NewsArticle = {
  id: string;
  title: string;
  url: string;
  image: string | null;
  published: string | null;
  source: string | null;
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
  players: (opts?: {
    q?: string;
    team?: string;
    position?: string | string[];
    limit?: number;
    offset?: number;
  }) => {
    const params = new URLSearchParams();
    if (opts?.q) params.set("q", opts.q);
    if (opts?.team) params.set("team", opts.team);
    if (opts?.position) {
      const pos = Array.isArray(opts.position) ? opts.position.join(",") : opts.position;
      if (pos) params.set("position", pos);
    }
    if (opts?.limit != null) params.set("limit", String(opts.limit));
    if (opts?.offset != null) params.set("offset", String(opts.offset));
    const qs = params.toString();
    return request<{ players: Player[]; total?: number }>(`/players${qs ? `?${qs}` : ""}`);
  },
  player: (id: string) =>
    request<{
      player: Player;
      recentTrades: { id: string; side: string; qty: number; price: number; ts: string }[];
    }>(`/players/${id}`),
  playerProfile: (id: string) => request<PlayerProfile>(`/players/${id}/profile`),
  playerNews: (id: string) =>
    request<{ playerId: string; name: string; articles: NewsArticle[] }>(`/players/${id}/news`),
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
      dayChangePct: number;
      equityHistory: { t: string; price: number }[];
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
