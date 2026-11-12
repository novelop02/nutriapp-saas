import { AppError } from "../errors.js";

// If the actor cannot even see the resource, it "does not exist" for them
export function assertCanView(canView: boolean): asserts canView {
  if (!canView) throw new AppError(404, "not_found", "Resource not found");
}

// The order matters: check visibility first, so a stranger gets 404 and never 403
export function assertCanManage(canView: boolean, canManage: boolean): asserts canManage {
  assertCanView(canView);
  if (!canManage) throw new AppError(403, "forbidden", "You do not have access to this resource");
}
