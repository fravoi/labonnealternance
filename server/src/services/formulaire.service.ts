import Boom from "boom"
import type { ObjectId as ObjectIdType } from "mongodb"
import pkg from "mongodb"
import type { FilterQuery, ModelUpdateOptions, UpdateQuery } from "mongoose"
import { IDelegation, IJob, IJobWithRomeDetail, IJobWritable, IRecruiter, IUserRecruteur, JOB_STATUS } from "shared"
import { RECRUITER_STATUS } from "shared/constants/recruteur"
import { EntrepriseStatus, IEntreprise } from "shared/models/entreprise.model"
import { AccessEntityType, AccessStatus } from "shared/models/roleManagement.model"
import { IUserWithAccount } from "shared/models/userWithAccount.model"
import { getLastStatusEvent } from "shared/utils/getLastStatusEvent"

import { getStaticFilePath } from "@/common/utils/getStaticFilePath"

import { Cfa, Entreprise, Recruiter, RoleManagement, UnsubscribeOF } from "../common/model/index"
import { asyncForEach } from "../common/utils/asyncUtils"
import config from "../config"

import { getUser2ManagingOffer } from "./application.service"
import { createCfaUnsubscribeToken, createViewDelegationLink } from "./appLinks.service"
import { getCatalogueFormations } from "./catalogue.service"
import dayjs from "./dayjs.service"
import { sendEmailConfirmationEntreprise } from "./etablissement.service"
import mailer, { sanitizeForEmail } from "./mailer.service"
import { getComputedUserAccess, getGrantedRoles } from "./roleManagement.service"
import { getRomeDetailsFromDB } from "./rome.service"

const { ObjectId } = pkg

export interface IOffreExtended extends IJob {
  candidatures: number
  pourvue: string
  supprimer: string
}

// étape d'aggragation mongo permettant de récupérer le rome_detail correspondant dans chaque job d'un recruiter
export const romeDetailAggregateStages = [
  {
    $unwind: { path: "$jobs" },
  },
  {
    $lookup: {
      from: "referentielromes",
      localField: "jobs.rome_code.0",
      foreignField: "rome.code_rome",
      as: "referentielrome",
    },
  },
  {
    $unwind: { path: "$referentielrome" },
  },
  {
    $set: { "jobs.rome_detail": "$referentielrome" },
  },
  {
    $group: {
      _id: "$_id",
      recruiters: {
        $first: "$$ROOT",
      },
      jobs: { $push: "$jobs" },
    },
  },
  {
    $replaceRoot: { newRoot: { $mergeObjects: ["$recruiters", { jobs: "$jobs" }] } },
  },
  {
    $project: { referentielrome: 0, "jobs.rome_detail._id": 0 },
  },
]

/**
 * @description get formulaire by offer id
 */
export const getOffreAvecInfoMandataire = async (id: string | ObjectIdType): Promise<{ recruiter: IRecruiter; job: IJob } | null> => {
  const recruiterOpt = await getOffreWithRomeDetail(id)

  if (!recruiterOpt) {
    return null
  }
  const job = recruiterOpt.jobs.find((x) => x._id.toString() === id.toString())
  if (!job) {
    return null
  }
  recruiterOpt.jobs = [job]
  if (recruiterOpt.is_delegated && recruiterOpt.address) {
    const { cfa_delegated_siret } = recruiterOpt
    if (cfa_delegated_siret) {
      const cfa = await Cfa.findOne({ siret: cfa_delegated_siret }).lean()
      if (cfa) {
        const cfaUser = await getUser2ManagingOffer(getJobFromRecruiter(recruiterOpt, id.toString()))

        recruiterOpt.phone = cfaUser.phone
        recruiterOpt.email = cfaUser.email
        recruiterOpt.last_name = cfaUser.last_name
        recruiterOpt.first_name = cfaUser.first_name
        recruiterOpt.establishment_raison_sociale = cfa.raison_sociale
        recruiterOpt.address = cfa.address
        return { recruiter: recruiterOpt, job }
      }
    }
  }
  return { recruiter: recruiterOpt, job }
}

/**
 * @description Get formulaire list with mondodb paginate query
 * @param {Object} payload
 * @param {FilterQuery<IRecruiter>} payload.query
 * @param {object} payload.options
 * @param {number} payload.page
 * @param {number} payload.limit
 */
