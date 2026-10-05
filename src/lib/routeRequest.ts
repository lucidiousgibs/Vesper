/** A one-shot request to plan a route in Gate Check, made from somewhere that is not the
 * Map page (the command line's "route Jita to Amarr"). The Map page may not have been
 * opened yet this session, so the request is held here and the page takes it when it
 * mounts, or on the event if it is already mounted. */
export const ROUTE_REQUEST_EVENT = "vesper:route-request";

export interface RouteWaypoint {
  id: number;
  name: string;
  security: number;
}

let pending: RouteWaypoint[] | null = null;

export function requestRoute(waypoints: RouteWaypoint[]): void {
  pending = waypoints;
  window.dispatchEvent(new CustomEvent(ROUTE_REQUEST_EVENT));
}

/** Hands over the waiting request, once. */
export function takePendingRoute(): RouteWaypoint[] | null {
  const request = pending;
  pending = null;
  return request;
}
