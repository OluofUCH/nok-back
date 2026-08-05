import app from "./app";

const server = app.listen(0, async () => {
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const base = `http://127.0.0.1:${port}`;

  const show = async (label: string, path: string, init?: RequestInit) => {
    try {
      const response = await fetch(base + path, init);
      const body = await response.text();
      console.log(label, "->", response.status, body.slice(0, 110));
    } catch (error) {
      console.log(label, "-> ERR", (error as Error).message);
    }
  };

  await show("GET /api/health     ", "/api/health");
  await show("GET /api/auth/csrf  ", "/api/auth/csrf");
  await show("GET /api/products   ", "/api/products");
  // Malformed Origin header on a write request:
  await show("POST bad Origin     ", "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "not-a-url" },
    body: "{}",
  });

  server.close();
});
