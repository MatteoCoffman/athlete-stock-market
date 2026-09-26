import { Router } from "express";
import { login, signup, publicUser } from "../lib/auth.js";
import { loadStore } from "../lib/store.js";
import { authMiddleware } from "../lib/auth.js";

const router = Router();

router.post("/signup", (req, res) => {
  try {
    const result = signup(req.body.email, req.body.password);
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post("/login", (req, res) => {
  try {
    const result = login(req.body.email, req.body.password);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get("/me", authMiddleware, (req, res) => {
  const store = loadStore();
  const user = store.users[req.userId];
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user: publicUser(user) });
});

export default router;
