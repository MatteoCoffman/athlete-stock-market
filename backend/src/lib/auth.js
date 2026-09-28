import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { JWT_SECRET, STARTING_CASH } from "./config.js";
import { loadStore, saveStore } from "./store.js";

export function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing authorization token" });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.sub;
    req.userEmail = payload.email;
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function signup(email, password) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized || !password || password.length < 6) {
    const err = new Error("Email and password (min 6 chars) required");
    err.status = 400;
    throw err;
  }
  const store = loadStore();
  if (Object.values(store.users).some((u) => u.email === normalized)) {
    const err = new Error("Email already registered");
    err.status = 409;
    throw err;
  }
  const user = {
    id: uuidv4(),
    email: normalized,
    passwordHash: bcrypt.hashSync(password, 10),
    cashBalance: STARTING_CASH,
    createdAt: new Date().toISOString(),
    equityHistory: [{ t: new Date().toISOString(), value: STARTING_CASH }],
  };
  store.users[user.id] = user;
  saveStore(store);
  return { user: publicUser(user), token: signToken(user) };
}

export function login(email, password) {
  const normalized = String(email || "").trim().toLowerCase();
  const store = loadStore();
  const user = Object.values(store.users).find((u) => u.email === normalized);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    const err = new Error("Invalid email or password");
    err.status = 401;
    throw err;
  }
  return { user: publicUser(user), token: signToken(user) };
}

export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    cashBalance: user.cashBalance,
    createdAt: user.createdAt,
  };
}