export const getFormulaires = async (query: FilterQuery<IRecruiter>, select: object, { page, limit }: { page?: number; limit?: number }) => {
  const response = await Recruiter.paginate({ query, select, page, limit, lean: true })

  return {
    pagination: {
      page: response?.page,
      result_per_page: limit,
      number_of_page: response?.totalPages,
      total: response?.totalDocs,
    },
    data: response?.docs,
  }
}

const isAuthorizedToPublishJob = async ({ userId, entrepriseId }: { userId: ObjectIdType; entrepriseId: ObjectIdType }) => {
  const access = getComputedUserAccess(userId.toString(), await getGrantedRoles(userId.toString()))
  return access.admin || access.entreprises.includes(entrepriseId.toString())
}

/**
 * @description Create job offer for formulaire
 */
export const createJob = async ({ job, establishment_id, user }: { job: IJobWritable; establishment_id: string; user: IUserWithAccount }): Promise<IRecruiter> => {
  const userId = user._id
  const recruiter = await Recruiter.findOne({ establishment_id: establishment_id }).lean()
  if (!recruiter) {
    throw Boom.internal(`recruiter with establishment_id=${establishment_id} not found`)
  }
  const { is_delegated, cfa_delegated_siret } = recruiter
  const organization = await (cfa_delegated_siret ? Cfa.findOne({ siret: cfa_delegated_siret }).lean() : Entreprise.findOne({ siret: recruiter.establishment_siret }).lean())
  if (!organization) {
    throw Boom.internal(`inattendu : impossible retrouver l'organisation pour establishment_id=${establishment_id}`)
  }
  let isOrganizationValid = false
  let entrepriseStatus: EntrepriseStatus | null = null
  if (cfa_delegated_siret) {
    isOrganizationValid = true
  } else if ("status" in organization) {
    entrepriseStatus = getLastStatusEvent((organization as IEntreprise).status)?.status ?? null
    isOrganizationValid = entrepriseStatus === EntrepriseStatus.VALIDE && (await isAuthorizedToPublishJob({ userId, entrepriseId: organization._id }))
  }
  const isJobActive = isOrganizationValid

  const newJobStatus = isJobActive ? JOB_STATUS.ACTIVE : JOB_STATUS.EN_ATTENTE
  // get user activation state if not managed by a CFA
  const codeRome = job.rome_code.at(0)
  if (!codeRome) {
    throw Boom.internal(`inattendu : pas de code rome pour une création d'offre pour le recruiter id=${establishment_id}`)
  }
  const romeData = await getRomeDetailsFromDB(codeRome)
  if (!romeData) {
    throw Boom.internal(`could not find rome infos for rome=${codeRome}`)
  }
  const creationDate = new Date()
  const { job_start_date } = job
  const updatedJob: Partial<IJob> = Object.assign(job, {
    job_status: newJobStatus,
    job_start_date,
    job_creation_date: creationDate,
    job_expiration_date: addExpirationPeriod(creationDate).toDate(),
    job_update_date: creationDate,
    managed_by: userId,
  })
  // insert job
  const updatedFormulaire = await createOffre(establishment_id, updatedJob)
  const { jobs } = updatedFormulaire
  const createdJob = jobs.at(jobs.length - 1)
  if (!createdJob) {
    throw Boom.internal("unexpected: no job found after job creation")
  }
  // if first offer creation for an Entreprise, send specific mail
  if (jobs.length === 1 && is_delegated === false) {
    if (!entrepriseStatus) {
      throw Boom.internal(`inattendu : pas de status pour l'entreprise pour establishment_id=${establishment_id}`)
    }
    const role = await RoleManagement.findOne({ user_id: userId, authorized_type: AccessEntityType.ENTREPRISE, authorized_id: organization._id.toString() }).lean()
    const roleStatus = getLastStatusEvent(role?.status)?.status ?? null
    await sendEmailConfirmationEntreprise(user, updatedFormulaire, roleStatus, entrepriseStatus)
    return updatedFormulaire
  }

  let contactCFA: IUserWithAccount | null = null
  if (is_delegated) {
    if (!cfa_delegated_siret) {
      throw Boom.internal(`unexpected: could not find user recruteur CFA that created the job`)
    }
    // get CFA informations if formulaire is handled by a CFA
    contactCFA = await getUser2ManagingOffer(createdJob)
    if (!contactCFA) {
      throw Boom.internal(`unexpected: could not find user recruteur CFA that created the job`)
    }
  }
  await sendMailNouvelleOffre(updatedFormulaire, createdJob, contactCFA ?? undefined)
  return updatedFormulaire
}

/**
 * Create job delegations
 */
