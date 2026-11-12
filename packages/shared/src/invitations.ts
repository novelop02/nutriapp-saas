import { z } from "zod";
import { passwordSchema } from "./auth.js";

export const acceptInvitationSchema = z.strictObject({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

export const invitationSchema = z.object({
  id: z.uuid(),
  expiresAt: z.iso.datetime(),
});

export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
export type InvitationDto = z.infer<typeof invitationSchema>;
