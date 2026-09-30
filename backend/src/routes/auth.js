import { Router } from "express";
import { authMiddleware, getUserById, login, publicUser, signup } from "../lib/auth.js";

const router = Router();

router.post("/signup", async (req, res) => {
  try {
    const result = await signup(req.body.email, req.body.password);
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const result = await login(req.body.email, req.body.password);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await getUserById(req.userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user: publicUser(user) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;
