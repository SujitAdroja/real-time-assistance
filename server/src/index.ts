import "dotenv/config";
import express from "express";

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.get("/health", (_request, response) => {
  response.json({ status: "ok", service: "interview-assistant-server" });
});

app.listen(port, () => {
  console.log(`API server listening at http://localhost:${port}`);
});
