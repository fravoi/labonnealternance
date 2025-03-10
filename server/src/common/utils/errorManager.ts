import Sentry from "@sentry/node"
import { ZApiError } from "shared/models"
import { z } from "zod"

import { trackApiCall } from "./sendTrackingEvent"
import { sentryCaptureException } from "./sentryUtils"

export type IApiError = z.input<typeof ZApiError>

/**
 * Process une erreur lors d'un appel vers une API LBAC
 */
export const manageApiError = ({ error, api_path, caller, errorTitle }: { error: any; api_path?: string; caller?: string | null; errorTitle: string }): IApiError => {
  const errorObj: IApiError = { result: "error", error: "error", message: error.message }
  const status = error?.response?.status || error?.status || ""
  error.name = `API error ${status ? status + " " : ""}${errorTitle}`
  if (error?.config) {
    Sentry.setExtra("config", error?.config)
  }
  sentryCaptureException(error)

  if (caller && api_path) {
    trackApiCall({ caller, api_path, response: "Error" })
  }

  if (error.response) {
    errorObj.status = error.response.status
    errorObj.statusText = error.response.statusText
    errorObj.error = error.response.statusText
  } else if (error.status) {
    errorObj.status = status
  }

  console.log(`error ${errorTitle}`, errorObj)

  return errorObj
}
