import express from "express"
import Joi from "joi"

import { getStaticFilePath } from "common/utils/getStaticFilePath"

import { UserRecruteur } from "../../../common/model/index"
import { IUserRecruteur } from "../../../common/model/schema/userRecruteur/userRecruteur.types"
import { createMagicLinkToken, createUserRecruteurToken, createUserToken } from "../../../common/utils/jwtUtils"
import config from "../../../config"
import { CFA, ENTREPRISE, ETAT_UTILISATEUR } from "../../../services/constant.service"
import { sendUserConfirmationEmail } from "../../../services/etablissement.service"
import mailer from "../../../services/mailer.service"
import { getUser, getUserStatus, registerUser } from "../../../services/userRecruteur.service"
import authMiddleware from "../../middlewares/authMiddleware"
import { tryCatch } from "../../middlewares/tryCatchMiddleware"

export default () => {
  const router = express.Router() // eslint-disable-line new-cap

  router.post(
    "/",
    authMiddleware("basic"),
    tryCatch(async (req, res) => {
      const user = req.user
      const token = createUserToken(user)
      return res.json({ token })
    })
  )

  router.post(
    "/confirmation-email",
    tryCatch(async (req, res) => {
      try {
        const { email } = await Joi.object({
          email: Joi.string().email().required(),
        }).validateAsync(req.body, { abortEarly: false })

        const user: IUserRecruteur = await getUser({ email })

        if (!user) {
          return res.status(400).json({ error: true, reason: "UNKNOWN" })
        }

        const { _id, first_name, last_name, is_email_checked } = user

        if (is_email_checked) {
          return res.status(400).json({ error: true, reason: "VERIFIED" })
        }
        await sendUserConfirmationEmail({
          email,
          firstName: first_name,
          lastName: last_name,
          userRecruteurId: _id,
        })
        return res.sendStatus(200)
      } catch (error) {
        return res.status(400).json({
          errorMessage: "l'adresse mail n'est pas valide.",
          details: error.details,
        })
      }
    })
  )

  router.post(
    "/magiclink",
    tryCatch(async (req, res) => {
      const { email } = await Joi.object({
        email: Joi.string().email().required(),
      }).validateAsync(req.body, { abortEarly: false })
      const formatedEmail = email.toLowerCase()
      const user = await UserRecruteur.findOne({ email: formatedEmail })
      const { email: userEmail, _id, first_name, last_name, is_email_checked } = user || {}
      if (!user) {
        return res.status(400).json({ error: true, reason: "UNKNOWN" })
      }
      const status = getUserStatus(user.status)
      if ([ENTREPRISE, CFA].includes(user.type)) {
        if ([ETAT_UTILISATEUR.ATTENTE, ETAT_UTILISATEUR.ERROR].includes(status)) {
          return res.status(400).json({ error: true, reason: "VALIDATION" })
        }
        if (status === ETAT_UTILISATEUR.DESACTIVE) {
          return res.status(400).json({
            error: true,
            reason: "DISABLED",
          })
        }
      }
      if (!is_email_checked) {
        await sendUserConfirmationEmail({
          email: userEmail,
          firstName: first_name,
          lastName: last_name,
          userRecruteurId: _id,
        })
        return res.status(400).json({
          error: true,
          reason: "VERIFY",
        })
      }
      const magiclink = `${config.publicUrlEspacePro}/authentification/verification?token=${createMagicLinkToken(userEmail)}`
      await mailer.sendEmail({
        to: userEmail,
        subject: "Lien de connexion",
        template: getStaticFilePath("./templates/mail-connexion.mjml.ejs"),
        data: {
          images: {
            logoLba: `${config.publicUrlEspacePro}/images/logo_LBA.png?raw=true`,
          },
          last_name,
          first_name,
          connexion_url: magiclink,
        },
      })
      return res.sendStatus(200)
    })
  )

  router.post(
    "/verification",
    authMiddleware("jwt-token"),
    tryCatch(async (req, res) => {
      const user = req.user
      await registerUser(user.email)
      return res.json({ token: createUserRecruteurToken(user) })
    })
  )

  return router
}
