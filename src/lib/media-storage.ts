import { supabase } from "@/integrations/supabase/client";
import type { Product } from "@/lib/types";

export const MEDIA_BUCKETS = {
  products: "product-media",
  categories: "category-media",
  banners: "banner-media",
  brands: "brand-media",
  bulkImports: "bulk-imports",
} as const;

export type MediaBucket = (typeof MEDIA_BUCKETS)[keyof typeof MEDIA_BUCKETS];

const imageExtensions = new Set(["jpg", "jpeg", "png", "webp", "avif"]);

const mimeByExtension: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  zip: "application/zip",
};

const safeSegment = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .toLowerCase();

export const extensionOf = (filename: string) => {
  const clean = filename.split("?")[0]?.split("#")[0] ?? filename;
  const parts = clean.split(".");
  return parts.length > 1 ? String(parts.pop()).toLowerCase() : "";
};

export const isSupportedImageName = (filename: string) => imageExtensions.has(extensionOf(filename));

export const inferMimeType = (filename: string) => mimeByExtension[extensionOf(filename)] ?? "application/octet-stream";

export const leafName = (path: string) => path.split(/[\\/]/).pop() ?? path;

export const stemName = (filename: string) => {
  const leaf = leafName(filename);
  const extension = extensionOf(leaf);
  return extension ? leaf.slice(0, -(extension.length + 1)) : leaf;
};

const normalizeForMatch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

const stemCandidates = (filename: string) => {
  const stem = normalizeForMatch(stemName(filename));
  const withoutCommonSuffix = stem
    .replace(/(?:[_\-\s](?:PRINCIPAL|PRIMARY|MAIN|PORTADA|FRONT|HERO|THUMB|THUMBNAIL))$/i, "")
    .replace(/(?:[_\-\s](?:IMG|IMAGE|FOTO|PHOTO)\d*)$/i, "")
    .replace(/(?:[_\-\s]\d{1,3})$/i, "")
    .replace(/\s*\(\d{1,3}\)$/i, "");

  return Array.from(new Set([stem, withoutCommonSuffix].filter(Boolean)));
};

export function matchProductByImageName(filename: string, products: Product[]) {
  const candidates = stemCandidates(filename);
  const productsByLongestSku = products
    .filter((product) => product.sku)
    .sort((a, b) => b.sku.length - a.sku.length);

  return productsByLongestSku.find((product) => {
    const sku = normalizeForMatch(product.sku);
    return candidates.some(
      (candidate) =>
        candidate === sku ||
        candidate.startsWith(`${sku}_`) ||
        candidate.startsWith(`${sku}-`) ||
        candidate.startsWith(`${sku} `),
    );
  });
}

export async function uploadAdminMediaFile({
  bucket,
  file,
  folder,
}: {
  bucket: MediaBucket;
  file: File | Blob;
  folder: string;
}) {
  const sourceName = file instanceof File ? file.name : "upload.bin";
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;
  const filename = `${id}-${safeSegment(leafName(sourceName)) || "asset"}`;
  const storagePath = `${safeSegment(folder) || "general"}/${filename}`;
  const contentType = file instanceof File && file.type ? file.type : inferMimeType(sourceName);

  const { error } = await supabase.storage.from(bucket).upload(storagePath, file, {
    cacheControl: "31536000",
    contentType,
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  return {
    bucket,
    storagePath,
    publicUrl: data.publicUrl,
  };
}
