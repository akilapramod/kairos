import express from "express";
import { handleRender } from "./render.js";
import { handleTailor } from "./tailor.js";
import { requireSecret } from "./middleware.js";

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "cv-pipeline" });
});

app.post("/render", requireSecret, (req, res) => {
  void handleRender(req, res);
});

app.post("/tailor", requireSecret, (req, res) => {
  void handleTailor(req, res);
});

const port = Number(process.env.PORT ?? 3100);
app.listen(port, () => {
  console.log(`cv-pipeline listening on :${port}`);
});
