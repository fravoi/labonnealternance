import { captureException } from "@sentry/node"

import { logger } from "../logger"
import { mongooseInstance } from "../mongodb"

import AnonymizedUser from "./schema/anonymizedUsers/anonymizedUsers.schema"
import ApiCalls from "./schema/apiCall/apiCall.schema"
import AnonymizedApplication from "./schema/application/anonymizedApplications.schema"
import Application from "./schema/application/applications.schema"
import AppointmentDetailed from "./schema/appointmentDetailed/appointmentDetailed.schema"
import Appointment from "./schema/appointments/appointment.schema"
import Credential from "./schema/credentials/credential.schema"
import DiplomesMetiers from "./schema/diplomesmetiers/diplomesmetiers.schema"
import DomainesMetiers from "./schema/domainesmetiers/domainesmetiers.schema"
import EligibleTrainingsForAppointment from "./schema/eligibleTrainingsForAppointment/eligibleTrainingsForAppointment.schema"
import eligibleTrainingsForAppointmentHistory from "./schema/eligibleTrainingsForAppointmentsHistory/eligibleTrainingsForAppointmentHistory.schema"
import EmailBlacklist from "./schema/emailBlacklist/emailBlacklist.schema"
import Etablissement from "./schema/etablissements/etablissement.schema"
import FicheMetierRomeV3 from "./schema/ficheRomeV3/ficheRomeV3"
import FormationCatalogue from "./schema/formationCatalogue/formationCatalogue.schema"
import GeoLocation from "./schema/geolocation/geolocation.schema"
import InternalJobs from "./schema/internalJobs/internalJobs.schema"
import Job from "./schema/jobs/jobs.schema"
import LbaCompany from "./schema/lbaCompany/lbaCompany.schema"
import LbaCompanyLegacy from "./schema/lbaCompanylegacy/lbaCompanyLegacy.schema"
import Opco from "./schema/opco/opco.schema"
import Optout from "./schema/optout/optout.schema"
import Recruiter from "./schema/recruiter/recruiter.schema"
import ReferentielOnisep from "./schema/referentielOnisep/referentielOnisep.schema"
import ReferentielOpco from "./schema/referentielOpco/referentielOpco.schema"
import RncpRomes from "./schema/rncpRomes/rncpRomes.schema"
import Session from "./schema/session/session.schema"
import SiretDiffusibleStatus from "./schema/siretDiffusibleStatusSchema/siretDiffusibleStatusSchema.schema"
import UnsubscribedLbaCompany from "./schema/unsubscribedLbaCompany/unsubscribedLbaCompany.schema"
import UnsubscribeOF from "./schema/unsubscribedOF/unsubscribeOF.schema"
import User from "./schema/user/user.schema"
import UserRecruteur from "./schema/userRecruteur/usersRecruteur.schema"

export async function createMongoDBIndexes() {
  const results = await Promise.allSettled(
    mongooseInstance.modelNames().map(async (name) => {
      const model = mongooseInstance.model(name)
      return model.createIndexes({ background: true }).catch(async (e) => {
        if (e.codeName === "IndexOptionsConflict") {
          const err = new Error(`Conflict in indexes for ${name}`, { cause: e })
          logger.error(err)
          captureException(err)
          await mongooseInstance.connection.collection(model.collection.name).dropIndexes()
          await model.createIndexes({ background: true })
        } else {
          throw e
        }
      })
    })
  )

  const errors = results.reduce((acc, r) => {
    if (r.status === "rejected") {
      acc.push(r.reason)

      logger.error(r.reason)
      captureException(r.reason)
    }

    return acc
  }, [] as Error[])

  if (errors.length > 0) {
    throw new AggregateError(errors, `createMongoDBIndexes failed with ${errors.length} errors`)
  }
}

export {
  ApiCalls,
  AnonymizedApplication,
  Application,
  Appointment,
  AppointmentDetailed,
  Credential,
  SiretDiffusibleStatus,
  DiplomesMetiers,
  DomainesMetiers,
  EligibleTrainingsForAppointment,
  EmailBlacklist,
  Etablissement,
  FicheMetierRomeV3,
  FormationCatalogue,
  GeoLocation,
  InternalJobs,
  Job,
  LbaCompany,
  LbaCompanyLegacy,
  Opco,
  Optout,
  Recruiter,
  ReferentielOnisep,
  ReferentielOpco,
  RncpRomes,
  Session,
  UnsubscribeOF,
  UnsubscribedLbaCompany,
  User,
  AnonymizedUser,
  UserRecruteur,
  eligibleTrainingsForAppointmentHistory,
}