export const createJobDelegations = async ({ jobId, etablissementCatalogueIds }: { jobId: IJob["_id"] | string; etablissementCatalogueIds: string[] }): Promise<IRecruiter> => {
  const recruiter = await getOffre(jobId)
  if (!recruiter) {
    throw Boom.internal("Offre not found", { jobId, etablissementCatalogueIds })
  }
  const offre = getJobFromRecruiter(recruiter, jobId.toString())
  const managingUser = await getUser2ManagingOffer(offre)
  const entreprise = await Entreprise.findOne({ siret: recruiter.establishment_siret }).lean()
  let shouldSentMailToCfa = false
  if (entreprise) {
    const role = await RoleManagement.findOne({ user_id: managingUser._id, authorized_id: entreprise._id.toString(), authorized_type: AccessEntityType.ENTREPRISE }).lean()
    if (role && getLastStatusEvent(role.status)?.status === AccessStatus.GRANTED) {
      shouldSentMailToCfa = true
    }
  }
  const delegations: IDelegation[] = []

  const formations = await getCatalogueFormations(
    {
      $or: [
        {
          etablissement_gestionnaire_id: { $in: etablissementCatalogueIds },
        },
        {
          etablissement_formateur_id: { $in: etablissementCatalogueIds },
        },
      ],
      etablissement_gestionnaire_courriel: { $nin: [null, ""] },
      catalogue_published: true,
    },
    { etablissement_gestionnaire_courriel: 1, etablissement_formateur_siret: 1, etablissement_gestionnaire_id: 1, etablissement_formateur_id: 1 }
  )

  await Promise.all(
    etablissementCatalogueIds.map(async (etablissementId) => {
      const formation = formations.find((formation) => formation.etablissement_gestionnaire_id === etablissementId || formation.etablissement_formateur_id === etablissementId)
      const { etablissement_formateur_siret: siret_code, etablissement_gestionnaire_courriel: email } = formation ?? {}
      if (!email || !siret_code) {
        // This shouldn't happen considering the query filter
        throw Boom.internal("Unexpected etablissement_gestionnaire_courriel", { jobId, etablissementCatalogueIds })
      }

      delegations.push({ siret_code, email })

      if (shouldSentMailToCfa) {
        await sendDelegationMailToCFA(email, offre, recruiter, siret_code)
      }
    })
  )

  offre.delegations = offre.delegations?.concat(delegations) ?? delegations
  offre.job_delegation_count = offre.delegations.length

  return updateOffre(jobId, offre)
}

/**
 * @description Check if job offer exists
 * @param {IJob['_id']} id
 * @returns {Promise<IRecruiter>}
 */
export const checkOffreExists = async (id: IJob["_id"]): Promise<boolean> => {
  const offre = await getOffre(id.toString())
  return offre ? true : false
}

/**
 * @description Find formulaire by query
 * @param {FilterQuery<IRecruiter>} query
 * @returns {Promise<IRecruiter>}
 */
export const getFormulaire = async (query: FilterQuery<IRecruiter>): Promise<IRecruiter> => Recruiter.findOne(query).lean()

export const getFormulaireWithRomeDetail = async (query: FilterQuery<IRecruiter>): Promise<IRecruiter | null> => {
  const recruiterWithRomeDetail: IRecruiter[] = await Recruiter.aggregate([
    {
      $match: query,
    },
    ...romeDetailAggregateStages,
  ])

  return recruiterWithRomeDetail.length ? recruiterWithRomeDetail[0] : await getFormulaire(query)
}

/**
 * @description Create new formulaire
 * @param {IRecruiter} payload
 * @returns {Promise<IRecruiter>}
 */
export const createFormulaire = async (payload: Partial<Omit<IRecruiter, "_id" | "establishment_id" | "createdAt" | "updatedAt">>, managedBy: string): Promise<IRecruiter> => {
  const recruiter = await Recruiter.create({ ...payload, managed_by: managedBy })
  return recruiter.toObject()
}

/**
 * Remove formulaire by id
 */
export const deleteFormulaire = async (id: IRecruiter["_id"]): Promise<IRecruiter | null> => await Recruiter.findByIdAndDelete(id)

/**
 * @description Remove all formulaires belonging to gestionnaire
 * @param {IUserRecruteur["establishment_siret"]} establishment_siret
 * @returns {Promise<IRecruiter>}
 */
export const deleteFormulaireFromGestionnaire = async (siret: IUserRecruteur["establishment_siret"]): Promise<void> => {
  await Recruiter.deleteMany({ cfa_delegated_siret: siret })
}

