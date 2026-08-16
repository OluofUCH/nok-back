import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { HttpError } from "../utils/http-error";

export function notFound(request: Request, _response: Response, next: NextFunction) {
  next(new HttpError(404, `Route not found: ${request.method} ${request.originalUrl}`));
}

export function errorHandler(error: unknown, _request: Request, response: Response, _next: NextFunction) {
  let statusCode = 500;
  let message = "Something went wrong on the server.";
  let details: unknown;

  if (error instanceof HttpError) {
    statusCode = error.statusCode;
    message = error.message;
    details = error.details;
  } else if (error instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    message = "Please correct the highlighted information.";
    details = Object.values(error.errors).map((item) => item.message);
  } else if (error instanceof mongoose.Error.CastError) {
    statusCode = 400;
    message = "The supplied resource identifier is invalid.";
  } else if (error && typeof error === "object" && "code" in error && (error as { code?: number }).code === 11000) {
    statusCode = 409;
    message = "A record with that value already exists.";
  } else if (error instanceof Error) {
    message = process.env.NODE_ENV === "production" ? message : error.message;
  }

  response.status(statusCode).json({
    success: false,
    message,
    ...(details ? { details } : {}),
    ...(process.env.NODE_ENV !== "production" && error instanceof Error ? { stack: error.stack } : {}),
  });
}
