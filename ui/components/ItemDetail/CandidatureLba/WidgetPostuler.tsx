import { Flex, Spinner } from "@chakra-ui/react"
import axios from "axios"
import React, { useEffect, useState } from "react"

import { initPostulerParametersFromQuery } from "../../../services/config"
import { companyApi, matchaApi } from "../../SearchForTrainingsAndJobs/services/utils"

import WidgetCandidatureLba from "./WidgetCandidatureLba"
import WidgetPostulerError from "./WidgetPostulerError"

const WidgetPostuler = () => {
  useEffect(() => {
    try {
      const parameters = initPostulerParametersFromQuery()
      fetchPostulerItem(parameters)
    } catch (err) {
      setHasError(err.message)
    }
  }, [])

  const fetchPostulerItem = async (parameters) => {
    let item = null

    switch (parameters.type) {
      case "matcha": {
        const response = await axios.get(matchaApi + "/" + parameters.itemId)
        if (!response?.data?.message) {
          item = response.data.matchas[0]
        }

        break
      }

      default: {
        const response = await axios.get(`${companyApi}/${parameters.itemId}?type=${parameters.type}`)
        if (!response?.data?.message) {
          const companies = response.data.lbaCompanies
          item = companies[0]
        }

        break
      }
    }

    if (item) {
      if (!item?.contact?.email || !item?.contact?.iv) {
        setHasError("missing_email")
      } else {
        setCaller(parameters.caller)
        setItem(item)
      }
    } else {
      setHasError("item_not_found")
    }

    setIsLoading(false)
  }

  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(null)
  const [item, setItem] = useState(null)
  const [caller, setCaller] = useState(null)

  return hasError ? (
    <WidgetPostulerError hasError={hasError} />
  ) : isLoading ? (
    <Flex alignItems="center" m="auto" width="250px" my={8}>
      <Spinner mr={4} />
      Veuillez patienter
    </Flex>
  ) : (
    <WidgetCandidatureLba item={item} caller={caller} />
  )
}

export default WidgetPostuler
