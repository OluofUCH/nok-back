import mongoose from "mongoose";
import { HttpError } from "../utils/http-error";

let connectionPromise: Promise<typeof mongoose> | null = null;

export async function connectDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri)
    throw new HttpError(
      503,
      "MONGODB_URI is not configured on the API server.",
    );

  if (mongoose.connection.readyState === 1) return mongoose;

  if (!connectionPromise) {
    connectionPromise = mongoose.connect(uri, {
      serverApi: {
        version: mongoose.mongo.ServerApiVersion.v1,
        strict: false,
        deprecationErrors: true,
      },
      serverSelectionTimeoutMS: 10000,
    });
  }

  try {
    const db = await connectionPromise;
    const mongoDb = mongoose.connection.db;
    if (!mongoDb) {
      throw new HttpError(
        503,
        "The API could not connect to MongoDB. Check MONGODB_URI and database network access.",
      );
    }
    await mongoDb.command({ ping: 1 });
    return db;
  } catch {
    connectionPromise = null;
    throw new HttpError(
      503,
      "The API could not connect to MongoDB. Check MONGODB_URI and database network access.",
    );
  }
}
