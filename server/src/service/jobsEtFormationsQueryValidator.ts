import { validateApiSources, validateCaller, validateDiploma, validateInsee, validateLatitude, validateLongitude, validateRadius, validateRomesOrRncp } from "./queryValidators.js"

const jobsEtFormationsQueryValidator = async (query) => {
  const error_messages = []

  // contrôle des paramètres

  // présence d'identifiant de la source : caller
  validateCaller({ caller: query.caller, referer: query.referer }, error_messages)

  // codes ROME  et code RNCP : romes, rncp. Modifie la valeur de query.romes si code rncp correct
  await validateRomesOrRncp(query, error_messages)

  // coordonnées gps optionnelles : latitude et longitude
  if (query.latitude || query.longitude) {
    validateLatitude(query.latitude, error_messages)
    validateLongitude(query.longitude, error_messages)

    // rayon de recherche : radius
    validateRadius(query.radius, error_messages)
  }

  // diploma mal formée si présente
  validateDiploma(query.diploma, error_messages)

  // code INSEE : insee
  if (query.longitude) {
    validateInsee(query.insee, error_messages)
  }

  // source mal formée si présente
  validateApiSources(query.sources, error_messages, ["formations", "lbb", "lba", "offres", "matcha"])

  if (error_messages.length) return { error: "wrong_parameters", error_messages }

  return { result: "passed" }
}

export { jobsEtFormationsQueryValidator }
