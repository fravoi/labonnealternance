import dayjs from "dayjs"
import { getLastStatusEvent, IRecruiter, parseEnumOrError, ZGlobalAddress } from "shared"
import { ENTREPRISE, ETAT_UTILISATEUR, OPCOS, VALIDATION_UTILISATEUR } from "shared/constants/recruteur.js"
import { ICFA } from "shared/models/cfa.model.js"
import { EntrepriseStatus, IEntreprise, IEntrepriseStatusEvent } from "shared/models/entreprise.model.js"
import { AccessEntityType, AccessStatus, IRoleManagement, IRoleManagementEvent } from "shared/models/roleManagement.model.js"
import { IUser2, IUserStatusEvent, UserEventType } from "shared/models/user2.model.js"
import { IUserRecruteur } from "shared/models/usersRecruteur.model.js"

import { ObjectId } from "@/common/mongodb.js"

import { logger } from "../../common/logger.js"
import { Recruiter, UserRecruteur } from "../../common/model/index.js"
import { Cfa } from "../../common/model/schema/multiCompte/cfa.schema.js"
import { Entreprise } from "../../common/model/schema/multiCompte/entreprise.schema.js"
import { RoleManagement } from "../../common/model/schema/multiCompte/roleManagement.schema.js"
import { User2 } from "../../common/model/schema/multiCompte/user2.schema.js"
import { notifyToSlack } from "../../common/utils/slackUtils.js"

export const migrationUsers = async () => {
  await User2.deleteMany({})
  await Entreprise.deleteMany({})
  await Cfa.deleteMany({})
  await RoleManagement.deleteMany({})
  await migrationRecruiters()
  await migrationUserRecruteurs()
}

const migrationRecruiters = async () => {
  logger.info(`Migration: lecture des recruiteurs...`)
  const stats = { success: 0, failure: 0, jobSuccess: 0 }
  const recruiterOrphans: string[] = []

  await cursorForEach<IRecruiter>(await Recruiter.find({}).lean(), async (recruiter, index) => {
    index % 1000 === 0 && logger.info(`import du recruiteur n°${index}`)
    try {
      const { establishment_id, cfa_delegated_siret, jobs } = recruiter
      let userRecruiter: IUserRecruteur
      if (cfa_delegated_siret) {
        userRecruiter = await UserRecruteur.findOne({ establishment_siret: cfa_delegated_siret }).lean()
        if (!userRecruiter) {
          throw new Error(`inattendu: impossible de trouver le user recruteur avec establishment_siret=${cfa_delegated_siret}`)
        }
      } else {
        userRecruiter = await UserRecruteur.findOne({ establishment_id }).lean()
        if (!userRecruiter) {
          recruiterOrphans.push(establishment_id)
          throw new Error(`inattendu: impossible de trouver le user recruteur avec establishment_id=${establishment_id}`)
        }
      }
      await Promise.all(
        jobs.map(async (job) => {
          await Recruiter.findOneAndUpdate(
            { "jobs._id": job._id },
            {
              $set: {
                // les ids des users sont identiques aux userRecruteurs. Les userRecruteurs sont migrés après pour écraser les infos de contact
                "jobs.$.managed_by": userRecruiter._id,
              },
            },
            { new: true }
          ).lean()
          stats.jobSuccess++
        })
      )
      stats.success++
    } catch (err) {
      logger.error(`erreur lors de l'import du recruiteur avec id=${recruiter._id}`)
      logger.error(err)
      stats.failure++
    }
  })
  logger.info(`recruiters orphelins :
  ${JSON.stringify(recruiterOrphans, null, 2)}
  `)
  logger.info(`Migration: user candidats terminés`)
  const message = `${stats.success} recruiteurs repris avec succès.
  ${stats.failure} recruiteurs en erreur.
  ${stats.jobSuccess} offres reprises avec succès.
  `
  logger.info(message)
  await notifyToSlack({
    subject: "Migration multi-compte",
    message,
    error: stats.failure > 0,
  })
  return stats
}

