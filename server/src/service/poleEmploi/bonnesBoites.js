import { getElasticInstance } from "../../common/esClient/index.js"
import { encryptMailWithIV } from "../../common/utils/encryptString.js"
import { manageApiError } from "../../common/utils/errorManager.js"
import { isAllowedSource } from "../../common/utils/isAllowedSource.js"
import { itemModel } from "../../model/itemModel.js"

import { lbbMock } from "../../mocks/lbbs-mock.js"

const esClient = getElasticInstance()

const getSomeLbbCompanies = async ({ romes, latitude, longitude, radius, type, referer, caller, opco, api = "jobV1", useMock }) => {
  const hasLocation = latitude === undefined ? false : true
  let companies = null
  let currentRadius = hasLocation ? radius : 21000
  let companyLimit = 150 //TODO: query params options or default value from properties -> size || 100

  if (useMock && useMock !== "false") {
    return { results: [lbbMock] }
  } else {
    companies = await getLbbCompanies({
      romes,
      latitude,
      longitude,
      radius: currentRadius,
      companyLimit,
      type,
      caller,
      api,
      opco,
    })

    if (companies && companies.length) {
      companies = transformLbbCompaniesForIdea({ companies, radius, type, referer, caller })
    }

    return companies
  }
}

const transformLbbCompaniesForIdea = ({ companies, type, referer, caller }) => {
  let resultCompanies = {
    results: [],
  }

  if (companies && companies.length) {
    const contactAllowedOrigin = isAllowedSource({ referer, caller })

    for (let i = 0; i < companies.length; ++i) {
      let company = transformLbbCompanyForIdea({
        company: companies[i],
        type,
        contactAllowedOrigin,
        caller,
      })
      resultCompanies.results.push(company)
    }
  }

  return resultCompanies
}

// Adaptation au modèle Idea et conservation des seules infos utilisées des offres
const transformLbbCompanyForIdea = ({ company, type, caller, contactAllowedOrigin }) => {
  let resultCompany = itemModel(type)

  resultCompany.title = company.enseigne
  let email = encryptMailWithIV({ value: company.email !== "null" ? company.email : "", caller })

  resultCompany.contact = {
    ...email,
  }

  if (contactAllowedOrigin) {
    resultCompany.contact.phone = company.phone
  }

  // format différent selon accès aux bonnes boîtes par recherche ou par siret
  const address = `${company.street_number} ${company.street_name}, ${company.zip_code} ${company.city}`.trim()

  resultCompany.place = {
    distance: company.distance?.length ? Math.round(10 * company.distance[0]) / 10 ?? 0 : null,
    fullAddress: address,
    latitude: company.geo_coordinates.split(",")[0],
    longitude: company.geo_coordinates.split(",")[1],
    city: company.city,
    address,
  }

  resultCompany.company = {
    name: company.enseigne,
    siret: company.siret,
    size: company.company_size,
    //socialNetwork: company.social_network,
    url: company.website,
  }

  //resultCompany.url = company.url;

  /*resultCompany.romes = [
    {
      code: company.matched_rome_code,
      label: company.matched_rome_label,
    },
  ];*/

  resultCompany.nafs = [
    {
      code: company.naf_code,
      label: company.naf_label,
    },
  ]

  return resultCompany
}

const getLbbCompanies = async ({ romes, latitude, longitude, radius, companyLimit, type, caller, opco, api = "jobV1" }) => {
  try {
    const distance = radius || 10

    let mustTerm = [
      {
        match: {
          rome_codes: romes.split(",").join(" "),
        },
      },
      {
        match: {
          algorithm_origin: type,
        },
      },
    ]

    if (opco) {
      mustTerm.push({
        match: {
          opco,
        },
      })
    }

    const esQueryIndexFragment = getBonnesBoitesEsQueryIndexFragment(companyLimit)

    let esQuerySort = {
      sort: [
        latitude || latitude === 0
          ? {
              _geo_distance: {
                geo_coordinates: [parseFloat(longitude), parseFloat(latitude)],
                order: "asc",
                unit: "km",
                mode: "min",
                distance_type: "arc",
                ignore_unmapped: true,
              },
            }
          : "_score",
      ],
    }

    let esQuery = {
      query: {
        bool: {
          must: mustTerm,
        },
      },
    }

    if (latitude || latitude === 0) {
      esQuery.query.bool.filter = {
        geo_distance: {
          distance: `${distance}km`,
          geo_coordinates: {
            lat: latitude,
            lon: longitude,
          },
        },
      }
    } else {
      esQuery = {
        query: {
          function_score: esQuery,
        },
      }
    }

    const responseBonnesBoites = await esClient.search({
      ...esQueryIndexFragment,
      body: {
        ...esQuery,
        ...esQuerySort,
      },
    })

    let bonnesBoites = []

    responseBonnesBoites.body.hits.hits.forEach((bonneBoite) => {
      bonnesBoites.push({ ...bonneBoite._source, distance: latitude || latitude === 0 ? bonneBoite.sort : null })
    })

    if (!latitude && latitude !== 0) {
      bonnesBoites.sort(function (a, b) {
        return a.enseigne.toLowerCase().localeCompare(b.enseigne.toLowerCase())
      })
    }

    return bonnesBoites
  } catch (error) {
    return manageApiError({ error, api_path: api, caller, errorTitle: `getting bonnesBoites from local ES (${api})` })
  }
}

const getCompanyFromSiret = async ({ siret, referer, caller, type }) => {
  try {
    let mustTerm = [
      {
        match: {
          siret,
        },
      },
    ]

    const esQueryIndexFragment = getBonnesBoitesEsQueryIndexFragment(1)

    const responseBonnesBoites = await esClient.search({
      ...esQueryIndexFragment,
      body: {
        query: {
          bool: {
            must: mustTerm,
          },
        },
      },
    })

    let bonnesBoites = []

    responseBonnesBoites.body.hits.hits.forEach((bonneBoite) => {
      bonnesBoites.push({ ...bonneBoite._source, distance: bonneBoite.sort })
    })

    if (responseBonnesBoites.body.hits.hits.length) {
      let company = transformLbbCompanyForIdea({
        company: { ...responseBonnesBoites.body.hits.hits[0]._source, distance: 0 },
        type,
        contactAllowedOrigin: isAllowedSource({ referer, caller }),
        caller,
      })

      return type === "lbb" ? { lbbCompanies: [company] } : { lbaCompanies: [company] }
    } else {
      return { result: "not_found", message: "Société non trouvée" }
    }
  } catch (error) {
    if (error?.response?.status === 404) {
      return { result: "not_found", message: "Société non trouvée" }
    } else {
      return manageApiError({
        error,
        api_path: "jobV1/company",
        caller,
        errorTitle: "getting company by Siret from local ES",
      })
    }
  }
}

const getBonnesBoitesEsQueryIndexFragment = (limit) => {
  return {
    //index: "mnaformation",
    index: "bonnesboites",
    size: limit,
    _source_includes: [
      "siret",
      "recruitment_potential",
      "raison_sociale",
      "enseigne",
      "naf_code",
      "naf_label",
      "rome_codes",
      "street_number",
      "street_name",
      "insee_city_code",
      "zip_code",
      "city",
      "geo_coordinates",
      "email",
      "phone",
      "company_size",
      "algorithm_origin",
    ],
  }
}

export { getSomeLbbCompanies, getCompanyFromSiret }