/**
 * @description Update existing formulaire and return updated version
 */
export const updateFormulaire = async (establishment_id: IRecruiter["establishment_id"], payload: UpdateQuery<IRecruiter>): Promise<IRecruiter> => {
  const recruiter = await Recruiter.findOneAndUpdate({ establishment_id }, payload, { new: true }).lean()
  if (!recruiter) {
    throw Boom.internal("Recruiter not found")
  }
  return recruiter
}

/**
 * @description Archive existing formulaire and cancel all its job offers
 * @param {IRecruiter["establishment_id"]} establishment_id
 * @returns {Promise<boolean>}
 */
export const archiveFormulaire = async (id: IRecruiter["establishment_id"]): Promise<boolean> => {
  const recruiter = await Recruiter.findOne({ establishment_id: id })
  if (!recruiter) {
    throw Boom.internal("Recruiter not found")
  }

  recruiter.status = RECRUITER_STATUS.ARCHIVE

  recruiter.jobs.map((job) => {
    job.job_status = JOB_STATUS.ANNULEE
  })

  await recruiter.save()

  return true
}

/**
 * @description Unarchive existing formulaire
 * @param {IRecruiter["establishment_id"]} establishment_id
 * @returns {Promise<boolean>}
 */
export const reactivateRecruiter = async (id: IRecruiter["_id"]): Promise<boolean> => {
  const recruiter = await Recruiter.findOne({ _id: id })
  if (!recruiter) {
    throw Boom.internal("Recruiter not found")
  }
  recruiter.status = RECRUITER_STATUS.ACTIF
  await recruiter.save()
  return true
}

/**
 * @description Archive existing delegated formulaires and cancel all its job offers
 * @param {IUserRecruteur["establishment_siret"]} establishment_siret
 * @returns {Promise<boolean>}
 */
export const archiveDelegatedFormulaire = async (siret: IUserRecruteur["establishment_siret"]): Promise<boolean> => {
  const formulaires = await Recruiter.find({ cfa_delegated_siret: siret }).lean()

  if (!formulaires.length) return false

  await asyncForEach(formulaires, async (form: IRecruiter) => {
    form.status = RECRUITER_STATUS.ARCHIVE

    form.jobs.forEach((job) => {
      job.job_status = JOB_STATUS.ANNULEE
    })

    await Recruiter.findByIdAndUpdate(form._id, form)
  })

  return true
}

/**
 * @description Get job offer by job id
 * @param {IJob["_id"]} id
 */
export async function getOffre(id: string | ObjectIdType) {
  return Recruiter.findOne({ "jobs._id": id }).lean()
}

export async function getOffreWithRomeDetail(id: string | ObjectIdType) {
  const recruiter: IRecruiter[] = await Recruiter.aggregate([
    {
      $match: { "jobs._id": new ObjectId(id) },
    },
    ...romeDetailAggregateStages,
  ])

  return recruiter.length ? recruiter[0] : null
}

/**
 * Create job offer on existing formulaire
 */
export async function createOffre(establishment_id: IRecruiter["establishment_id"], payload: UpdateQuery<IJob>): Promise<IRecruiter> {
  const recruiter = await Recruiter.findOneAndUpdate({ establishment_id }, { $push: { jobs: payload } }, { new: true }).lean()

  if (!recruiter) {
    throw Boom.internal("Recruiter not found")
  }

  return recruiter
}

/**
 * @description Update existing job offer
 * @param {IJob["_id"]} id
 * @param {object} payload
 * @returns {Promise<IRecruiter>}
 */
export async function updateOffre(id: string | ObjectIdType, payload: UpdateQuery<IJob>): Promise<IRecruiter> {
  const recruiter = await Recruiter.findOneAndUpdate(
    { "jobs._id": id },
    {
      $set: {
        "jobs.$": payload,
      },
    },
    { new: true }
  ).lean()
  if (!recruiter) {
    throw Boom.internal("Recruiter not found")
  }
  return recruiter
}

/**
 * @description Update specific field(s) in an existing job offer
 * @param {IJob["_id"]} id
 * @param {object} payload
 * @returns {Promise<IRecruiter>}
 */
export const patchOffre = async (id: IJob["_id"], payload: UpdateQuery<IJob>, options: ModelUpdateOptions = { new: true }): Promise<IRecruiter> => {
  const fields = {}
  for (const key in payload) {
    fields[`jobs.$.${key}`] = payload[key]
  }

  const recruiter = await Recruiter.findOneAndUpdate(
    { "jobs._id": id },
    {
      $set: fields,
    },
    options
  ).lean()

  if (!recruiter) {
    throw Boom.internal("Recruiter not found")
  }

  return recruiter
}

