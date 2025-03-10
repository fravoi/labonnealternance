import { readFile, writeFile } from "node:fs/promises"

import { IEligibleTrainingsForAppointment } from "shared"

import { logger } from "../../../common/logger"
import { EligibleTrainingsForAppointment } from "../../../common/model/index"
import { asyncForEach } from "../../../common/utils/asyncUtils"
import { runScript } from "../../scriptWrapper"
import { syncEtablissementsAndFormations } from "../syncEtablissementsAndFormations"
import { syncAffelnetFormationsFromCatalogueME } from "../syncEtablissementsAndFormationsAffelnet"

type TWidgetParametersSelected = Pick<IEligibleTrainingsForAppointment, "cle_ministere_educatif" | "lieu_formation_email" | "is_lieu_formation_email_customized">

/**
 * @description save custom email in a JSON file locally
 * @param filePath
 * @returns {Promise<void>}
 */
const saveCustomEmailFromWidgetParameters = async (filePath: URL) => {
  const saveCustomeEmails = await EligibleTrainingsForAppointment.find({
    is_lieu_formation_email_customized: true,
  }).select({ cle_ministere_educatif: 1, is_lieu_formation_email_customized: 1, lieu_formation_email: 1 })

  try {
    await writeFile(filePath, JSON.stringify(saveCustomeEmails))
    return true
  } catch (error) {
    console.error(error)
    return false
  }
}

/**
 * @description sync saved contacts with the refreshed collection
 * @param filePath
 * @return {Promise<void>}
 */
const syncCustomEmail = async (filePath: URL): Promise<void> => {
  const customEmailList: TWidgetParametersSelected[] = JSON.parse(await readFile(filePath, { encoding: "utf-8" }))
  await asyncForEach(customEmailList, async (item: TWidgetParametersSelected) => {
    await EligibleTrainingsForAppointment.updateOne(
      { cle_ministere_educatif: item.cle_ministere_educatif },
      { is_lieu_formation_email_customized: true, lieu_formation_email: item.lieu_formation_email }
    )
  })
}

runScript(async () => {
  logger.info("Start EligibleTrainingsForAppointment reset")
  const countBefore = await EligibleTrainingsForAppointment.countDocuments()
  const filePath = new URL("./customEmails.json", import.meta.url)

  logger.info("Generating custom email backup")
  const dataSaved = await saveCustomEmailFromWidgetParameters(filePath)

  if (dataSaved) {
    logger.info("Data saved, starting reset.")
    await EligibleTrainingsForAppointment.deleteMany({})
    await syncEtablissementsAndFormations()
    await syncAffelnetFormationsFromCatalogueME()
    const countAfter = await EligibleTrainingsForAppointment.countDocuments()
    logger.info(`count updated: ${countAfter} (before: ${countBefore})`)
    logger.info("Updating custom email from backup.")
    await syncCustomEmail(filePath)
    logger.info("Reset done.")
  }
  logger.info("End EligibleTrainingsForAppointment reset")
})