const migrationUserRecruteurs = async () => {
  logger.info(`Migration: lecture des user recruteurs...`)
  const stats = { success: 0, failure: 0, entrepriseCreated: 0, cfaCreated: 0, userCreated: 0, adminAccess: 0, opcoAccess: 0 }
  await cursorForEach<IUserRecruteur>((await UserRecruteur.find({}).lean()).reverse(), async (userRecruteur, index) => {
    const {
      last_name,
      first_name,
      opco,
      idcc,
      establishment_raison_sociale,
      establishment_enseigne,
      establishment_siret,
      address,
      geo_coordinates,
      phone,
      email,
      scope,
      type,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      establishment_id,
      origin: originRaw,
      is_email_checked,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      is_qualiopi,
      last_connection,
      createdAt,
      updatedAt,
    } = userRecruteur

    const oldStatus: IUserRecruteur["status"] | undefined = userRecruteur.status
    const origin = originRaw || "user migration"
    index % 1000 === 0 && logger.info(`import du user recruteur n°${index}`)
    try {
      const newStatus: IUserStatusEvent[] = []
      const lastOldStatus = getLastStatusEvent(oldStatus)?.status
      if (is_email_checked) {
        newStatus.push({
          date: createdAt,
          reason: "migration",
          status: UserEventType.VALIDATION_EMAIL,
          validation_type: VALIDATION_UTILISATEUR.AUTO,
          granted_by: "migration",
        })
      }
      newStatus.push({
        date: createdAt,
        reason: "migration",
        status: lastOldStatus === ETAT_UTILISATEUR.DESACTIVE ? UserEventType.DESACTIVE : UserEventType.ACTIF,
        validation_type: VALIDATION_UTILISATEUR.AUTO,
        granted_by: "migration",
      })
      const newUser: IUser2 = {
        _id: userRecruteur._id,
        first_name: first_name ?? "",
        last_name: last_name ?? "",
        phone: phone ?? "",
        email,
        last_action_date: last_connection,
        createdAt,
        updatedAt,
        origin,
        status: newStatus,
      }
      await createWithTimestamps(User2, newUser)
      stats.userCreated++
      if (type === ENTREPRISE) {
        if (!establishment_siret) {
          throw new Error("inattendu pour une ENTREPRISE: pas de establishment_siret")
        }
        const address_detail = fixAddressDetail(userRecruteur.address_detail)
        checkAddressDetail(address_detail)
        if (address_detail !== userRecruteur.address_detail && userRecruteur.establishment_id) {
          const updatedRecruiter = await Recruiter.findOneAndUpdate({ establishment_id: userRecruteur.establishment_id }, { address_detail })
          if (!updatedRecruiter) {
            throw new Error("impossible de corriger address_detail : recruiter introuvable")
          }
        }
        const newEntreprise: IEntreprise = {
          _id: new ObjectId(),
          origin,
          siret: establishment_siret,
          address,
          address_detail,
          enseigne: establishment_enseigne,
          raison_sociale: establishment_raison_sociale,
          geo_coordinates,
          idcc,
          opco,
          createdAt,
          updatedAt,
          status: userRecruteurStatusToEntrepriseStatus(oldStatus),
        }
        let entreprise = await Entreprise.findOne({ siret: newEntreprise.siret }).lean()
        if (entreprise) {
          if (dayjs(entreprise.updatedAt).isBefore(updatedAt)) {
            await Entreprise.findOneAndUpdate({ _id: entreprise._id }, { $set: { updatedAt } }, { timestamps: false })
          }
          if (dayjs(entreprise.createdAt).isAfter(createdAt)) {
            await Entreprise.findOneAndUpdate({ _id: entreprise._id }, { $set: { createdAt } }, { timestamps: false })
          }
        } else {
          if (getLastStatusEvent(newEntreprise.status)?.status !== EntrepriseStatus.ERROR) {
            if (!newEntreprise.address || !newEntreprise.address_detail || !newEntreprise.enseigne || !newEntreprise.raison_sociale || !newEntreprise.geo_coordinates) {
              newEntreprise.status.push({
                date: new Date(),
                reason: "champ manquant",
                status: EntrepriseStatus.A_METTRE_A_JOUR,
                validation_type: VALIDATION_UTILISATEUR.AUTO,
                granted_by: "migration",
              })
            }
          }
          entreprise = await createWithTimestamps(Entreprise, newEntreprise)
          stats.entrepriseCreated++
        }
        const roleManagement: Omit<IRoleManagement, "_id"> = {
          user_id: newUser._id,
          authorized_type: AccessEntityType.ENTREPRISE,
          authorized_id: entreprise._id.toString(),
          createdAt: userRecruteur.createdAt,
          updatedAt: userRecruteur.updatedAt,
          origin,
          status: userRecruteurStatusToRoleManagementStatus(oldStatus),
        }
        await createWithTimestamps(RoleManagement, roleManagement)
      } else if (type === "CFA") {
        if (!establishment_siret) {
          throw new Error("inattendu pour un CFA: pas de establishment_siret")
        }
        const address_detail = fixAddressDetail(userRecruteur.address_detail)
        checkAddressDetail(address_detail)
        const newCfa: ICFA = {
          _id: new ObjectId(),
          siret: establishment_siret,
          address,
          address_detail,
          enseigne: establishment_enseigne,
          raison_sociale: establishment_raison_sociale,
          geo_coordinates,
          origin,
          createdAt,
          updatedAt,
        }
        let cfa = await Cfa.findOne({ siret: newCfa.siret }).lean()
        if (cfa) {
          if (dayjs(cfa.updatedAt).isBefore(updatedAt)) {
            await Cfa.findOneAndUpdate({ _id: cfa._id }, { $set: { updatedAt } }, { timestamps: false })
          }
          if (dayjs(cfa.createdAt).isAfter(createdAt)) {
            await Cfa.findOneAndUpdate({ _id: cfa._id }, { $set: { createdAt } }, { timestamps: false })
          }
        } else {
          cfa = await createWithTimestamps(Cfa, newCfa)
          stats.cfaCreated++
        }
        const roleManagement: Omit<IRoleManagement, "_id"> = {
          user_id: newUser._id,
          authorized_type: AccessEntityType.CFA,
          authorized_id: cfa._id.toString(),
          createdAt: userRecruteur.createdAt,
          updatedAt: userRecruteur.updatedAt,
          origin,
          status: userRecruteurStatusToRoleManagementStatus(oldStatus),
        }
        await createWithTimestamps(RoleManagement, roleManagement)
      } else if (type === "ADMIN") {
        const roleManagement: Omit<IRoleManagement, "_id"> = {
          user_id: newUser._id,
          authorized_type: AccessEntityType.ADMIN,
          authorized_id: "",
          createdAt: userRecruteur.createdAt,
          updatedAt: userRecruteur.updatedAt,
          origin,
          status: userRecruteurStatusToRoleManagementStatus(oldStatus),
        }
        await createWithTimestamps(RoleManagement, roleManagement)
        stats.adminAccess++
      } else if (type === "OPCO") {
        const opco = parseEnumOrError(OPCOS, scope ?? null)
        const roleManagement: Omit<IRoleManagement, "_id"> = {
          user_id: newUser._id,
          authorized_type: AccessEntityType.OPCO,
          authorized_id: opco,
          createdAt: userRecruteur.createdAt,
          updatedAt: userRecruteur.updatedAt,
          origin,
          status: userRecruteurStatusToRoleManagementStatus(oldStatus),
        }
        await createWithTimestamps(RoleManagement, roleManagement)
        stats.opcoAccess++
      } else {
        throw new Error(`unsupported type: ${type}`)
      }
      stats.success++
    } catch (err) {
      logger.error(`erreur lors de l'import du user recruteur avec id=${userRecruteur._id}`)
      logger.error(err)
      stats.failure++
    }
  })
  logger.info(`Migration: user candidats terminés`)
  const message = `${stats.success} user recruteurs repris avec succès.
  ${stats.failure} user recruteurs en erreur.
  ${stats.userCreated} user créés.
  ${stats.entrepriseCreated} entreprises créées.
  ${stats.cfaCreated} CFA créés.
  `
  logger.info(message)
  await notifyToSlack({
    subject: "Migration multi-compte",
    message,
    error: stats.failure > 0,
  })
  return stats
}

