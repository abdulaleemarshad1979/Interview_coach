const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

const PORT = 8787;
const OLLAMA_TARGET = "http://localhost:11434";
const SHARED_SECRET = process.env.PROXY_SECRET || "change-this-to-a-long-random-string";

const app = express();

app.use((req, res, next) => {
  const key = req.headers["x-api-key"];
  if (key !== SHARED_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

app.use(
  "/",
  createProxyMiddleware({
    target: OLLAMA_TARGET,
    changeOrigin: true,
  })
);

app.listen(PORT, () => {
  console.log(`Auth proxy for Ollama listening on port ${PORT} -> ${OLLAMA_TARGET}`);
});
