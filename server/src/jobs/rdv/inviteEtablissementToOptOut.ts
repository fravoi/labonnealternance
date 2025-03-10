import * as _ from "lodash-es"

import { getStaticFilePath } from "@/common/utils/getStaticFilePath"
import { createRdvaOptOutUnsubscribePageLink } from "@/services/appLinks.service"

import { logger } from "../../common/logger"
import { mailType } from "../../common/model/constants/etablissement"
import { Etablissement } from "../../common/model/index"
import { isValidEmail } from "../../common/utils/isValidEmail"
import config from "../../config"
import dayjs from "../../services/dayjs.service"
import * as eligibleTrainingsForAppointmentService from "../../services/eligibleTrainingsForAppointment.service"
import mailer from "../../services/mailer.service"

/**
 * @description Invite all "etablissements" without opt_mode to opt-out.
 * @returns {Promise<void>}
 */
export const inviteEtablissementToOptOut = async () => {
  logger.info("Cron #inviteEtablissementToOptOut started.")

  // Opt-out etablissement to activate
  const etablissementsWithouOptMode = await Etablissement.find({
    optout_invitation_date: null,
    gestionnaire_email: { $nin: [null, ""] },
    affelnet_perimetre: null,
  })

  logger.info(`Etablissements to invite: ${etablissementsWithouOptMode.length}`)

  for (const etablissement of etablissementsWithouOptMode) {
    const formations = await eligibleTrainingsForAppointmentService.find({
      etablissement_siret: etablissement.formateur_siret,
    })

    let emailDecisionaire = etablissement.gestionnaire_email

    // If etablissement haven't a valid "email_decisionnaire"
    if (!etablissement.gestionnaire_email || !isValidEmail(emailDecisionaire)) {
      // If "email_rdv" exists, add 1 occurrence, otherwise set counter to 1
      const emailCounter: object = {}
      formations.map(({ lieu_formation_email }) => {
        // Ignore null, empty or not valid email
        if (!lieu_formation_email || !isValidEmail(lieu_formation_email)) {
          logger.info("Invalid email", { email: lieu_formation_email, formateur_siret: etablissement.formateur_siret })
          return
        }

        return emailCounter[lieu_formation_email] ? emailCounter[lieu_formation_email]++ : (emailCounter[lieu_formation_email] = 1)
      })

      // Ignore etablissement without formation emails
      if (!Object.keys(emailCounter).length) {
        logger.info("Siret without formation emails", { formateur_siret: etablissement.formateur_siret })
        continue
      }

      // Getting max number of occurrences
      const max = Math.max(...Object.values(emailCounter))

      // Getting array of highest duplicate values
      const highestEmail = Object.entries(emailCounter).filter(([, reps]) => reps === max)

      // Get most present email
      emailDecisionaire = highestEmail[0][0]

      // Save most present email as "email_decisionnaire"
      await etablissement.update({ gestionnaire_email: emailDecisionaire })
    }

    // Invite all etablissements only in production environment, for etablissement that have an "email_decisionnaire"
    if (emailDecisionaire && etablissement.gestionnaire_email && etablissement.formateur_siret) {
      const willBeActivatedAt = dayjs().add(15, "days")

      const { messageId } = await mailer.sendEmail({
        to: emailDecisionaire,
        subject: `Trouvez et recrutez vos candidats avec La bonne alternance`,
        template: getStaticFilePath("./templates/mail-cfa-optout-invitation.mjml.ejs"),
        data: {
          images: {
            logoLba: `${config.publicUrl}/images/emails/logo_LBA.png?raw=true`,
            logoFooter: `${config.publicUrl}/assets/logo-republique-francaise.png?raw=true`,
            peopleLaptop: `${config.publicUrl}/assets/people-laptop.png?raw=true`,
            optOutLbaIntegrationExample: `${config.publicUrl}/assets/exemple_integration_lba.png?raw=true`,
          },
          etablissement: {
            name: etablissement.raison_sociale,
            formateur_address: etablissement.formateur_address,
            formateur_zip_code: etablissement.formateur_zip_code,
            formateur_city: etablissement.formateur_city,
            siret: etablissement?.formateur_siret,
            optOutActivatedAtDate: willBeActivatedAt.format("DD/MM"),
            linkToUnsubscribe: createRdvaOptOutUnsubscribePageLink(etablissement.gestionnaire_email, etablissement.formateur_siret, etablissement._id.toString()),
          },
          user: {
            destinataireEmail: emailDecisionaire,
          },
        },
      })

      await Etablissement.update({
        optout_invitation_date: dayjs().toDate(),
        optout_activation_scheduled_date: willBeActivatedAt.toDate(),
        $push: {
          to_etablissement_emails: {
            campaign: mailType.OPT_OUT_INVITE,
            status: null,
            message_id: messageId,
            email_sent_at: dayjs().toDate(),
          },
        },
      })

      let emails = formations.flatMap((formation) => {
        const email = formation.lieu_formation_email
        if (!_.isNil(email) && email !== etablissement.gestionnaire_email) {
          return [email]
        } else {
          return []
        }
      })
      emails = [...new Set(emails)]

      await Promise.all(
        emails.map((email) =>
          mailer.sendEmail({
            to: email,
            subject: `La prise de RDV est activée pour votre CFA sur La bonne alternance`,
            template: getStaticFilePath("./templates/mail-cfa-optout-activated.mjml.ejs"),
            data: {
              url: config.publicUrl,
              replyTo: config.publicEmail,
              images: {
                logoLba: `${config.publicUrl}/images/emails/logo_LBA.png?raw=true`,
                logoFooter: `${config.publicUrl}/assets/logo-republique-francaise.png?raw=true`,
                peopleLaptop: `${config.publicUrl}/assets/people-laptop.png?raw=true`,
              },
              etablissement: {
                name: etablissement.raison_sociale,
                formateur_address: etablissement.formateur_address,
                formateur_zip_code: etablissement.formateur_zip_code,
                formateur_city: etablissement.formateur_city,
                siret: etablissement.formateur_siret,
                email: etablissement.gestionnaire_email,
                optOutActivatedAtDate: willBeActivatedAt.format("DD/MM"),
                emailGestionnaire: etablissement.gestionnaire_email,
              },
              user: {
                destinataireEmail: email,
              },
            },
          })
        )
      )

      logger.info("Etablissement invited to opt-out.", {
        siretFormateur: etablissement.formateur_siret,
        willBeActivatedAt: willBeActivatedAt.format(),
        emailDecisionaire,
      })
    }
  }

  logger.info("Cron #inviteEtablissementToOptOut done.")
}
