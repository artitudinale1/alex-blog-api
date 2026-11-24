import { GraphQLError } from 'graphql';

const IMAGE_EXTENSION = /\.(avif|gif|jpe?g|png|svg|webp)$/i;
const CLOUDINARY_IMAGE = /^\/[^/]+\/image\/(upload|fetch|private|authenticated)\//i;
const MAX_LENGTH = 2048;

export function parseCoverImageUrl(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') throw invalid();
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_LENGTH) throw invalid();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw invalid();
  }
  if (url.protocol !== 'https:' || url.username || url.password) throw invalid();
  const cloudinary = url.hostname === 'res.cloudinary.com' && CLOUDINARY_IMAGE.test(url.pathname);
  if (!cloudinary && !IMAGE_EXTENSION.test(url.pathname)) throw invalid();
  return trimmed;
}

function invalid(): GraphQLError {
  return new GraphQLError('coverImageUrl must be an https image URL', { extensions: { code: 'BAD_USER_INPUT' } });
}
