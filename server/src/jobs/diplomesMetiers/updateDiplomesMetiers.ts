import { ZDiplomesMetiersNew } from "shared/models"

import { search } from "../../common/esClient/index"
import { logger } from "../../common/logger"
import { DiplomesMetiers, FormationCatalogue } from "../../common/model/index"
import { resetIndexAndDb } from "../../common/utils/esUtils"
import { sentryCaptureException } from "../../common/utils/sentryUtils"

const motsIgnores = ["a", "au", "aux", "l", "le", "la", "les", "d", "de", "du", "des", "et", "en"]
const diplomesMetiers = {}
let shouldStop = false
let lastIdToSearchAfter = null

const buildAcronyms = (intitule) => {
  let acronymeLong = ""
  let acronymeCourt = ""
  let intitule_sans_parenthese = intitule

  if (intitule.indexOf(" (") >= 0) {
    intitule_sans_parenthese = intitule.substring(0, intitule.indexOf(" ("))
  }

  const tokens = intitule_sans_parenthese.toLowerCase().split(/[\s-';:,)]+/)

  tokens.map((token) => {
    if (token) {
      acronymeLong += token[0]

      if (motsIgnores.indexOf(token) < 0) {
        acronymeCourt += token[0]
      }
    }
  })

  return acronymeCourt + " " + acronymeLong
}

const updateDiplomeMetier = ({ initial, toAdd }) => {
  if (toAdd.codes_romes) {
    toAdd.codes_romes.map((rome_code) => {
      if (initial.codes_romes.indexOf(rome_code) < 0) {
        initial.codes_romes.push(rome_code)
      }
    })
  }

  if (initial.codes_rncps.indexOf(toAdd.rncp_code) < 0) {
    initial.codes_rncps.push(toAdd.rncp_code)
  }

  return initial
}

const getIntitulesFormations = async () => {
  const size = 1500 // make the process 10 secondes faster
  const intitules = []
  const body: any = {
    query: {
      bool: {
        must: {
          match_all: {},
        },
      },
    },
    sort: [{ _id: "asc" }],
  }

  if (lastIdToSearchAfter) {
    body.search_after = [lastIdToSearchAfter]
  }

  try {
    /**
     * KBA 30/11/2022 : TODO : use _scroll method from ES to get all data
     */
    const responseIntitulesFormations = await search(
      {
        index: "formationcatalogues",
        size,
        _source_includes: ["_id", "intitule_long", "rome_codes", "rncp_code"],
        body,
      },
      FormationCatalogue
    )

    responseIntitulesFormations.map((formation) => {
      if (!diplomesMetiers[formation._source.intitule_long]) {
        diplomesMetiers[formation._source.intitule_long] = {
          intitule_long: formation._source.intitule_long,
          codes_romes: formation._source.rome_codes,
          codes_rncps: [formation._source.rncp_code],
        }
      } else {
        diplomesMetiers[formation._source.intitule_long] = updateDiplomeMetier({
          initial: diplomesMetiers[formation._source.intitule_long],
          toAdd: formation._source,
        })
      }

      lastIdToSearchAfter = formation._id
    })

    if (responseIntitulesFormations.length < size) {
      shouldStop = true
    }

    return intitules
  } catch (error) {
    sentryCaptureException(error)
    logger.error("Erreur lors de la récupération des codes formations depuis l'ES")
    logger.error(error)
  }
}

export default async function () {
  logger.info(" -- Start of DiplomesMetiers initializer -- ")

  await resetIndexAndDb("diplomesmetiers", DiplomesMetiers, { requireAsciiFolding: true })

  logger.info(`Début traitement`)

  while (!shouldStop) {
    await getIntitulesFormations()
  }

  for (const k in diplomesMetiers) {
    diplomesMetiers[k].acronymes_intitule = buildAcronyms(diplomesMetiers[k].intitule_long)

    if (diplomesMetiers[k]?.codes_romes?.length) {
      const parsedDiplomeMetier = ZDiplomesMetiersNew.safeParse(diplomesMetiers[k])
      if (parsedDiplomeMetier.success) {
        await new DiplomesMetiers(parsedDiplomeMetier.data).save()
      } else {
        logger.error(`Mauvais format diplomesmetier pour le diplôme ${diplomesMetiers[k].intitule_long}`)
      }
    }
  }

  logger.info(`Fin traitement`)
}
