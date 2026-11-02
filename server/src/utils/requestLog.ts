/** Query strings include OIDC codes; shared-view path tokens grant access to data. */
export const redactRequestUrl = (url: string) =>
  url
    .split("?")[0]
    .replace(/(\/(?:share\/(?:public|embed)|embed)\/)[^/]+/gi, "$1[redacted]");
