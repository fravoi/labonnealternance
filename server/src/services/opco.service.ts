import memoize from "memoizee"
import { OPCOS } from "shared/constants/recruteur"
import { IReferentielOpco, ZReferentielOpcoInsert } from "shared/models"

import { Opco } from "../common/model/index"
import { IOpco } from "../common/model/schema/opco/opco.types"

import { CFADOCK_FILTER_LIMIT, fetchOpcosFromCFADock } from "./cfadock.service"

/**
 * @description get opco from database collection OPCOS
 * @param {string} siren
 * @returns {Promise<IOpco>}
 */
export const getOpcoBySirenFromDB = (siren) => Opco.findOne({ siren })

/**
 * @description tente d'ajouter un opco en base et retourne une string indiquant le résultat
 * @param {IOpco} opcoData
 * @returns {Promise<IOpco>}
 */
export const saveOpco = async (opcoData: IOpco) => Opco.findOneAndUpdate({ siren: opcoData.siren }, opcoData, { upsert: true })

/**
 * @description retourne le nom court d'un opco en paramètre
 * @param {string} shortName
 * @returns {string}
 */
export const getOpcoLongName = memoize((shortName: string) => Object.values(OPCOS).find((k) => OPCOS[k] === shortName.toUpperCase()))

/**
 * @description retourne le nom court d'un opco en paramètre
 * @param {string} longName
 * @returns {string}
 */
const getOpcoShortName = (longName: string) => Object.keys(OPCOS).find((k) => OPCOS[k] === longName)

export const getMemoizedOpcoShortName = memoize(getOpcoShortName)

/**
 * @description Filtre une liste de jobs pour ne laisser que ceux qui ont la valeur opcoUrl ou opco
 * @param {any[]} jobs
 * @param {string} opco
 * @param {string} opcoUrl
 * @returns {Promise<any[]>}
 */
export const filterJobsByOpco = async ({ jobs, opco, opcoUrl }: { jobs: any[]; opco?: string; opcoUrl?: string }): Promise<any[]> => {
  let sirensToFind: any[] = []

  jobs.forEach((job) => {
    if (job?.company?.siret) {
      sirensToFind.push(job.company.siret.substring(0, 9))
    }
  })

  // les sociétés sans siren ne sont pas retournées
  if (sirensToFind.length === 0) {
    return []
  }

  // STEP 1 identifier les sociétés présentent dans notre base
  const searchForOpcoParams: any = { siren: { $in: sirensToFind } }

  if (opcoUrl) {
    searchForOpcoParams.url = opcoUrl.toLowerCase()
  }

  if (opco) {
    searchForOpcoParams.opco = OPCOS[opco.toUpperCase()]
  }

  const foundInMongoOpcos = await Opco.find(searchForOpcoParams)

  let opcoFilteredSirens: any[] = []

  const foundInMongoOpcoSirens = foundInMongoOpcos.map((opco) => opco.siren)

  opcoFilteredSirens = opcoFilteredSirens.concat(foundInMongoOpcoSirens)

  // STEP 2 identifier des sociétés provenant de CFA DOCK
  if (sirensToFind.length !== foundInMongoOpcoSirens.length) {
    const toRemove = new Set(foundInMongoOpcoSirens)
    sirensToFind = sirensToFind.filter((x) => !toRemove.has(x))

    for (let i = 0; i < sirensToFind.length; i += CFADOCK_FILTER_LIMIT) {
      const sirenChunk = sirensToFind.slice(i, i + CFADOCK_FILTER_LIMIT)
      try {
        const sirenOpcos = (await fetchOpcosFromCFADock(new Set(sirenChunk))).data.found

        sirenOpcos.forEach(async (sirenOpco) => {
          if (opcoUrl && sirenOpco.url === opcoUrl) {
            opcoFilteredSirens.push(sirenOpco.filters.siret)
          } else if (opco && opco.toUpperCase() === getMemoizedOpcoShortName(sirenOpco.opcoName)) {
            opcoFilteredSirens.push(sirenOpco.filters.siret)
          }

          // enregistrement des retours opcos dans notre base pour réduire les recours à CFADOCK
          await saveOpco({
            siren: sirenOpco.filters.siret,
            opco: sirenOpco.opcoName,
            url: sirenOpco.url,
            idcc: sirenOpco.idcc,
          })
        })
      } catch (err) {
        // ne rien faire. 429 probable de l'api CFADOCK dont le rate limiter est trop limitant
        // les éventuelles sociétés qui auraient pu matcher sont ignorées
      }
    }
  }

  // les sociétés n'appartenant pas à l'opco en paramètres ne sont pas retournées
  if (opcoFilteredSirens.length === 0) {
    return []
  }

  const results = jobs.filter((job) => {
    if (job?.company?.siret && opcoFilteredSirens.indexOf(job.company.siret.substring(0, 9)) >= 0) {
      return true
    } else {
      return false
    }
  })

  return results
}

export const prepareReferentielOpcoForInsert = (referentiel: Omit<IReferentielOpco, "_id">) => {
  if (ZReferentielOpcoInsert.safeParse(referentiel).success && referentiel.emails.length) {
    const deduplicatedEmails = [...new Set(referentiel.emails)]
    referentiel.emails = deduplicatedEmails
    return referentiel
  } else {
    return false
  }
}