/**
 * @description Change job status to provided
 * @param {IJob["_id"]} id
 * @returns {Promise<boolean>}
 */
export const provideOffre = async (id: IJob["_id"]): Promise<boolean> => {
  await Recruiter.findOneAndUpdate(
    { "jobs._id": id },
    {
      $set: {
        "jobs.$.job_status": JOB_STATUS.POURVUE,
        "jobs.$.job_update_date": Date.now(),
      },
    }
  )
  return true
}

/**
 * @description Cancel job from transaction email
 * @param {IJob["_id"]} id
 * @returns {Promise<boolean>}
 */
export const cancelOffre = async (id: IJob["_id"]): Promise<boolean> => {
  await Recruiter.findOneAndUpdate(
    { "jobs._id": id },
    {
      $set: {
        "jobs.$.job_status": JOB_STATUS.ANNULEE,
        "jobs.$.job_update_date": Date.now(),
      },
    }
  )
  return true
}

/**
 * @description Cancel job from admin interface
 * @param {IJob["_id"]} id
 * @returns {Promise<boolean>}
 */
export const cancelOffreFromAdminInterface = async (id: IJob["_id"], { job_status, job_status_comment }): Promise<boolean> => {
  await Recruiter.findOneAndUpdate(
    { "jobs._id": id },
    {
      $set: {
        "jobs.$.job_status": job_status,
        "jobs.$.job_status_comment": job_status_comment,
        "jobs.$.job_update_date": Date.now(),
      },
    }
  )
  return true
}

/**
 * @description Extends job duration by 1 month.
 * @param {IJob["_id"]} id
 * @returns {Promise<boolean>}
 */
export const extendOffre = async (id: IJob["_id"]): Promise<IJob> => {
  const recruiter = await Recruiter.findOneAndUpdate(
    { "jobs._id": id },
    {
      $set: {
        "jobs.$.job_expiration_date": addExpirationPeriod(dayjs()).toDate(),
        "jobs.$.job_last_prolongation_date": Date.now(),
        "jobs.$.job_update_date": Date.now(),
      },
      $inc: { "jobs.$.job_prolongation_count": 1 },
    },
    { new: true }
  ).lean()
  if (!recruiter) {
    throw Boom.notFound(`job with id=${id} not found`)
  }
  const job = recruiter.jobs.find((job) => job._id.toString() === id.toString())
  if (!job) {
    throw Boom.internal(`unexpected: job with id=${id} not found`)
  }
  return job
}

const activateAndExtendOffre = async (id: IJob["_id"]): Promise<IJob> => {
  const recruiter = await Recruiter.findOneAndUpdate(
    { "jobs._id": id },
    {
      $set: {
        "jobs.$.job_expiration_date": addExpirationPeriod(dayjs()).toDate(),
        "jobs.$.job_status": JOB_STATUS.ACTIVE,
      },
    },
    { new: true }
  ).lean()
  if (!recruiter) {
    throw Boom.notFound(`job with id=${id} not found`)
  }
  const job = recruiter.jobs.find((job) => job._id.toString() === id.toString())
  if (!job) {
    throw Boom.internal(`unexpected: job with id=${id} not found`)
  }
  return job
}

/**
 * to be called on the 1st activation of the account of a company
 * @param entrepriseRecruiter entreprise
 */
export const activateEntrepriseRecruiterForTheFirstTime = async (entrepriseRecruiter: IRecruiter) => {
  const firstJob = entrepriseRecruiter.jobs.at(0)
  if (firstJob) {
    const job = await activateAndExtendOffre(firstJob._id)
    // Send delegation if any
    if (job.delegations?.length) {
      await Promise.all(
        job.delegations.map(async (delegation) => {
          await sendDelegationMailToCFA(delegation.email, job, entrepriseRecruiter, delegation.siret_code)
        })
      )
    }
  }
}

/**
 * @description Get job offer by its id.
 */
export const getJob = async (id: string | ObjectIdType): Promise<IJob | null> => {
  const offre = await getOffre(id)
  if (!offre) return null
  return offre.jobs.find((job) => job._id.toString() === id.toString()) ?? null
}

/**
 * @description Get job offer by its id.
 */
