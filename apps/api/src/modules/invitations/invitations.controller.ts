import type { Request, Response } from "express";
import { authUserSchema, invitationSchema, type AcceptInvitationInput } from "@nutriapp/shared";
import type { Mailer } from "../../lib/mailer.js";
import { parseIdOrNotFound } from "../../lib/parse.js";
import { SecurityEvent } from "../../lib/security-events.js";
import { actorFrom } from "../../policies/actor.js";
import { startSession } from "../auth/auth.controller.js";
import {
  acceptInvitation,
  createInvitation,
  InvitationInvalidError,
  InvitationMailError,
} from "./invitations.service.js";

export function createInvitationHandlers(deps: { mailer: Mailer }) {
  return {
    async send(req: Request, res: Response) {
      const actor = actorFrom(req);
      try {
        const invitation = await createInvitation(
          actor,
          parseIdOrNotFound(req.params.id),
          deps.mailer,
        );
        req.log.info({ event: "invitation_sent", invitationId: invitation.id }, "Invitation sent");
        res.status(201).json({
          invitation: invitationSchema.parse({
            id: invitation.id,
            expiresAt: invitation.expiresAt.toISOString(),
          }),
        });
      } catch (err) {
        if (err instanceof InvitationMailError) {
          req.log.error(
            { err: err.mailError, event: "invitation_mail_failed", invitationId: err.invitationId },
            "Invitation email could not be sent",
          );
        }
        throw err;
      }
    },

    async accept(req: Request, res: Response) {
      const input: AcceptInvitationInput = req.body;
      try {
        const user = await acceptInvitation(input);
        await startSession(req, res, user);
        req.log.info({ event: "invitation_accepted", userId: user.id }, "Invitation accepted");
        res.status(201).json({ user: authUserSchema.parse(user) });
      } catch (err) {
        if (err instanceof InvitationInvalidError) {
          req.log.warn(
            { event: SecurityEvent.InvitationInvalid, reason: err.reason },
            "Invalid invitation used",
          );
        }
        throw err;
      }
    },
  };
}

export type InvitationHandlers = ReturnType<typeof createInvitationHandlers>;
