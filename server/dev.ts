import "dotenv/config";
import app from "./app";

const required = ["MONGODB_URI", "JWT_SECRET"] as const;
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.warn(
    `Nōkerè API started in setup mode. Missing: ${missing.join(", ")}`,
  );
  console.warn(
    "The frontend will remain available, but login and registration will return a clear configuration error until these values are added to .env.",
  );
  console.warn(
    "To use existing accounts, MONGODB_URI must point to the same MongoDB database used by the existing backend.",
  );
}

if (!process.env.VERCEL) {
  const port = Number(process.env.PORT || 3001);
  app.listen(port, () => {
    console.log(`Nōkerè API running at http://localhost:${port}`);
  });
}

export default app;