function userRecruteurStatusToRoleManagementStatus(allStatus: IUserRecruteur["status"] | undefined): IRoleManagementEvent[] {
  const computedStatus = (allStatus ?? []).flatMap((statusEvent) => {
    const { date, reason, status, user, validation_type } = statusEvent
    const statusMapping: Record<ETAT_UTILISATEUR, AccessStatus | null> = {
      [ETAT_UTILISATEUR.DESACTIVE]: AccessStatus.DENIED,
      [ETAT_UTILISATEUR.VALIDE]: AccessStatus.GRANTED,
      [ETAT_UTILISATEUR.ATTENTE]: AccessStatus.AWAITING_VALIDATION,
      [ETAT_UTILISATEUR.ERROR]: AccessStatus.AWAITING_VALIDATION,
    }
    const accessStatus = status ? statusMapping[status] : null
    if (accessStatus && date) {
      const newEvent: IRoleManagementEvent = {
        date,
        reason: reason ?? "",
        validation_type: parseEnumOrError(VALIDATION_UTILISATEUR, validation_type),
        granted_by: user,
        status: accessStatus,
      }
      return [newEvent]
    } else {
      return []
    }
  })
  if (!computedStatus.length) {
    return [
      {
        date: new Date(),
        validation_type: VALIDATION_UTILISATEUR.AUTO,
        reason: "multi compte : aucun status",
        status: AccessStatus.GRANTED,
      },
    ]
  }
  return computedStatus
}

