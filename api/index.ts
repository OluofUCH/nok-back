// Vercel serverless entrypoint. The runtime invokes the default export per
// request, so this must export the Express app rather than call app.listen().
import app from "../app";

export default app;
