import { OAuth2Client } from "google-auth-library";
import { badRequest, forbidden } from "./domain.js";

export async function verifyGoogleCredential(body, config = {}) {
  const credential = cleanString(body.credential ?? body.idToken ?? body.token);
  if (!credential) {
    throw badRequest("GOOGLE_CREDENTIAL_REQUIRED", "Google credential is required.");
  }

  const clientID = config.googleClientID ?? process.env.GOOGLE_CLIENT_ID;
  if (!clientID) {
    throw forbidden("GOOGLE_CLIENT_ID_REQUIRED", "Set GOOGLE_CLIENT_ID to enable Google sign-in.");
  }

  let payload;
  try {
    const client = new OAuth2Client(clientID);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: clientID
    });
    payload = ticket.getPayload();
  } catch {
    throw forbidden("GOOGLE_CREDENTIAL_INVALID", "Google credential is invalid.");
  }

  if (!payload?.sub) {
    throw badRequest("GOOGLE_USER_REQUIRED", "Google user identifier is required.");
  }

  if (payload.email_verified === false) {
    throw forbidden("GOOGLE_EMAIL_UNVERIFIED", "Google email is not verified.");
  }

  return {
    googleUserID: payload.sub,
    email: payload.email ?? "",
    fullName: payload.name ?? payload.email ?? "Google 用户",
    pictureURL: payload.picture ?? ""
  };
}

export function requirePriceRefreshToken(request, config = {}) {
  const expectedToken = config.priceRefreshToken ?? process.env.PRICE_REFRESH_TOKEN;
  if (!expectedToken) {
    throw forbidden("PRICE_REFRESH_NOT_CONFIGURED", "Set PRICE_REFRESH_TOKEN to enable scheduled price refresh.");
  }

  const providedToken = bearerToken(request.headers.authorization) ?? request.headers["x-refresh-token"];
  if (providedToken !== expectedToken) {
    throw forbidden("PRICE_REFRESH_FORBIDDEN", "Invalid price refresh token.");
  }
}

function bearerToken(value) {
  if (typeof value !== "string") {
    return undefined;
  }
  const [scheme, token] = value.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : undefined;
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}
