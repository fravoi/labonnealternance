import Boom from "boom"
import { ETAT_UTILISATEUR } from "shared/constants/recruteur"
import { toPublicUser, zRoutes } from "shared/index"

import { getStaticFilePath } from "@/common/utils/getStaticFilePath"
import { getUserFromRequest } from "@/security/authenticationService"
import { createAuthMagicLink } from "@/services/appLinks.service"

import { startSession, stopSession } from "../../../common/utils/session.service"
import config from "../../../config"
import { CFA, ENTREPRISE } from "../../../services/constant.service"
import { sendUserConfirmationEmail } from "../../../services/etablissement.service"
import mailer from "../../../services/mailer.service"
import { getUser, getUserStatus, updateLastConnectionDate } from "../../../services/userRecruteur.service"
import { Server } from "../../server"

export default (server: Server) => {
  server.post(
    "/login/:userId/resend-confirmation-email",
    {
      schema: zRoutes.post["/login/:userId/resend-confirmation-email"],
      onRequest: server.auth(zRoutes.post["/login/:userId/resend-confirmation-email"]),
    },
    async (req, res) => {
      const { userId } = req.params
      const user = await getUser({ _id: userId })
      if (!user) {
        return res.status(400).send({ error: true, reason: "UNKNOWN" })
      }
      const { is_email_checked } = user
      if (is_email_checked) {
        return res.status(400).send({ error: true, reason: "VERIFIED" })
      }
      await sendUserConfirmationEmail(user)
      return res.status(200).send({})
    }
  )

  server.post(
    "/login/magiclink",
    {
      schema: zRoutes.post["/login/magiclink"],
    },
    async (req, res) => {
      const { email } = req.body
      const formatedEmail = email.toLowerCase()
      const user = await getUser({ email: formatedEmail })

      if (!user) {
        return res.status(400).send({ error: true, reason: "UNKNOWN" })
      }

      const { email: userEmail, _id, first_name, last_name, is_email_checked } = user || {}

      if (user.status?.length) {
        const status = getUserStatus(user.status)

        if ([ENTREPRISE, CFA].includes(user.type)) {
          if (!status || [ETAT_UTILISATEUR.ATTENTE, ETAT_UTILISATEUR.ERROR].includes(status)) {
            return res.status(400).send({ error: true, reason: "VALIDATION" })
          }
          if (status === ETAT_UTILISATEUR.DESACTIVE) {
            return res.status(400).send({
              error: true,
              reason: "DISABLED",
            })
          }
        }
      }

      if (!is_email_checked) {
        await sendUserConfirmationEmail(user)
        return res.status(400).send({
          error: true,
          reason: "VERIFY",
        })
      }

      await mailer.sendEmail({
        to: userEmail,
        subject: "Lien de connexion",
        template: getStaticFilePath("./templates/mail-connexion.mjml.ejs"),
        data: {
          images: {
            logoLba: `${config.publicUrl}/images/emails/logo_LBA.png?raw=true`,
          },
          last_name,
          first_name,
          connexion_url: createAuthMagicLink(user),
        },
      })
      return res.status(200).send({})
    }
  )

  server.post(
    "/login/verification",
    {
      schema: zRoutes.post["/login/verification"],
      onRequest: [server.auth(zRoutes.post["/login/verification"])],
    },
    async (req, res) => {
      const user = getUserFromRequest(req, zRoutes.post["/login/verification"]).value

      const formatedEmail = user.identity.email.toLowerCase()
      const connectedUser = await updateLastConnectionDate(formatedEmail)

      if (!connectedUser) {
        throw Boom.forbidden()
      }

      await startSession(user.identity.email, res)

      return res.status(200).send(toPublicUser(connectedUser))
    }
  )

  /**
   * Récupérer l'utilisateur connecté
   */
  server.get(
    "/auth/session",
    {
      schema: zRoutes.get["/auth/session"],
      onRequest: [server.auth(zRoutes.get["/auth/session"])],
    },
    async (request, response) => {
      if (!request.user) {
        throw Boom.forbidden()
      }
      const user = getUserFromRequest(request, zRoutes.get["/auth/session"]).value
      return response.status(200).send(toPublicUser(user))
    }
  )

  server.get(
    "/auth/logout",
    {
      schema: zRoutes.get["/auth/logout"],
    },
    async (request, response) => {
      await stopSession(request, response)

      return response.status(200).send({})
    }
  )
}