export const getJobWithRomeDetail = async (id: string | ObjectIdType): Promise<IJobWithRomeDetail | null> => {
  const offre = await getOffre(id)
  if (!offre) return null

  const job = offre.jobs.find((job) => job._id.toString() === id.toString())
  if (!job) return null

  const referentielRome = await getRomeDetailsFromDB(job.rome_code[0])

  if (!referentielRome) return null

  return {
    ...job,
    rome_detail: referentielRome,
  }
}

/**
 * @description Sends the mail informing the CFA that a company wants the CFA to handle the offer.
 */
export async function sendDelegationMailToCFA(email: string, offre: IJob, recruiter: IRecruiter, siret_code: string) {
  const unsubscribeOF = await UnsubscribeOF.findOne({ establishment_siret: siret_code })
  if (unsubscribeOF) return
  const unsubscribeToken = createCfaUnsubscribeToken(email, siret_code)
  await mailer.sendEmail({
    to: email,
    subject: `Une entreprise recrute dans votre domaine`,
    template: getStaticFilePath("./templates/mail-cfa-delegation.mjml.ejs"),
    data: {
      images: {
        logoLba: `${config.publicUrl}/images/emails/logo_LBA.png?raw=true`,
      },
      enterpriseName: recruiter.establishment_raison_sociale,
      jobName: offre.rome_appellation_label,
      contractType: (offre.job_type ?? []).join(", "),
      trainingLevel: offre.job_level_label,
      startDate: dayjs(offre.job_start_date).format("DD/MM/YYYY"),
      duration: offre.job_duration,
      rhythm: offre.job_rythm,
      offerButton: createViewDelegationLink(email, recruiter.establishment_id, offre._id.toString(), siret_code),
      createAccountButton: `${config.publicUrl}/espace-pro/creation/cfa`,
      unsubscribeUrl: `${config.publicUrl}/espace-pro/proposition/formulaire/${recruiter.establishment_id}/offre/${offre._id}/siret/${siret_code}/unsubscribe?token=${unsubscribeToken}`,
    },
  })
}

export async function sendMailNouvelleOffre(recruiter: IRecruiter, job: IJob, contactCFA?: IUserWithAccount) {
  const isRecruteurAwaiting = recruiter.status === RECRUITER_STATUS.EN_ATTENTE_VALIDATION
  if (isRecruteurAwaiting) {
    return
  }
  const { is_delegated, email, last_name, first_name, establishment_raison_sociale, establishment_siret } = recruiter
  const establishmentTitle = establishment_raison_sociale ?? establishment_siret
  // Send mail with action links to manage offers
  await mailer.sendEmail({
    to: is_delegated && contactCFA ? contactCFA.email : email,
    subject: is_delegated ? `Votre offre d'alternance pour ${establishmentTitle} est publiée` : `Votre offre d'alternance est publiée`,
    template: getStaticFilePath("./templates/mail-nouvelle-offre.mjml.ejs"),
    data: {
      images: {
        logoLba: `${config.publicUrl}/images/emails/logo_LBA.png?raw=true`,
      },
      nom: sanitizeForEmail(is_delegated ? contactCFA?.last_name : last_name),
      prenom: sanitizeForEmail(is_delegated ? contactCFA?.first_name : first_name),
      raison_sociale: establishmentTitle,
      mandataire: recruiter.is_delegated,
      offre: {
        rome_appellation_label: job.rome_appellation_label,
        job_type: job.job_type,
        job_level_label: job.job_level_label,
        job_start_date: dayjs(job.job_start_date).format("DD/MM/YY"),
      },
      lba_url: `${config.publicUrl}/recherche-apprentissage?&display=list&page=fiche&type=matcha&itemId=${job._id}`,
    },
  })
}

export function addExpirationPeriod(fromDate: Date | dayjs.Dayjs): dayjs.Dayjs {
  return dayjs(fromDate).add(2, "months")
}

export const getJobFromRecruiter = (recruiter: IRecruiter, jobId: string): IJob => {
  const job = recruiter.jobs.find((job) => job._id.toString() === jobId)
  if (!job) {
    throw new Error(`could not find job with id=${jobId} in recruiter with id=${recruiter._id}`)
  }
  return job
}

export const getFormulaireFromUserId = async (userId: string) => {
  return Recruiter.findOne({ managed_by: userId }).lean()
}

export const getFormulaireFromUserIdOrError = async (userId: string) => {
  const formulaire = await getFormulaireFromUserId(userId)
  if (!formulaire) {
    throw Boom.internal(`inattendu : formulaire non trouvé`, { userId })
  }
  return formulaire
}
