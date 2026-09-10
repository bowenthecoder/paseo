/** Decode URL escapes once, preserving literal percent signs and malformed byte sequences. */
export function decodeUrlPath(pathname: string): string {
  return pathname.replace(/(?:%[0-9a-f]{2})+/gi, (encoded) => {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  });
}
