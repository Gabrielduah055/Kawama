export type EndpointParameters = Readonly<Record<string, string | number>>;

export function resolveEndpoint(template: string, parameters: EndpointParameters = {}): string {
  return Object.entries(parameters).reduce(
    (resolved, [key, value]) => resolved.replace(`:${key}`, encodeURIComponent(String(value))),
    template,
  );
}

export function buildApiUrl(
  baseUrl: string,
  template: string,
  parameters: EndpointParameters = {},
): string {
  const endpoint = resolveEndpoint(template, parameters);
  return `${baseUrl.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;
}
