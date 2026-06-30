import { badRequest } from "./domain.js";

const jsonBodyLimit = 7 * 1024 * 1024;

export async function readJsonBody(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > jsonBodyLimit) {
      throw badRequest("BODY_TOO_LARGE", "Request body is too large.");
    }
  }

  if (!raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw badRequest("INVALID_JSON", "Request body must be valid JSON.");
  }
}

export function send(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type,X-Member-ID,X-Refresh-Token,X-Session-Token");

  if (body === undefined) {
    response.end();
    return;
  }

  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

export function sendError(response, error) {
  const statusCode = error.status ?? 500;
  send(response, statusCode, {
    error: {
      code: error.code ?? "INTERNAL_ERROR",
      message: statusCode === 500 ? "Internal server error." : error.message
    }
  });
}
