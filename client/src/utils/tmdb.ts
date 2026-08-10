const TMDB_IMAGE_PREFIX = "https://image.tmdb.org";

const TMDB_IMAGE_PROXY =
  process.env.TMDB_API_URL || "https://tmdb.yangjinhu.asia";

export function getTmdbImage(url?: string) {
  if (!url) {
    return "";
  }

  if (!url.startsWith(TMDB_IMAGE_PREFIX)) {
    return `${TMDB_IMAGE_PROXY}/t/p/w500${url}`;
  }

  return url.replace(TMDB_IMAGE_PREFIX, TMDB_IMAGE_PROXY);
}
