export type BsiFetchTls = {
  tls: { rejectUnauthorized: boolean };
};

export function bsiFetchTls(): BsiFetchTls | Record<string, never> {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    return { tls: { rejectUnauthorized: false } };
  }
  const v = process.env.BSI_TLS_INSECURE?.toLowerCase();
  if (v === "1" || v === "true" || v === "yes") {
    return { tls: { rejectUnauthorized: false } };
  }
  return {};
}
