import Boom from "boom"
import Joi from "joi"
import { EApplicantRole } from "shared/constants/rdva"
import { zRoutes } from "shared/index"

import { getStaticFilePath } from "@/common/utils/getStaticFilePath"

import { getReferrerByKeyName } from "../../common/model/constants/referrers"
import { Appointment, EligibleTrainingsForAppointment, Etablissement, User } from "../../common/model/index"
import config from "../../config"
import * as appointmentService from "../../services/appointment.service"
import { sendCandidateAppointmentEmail, sendFormateurAppointmentEmail } from "../../services/appointment.service"
import dayjs from "../../services/dayjs.service"
import * as eligibleTrainingsForAppointmentService from "../../services/eligibleTrainingsForAppointment.service"
import mailer from "../../services/mailer.service"
import * as users from "../../services/user.service"
import { Server } from "../server"

const appointmentReplySchema = Joi.object({
  appointment_id: Joi.string().required(),
  cfa_intention_to_applicant: Joi.string().required(),
  cfa_message_to_applicant_date: Joi.date().required(),
  cfa_message_to_applicant: Joi.string().allow("").optional(),
})

export default (server: Server) => {
  server.post(
    "/appointment-request/validate",
    {
      schema: zRoutes.post["/appointment-request/validate"],
    },
    async (req, res) => {
      const { firstname, lastname, phone, applicantMessageToCfa, applicantReasons, type, appointmentOrigin, cleMinistereEducatif } = req.body
      const email = req.body.email.toLowerCase()

      const referrerObj = getReferrerByKeyName(appointmentOrigin)

      const eligibleTrainingsForAppointment = await eligibleTrainingsForAppointmentService.findOne({
        cle_ministere_educatif: cleMinistereEducatif,
        referrers: { $in: [referrerObj.name] },
      })

      if (!eligibleTrainingsForAppointment) {
        throw Boom.badRequest("Formation introuvable.")
      }

      let user = await users.getUserByMail(email)

      // Updates firstname and last name if the user already exists
      if (user) {
        user = await users.update(user._id, { firstname, lastname, phone, type, last_action_date: dayjs().format() })

        if (!user) {
          return
        }

        const appointment = await appointmentService.findOne({
          applicant_id: user._id,
          cle_ministere_educatif: eligibleTrainingsForAppointment.cle_ministere_educatif,
          created_at: {
            $gte: dayjs().subtract(4, "days").toDate(),
          },
        })

        if (appointment) {
          throw Boom.badRequest(`Une demande de prise de RDV en date du ${dayjs(appointment.created_at).format("DD/MM/YYYY")} est actuellement est cours de traitement.`)
        }
      } else {
        user = await users.createUser({
          firstname,
          lastname,
          phone,
          email,
          type,
          role: EApplicantRole.CANDIDAT,
          last_action_date: dayjs().toDate(),
        })
      }
      if (!eligibleTrainingsForAppointment.lieu_formation_email) {
        throw Boom.internal("Le lieu de formation n'a aucun email")
      }

      const [createdAppointement, etablissement] = await Promise.all([
        appointmentService.createAppointment({
          applicant_id: user._id,
          cfa_recipient_email: eligibleTrainingsForAppointment.lieu_formation_email,
          cfa_formateur_siret: eligibleTrainingsForAppointment.etablissement_formateur_siret,
          applicant_message_to_cfa: applicantMessageToCfa,
          applicant_reasons: applicantReasons,
          appointment_origin: referrerObj.name,
          cle_ministere_educatif: eligibleTrainingsForAppointment.cle_ministere_educatif,
        }),
        Etablissement.findOne({
          formateur_siret: eligibleTrainingsForAppointment.etablissement_formateur_siret,
        }),
      ])

      if (!etablissement) {
        throw new Error("Etablissement not found")
      }

      // doit être appelé en premier pour valider l'envoi de mail au formateur
      await sendFormateurAppointmentEmail(user, createdAppointement, eligibleTrainingsForAppointment, referrerObj, etablissement)
      await sendCandidateAppointmentEmail(user, createdAppointement, eligibleTrainingsForAppointment, referrerObj)

      const appointmentUpdated = await Appointment.findById(createdAppointement._id).lean()

      res.status(200).send({
        userId: user._id,
        appointment: appointmentUpdated,
      })
    }
  )

  server.get(
    "/appointment-request/context/short-recap",
    {
      schema: zRoutes.get["/appointment-request/context/short-recap"],
    },
    async (req, res) => {
      const { appointmentId } = req.query

      const appointment = await Appointment.findById(appointmentId, { cle_ministere_educatif: 1, applicant_id: 1 }).lean()

      if (!appointment) {
        throw Boom.notFound()
      }

      const [etablissement, user] = await Promise.all([
        EligibleTrainingsForAppointment.findOne(
          { cle_ministere_educatif: appointment.cle_ministere_educatif },
          {
            etablissement_formateur_raison_sociale: 1,
            lieu_formation_email: 1,
            _id: 0,
          }
        ).lean(),
        User.findById(appointment.applicant_id, {
          lastname: 1,
          firstname: 1,
          phone: 1,
          email: 1,
          _id: 0,
        }).lean(),
      ])

      if (!etablissement) {
        throw Boom.internal("Etablissment not found")
      }

      if (!user) {
        throw Boom.internal("User not found")
      }

      res.status(200).send({
        user,
        etablissement,
      })
    }
  )

  server.get(
    "/appointment-request/context/recap",
    {
      schema: zRoutes.get["/appointment-request/context/recap"],
      onRequest: [server.auth(zRoutes.get["/appointment-request/context/recap"])],
    },
    async (req, res) => {
      const { appointmentId } = req.query

      const appointment = await Appointment.findById(appointmentId, {
        cle_ministere_educatif: 1,
        applicant_id: 1,
        applicant_reasons: 1,
        applicant_message_to_cfa: 1,
        cfa_intention_to_applicant: 1,
        cfa_message_to_applicant: 1,
        cfa_message_to_applicant_date: 1,
      }).lean()

      if (!appointment) {
        throw Boom.notFound()
      }

      const [etablissement, user] = await Promise.all([
        EligibleTrainingsForAppointment.findOne(
          { cle_ministere_educatif: appointment.cle_ministere_educatif },
          {
            training_intitule_long: 1,
            etablissement_formateur_raison_sociale: 1,
            lieu_formation_street: 1,
            lieu_formation_zip_code: 1,
            lieu_formation_email: 1,
            lieu_formation_city: 1,
          }
        ).lean(),
        User.findById(appointment.applicant_id, {
          type: 1,
          lastname: 1,
          firstname: 1,
          phone: 1,
          email: 1,
        }).lean(),
      ])

      if (!etablissement) {
        throw Boom.internal("Etablissment not found")
      }

      if (!user) {
        throw Boom.internal("User not found")
      }

      res.status(200).send({
        appointment,
        user,
        etablissement,
      })
    }
  )

  server.post(
    "/appointment-request/reply",
    {
      schema: zRoutes.post["/appointment-request/reply"],
      onRequest: [server.auth(zRoutes.post["/appointment-request/reply"])],
    },
    async (req, res) => {
      await appointmentReplySchema.validateAsync(req.body, { abortEarly: false })
      const { appointment_id, cfa_intention_to_applicant, cfa_message_to_applicant, cfa_message_to_applicant_date } = req.body

      const appointment = await Appointment.findById(appointment_id)

      if (!appointment) throw Boom.notFound()

      if (!appointment.applicant_id) {
        throw Boom.internal("Applicant id not found.")
      }

      const [eligibleTrainingsForAppointment, user] = await Promise.all([
        eligibleTrainingsForAppointmentService.getParameterByCleMinistereEducatif({
          cleMinistereEducatif: appointment.cle_ministere_educatif,
        }),
        users.getUserById(appointment.applicant_id),
      ])

      if (!user || !eligibleTrainingsForAppointment) throw Boom.notFound()

      if (cfa_intention_to_applicant === "personalised_answer") {
        await mailer.sendEmail({
          to: user.email,
          subject: `[La bonne alternance] Le centre de formation vous répond`,
          template: getStaticFilePath("./templates/mail-reponse-cfa.mjml.ejs"),
          data: {
            logoLba: `${config.publicUrl}/images/emails/logo_LBA.png?raw=true`,
            prenom: user.firstname,
            nom: user.lastname,
            message: cfa_message_to_applicant,
            nom_formation: eligibleTrainingsForAppointment.training_intitule_long,
            nom_cfa: eligibleTrainingsForAppointment.etablissement_formateur_raison_sociale,
          },
        })
      }
      await appointmentService.updateAppointment(appointment_id, { cfa_intention_to_applicant, cfa_message_to_applicant, cfa_message_to_applicant_date })
      res.status(200).send({ appointment_id, cfa_intention_to_applicant, cfa_message_to_applicant, cfa_message_to_applicant_date })
    }
  )
}
