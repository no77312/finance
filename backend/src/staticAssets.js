import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { badRequest, forbidden, notFound } from "./domain.js";

export async function serveStaticAsset(pathname, response, publicDir) {
  const publicRoot = resolve(publicDir);
  const decodedPath = safeDecodePath(pathname);
  const assetPath = decodedPath === "/" ? "index.html" : normalize(decodedPath).replace(/^[/\\]+/, "");
  const requestedFile = resolve(publicRoot, assetPath);

  if (!isPathInside(publicRoot, requestedFile)) {
    throw forbidden("STATIC_ASSET_FORBIDDEN", "Static asset path is not allowed.");
  }

  const filePath = await existingStaticFile(requestedFile, publicRoot, extname(assetPath) === "");
  if (!filePath) {
    throw notFound("STATIC_ASSET_NOT_FOUND", "Static asset not found.");
  }

  response.statusCode = 200;
  response.setHeader("Content-Type", contentTypeForPath(filePath));
  response.setHeader("Cache-Control", cacheControlForPath(filePath));

  await new Promise((resolveStream, rejectStream) => {
    const stream = createReadStream(filePath);
    stream.on("error", rejectStream);
    stream.on("end", resolveStream);
    stream.pipe(response);
  });
}

async function existingStaticFile(requestedFile, publicRoot, shouldFallbackToIndex) {
  const directFile = await statFile(requestedFile);
  if (directFile) {
    return directFile;
  }

  if (!shouldFallbackToIndex) {
    return null;
  }

  const indexFile = join(publicRoot, "index.html");
  return statFile(indexFile);
}

async function statFile(filePath) {
  try {
    const stats = await stat(filePath);
    return stats.isFile() ? filePath : null;
  } catch {
    return null;
  }
}

function safeDecodePath(pathname) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    throw badRequest("INVALID_PATH", "Request path is invalid.");
  }
}

function isPathInside(parent, child) {
  const normalizedParent = parent.endsWith("/") ? parent : `${parent}/`;
  return child === parent || child.startsWith(normalizedParent);
}

function contentTypeForPath(filePath) {
  switch (extname(filePath).toLowerCase()) {
  case ".css":
    return "text/css; charset=utf-8";
  case ".js":
    return "text/javascript; charset=utf-8";
  case ".json":
  case ".webmanifest":
    return "application/manifest+json; charset=utf-8";
  case ".svg":
    return "image/svg+xml; charset=utf-8";
  case ".png":
    return "image/png";
  case ".html":
    return "text/html; charset=utf-8";
  default:
    return "application/octet-stream";
  }
}

function cacheControlForPath(filePath) {
  return /\/(?:app|styles|sw)\.js$|\.css$|\.html$/.test(filePath)
    ? "no-cache"
    : "public, max-age=31536000, immutable";
}