function userRecruteurStatusToEntrepriseStatus(allStatus: IUserRecruteur["status"] | undefined): IEntrepriseStatusEvent[] {
  const computedStatus = (allStatus ?? []).flatMap((statusEvent) => {
    const { date, reason, status, user, validation_type } = statusEvent
    const statusMapping: Record<ETAT_UTILISATEUR, EntrepriseStatus | null> = {
      [ETAT_UTILISATEUR.VALIDE]: EntrepriseStatus.VALIDE,
      [ETAT_UTILISATEUR.ERROR]: EntrepriseStatus.ERROR,
      [ETAT_UTILISATEUR.ATTENTE]: EntrepriseStatus.VALIDE,
      [ETAT_UTILISATEUR.DESACTIVE]: null,
    }
    const entrepriseStatus = status ? statusMapping[status] : null
    if (entrepriseStatus && date) {
      const newEvent: IEntrepriseStatusEvent = {
        date,
        reason: reason ?? "",
        validation_type: parseEnumOrError(VALIDATION_UTILISATEUR, validation_type),
        granted_by: user,
        status: entrepriseStatus,
      }
      return [newEvent]
    } else {
      return []
    }
  })
  if (!computedStatus.length) {
    return [
      {
        date: new Date(),
        reason: "migration multi compte : aucun status présent",
        validation_type: VALIDATION_UTILISATEUR.AUTO,
        status: EntrepriseStatus.ERROR,
      },
    ]
  }
  return computedStatus
}

const fixAddressDetail = (addressDetail: any) => {
  const lFields = ["l1", "l2", "l3", "l4", "l5", "l6", "l7"]
  const normalFields = ["numero_voie", "type_voie", "nom_voie", "complement_adresse", "code_postal", "localite", "code_insee_localite", "cedex"]
  if (addressDetail && [...lFields, ...normalFields].every((field) => field in addressDetail)) {
    return Object.fromEntries([
      ...normalFields.map((field) => [field, addressDetail[field]]),
      ["acheminement_postal", Object.fromEntries(lFields.map((field) => [field, addressDetail[field]]))],
    ])
  } else {
    return addressDetail
  }
}

const checkAddressDetail = (address_detail: any) => {
  if (!address_detail) return
  if (!ZGlobalAddress.safeParse(address_detail).success) {
    throw new Error(`address_detail not ok: ${JSON.stringify(address_detail, null, 2)}`)
  }
}

const cursorForEach = async <T>(array: T[], fct: (item: T, index: number) => Promise<void>) => {
  let index = 0
  let item: T | undefined = array.at(index)
  while (item) {
    await fct(item, index)
    index++
    item = array.at(index)
  }
}

const createWithTimestamps = async <T>(collection: any, document: T): Promise<T> => {
  const docs = await collection.create([document], { timestamps: false })
  return docs[0]
}
