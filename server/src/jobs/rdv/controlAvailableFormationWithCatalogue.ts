import { oleoduc, writeData } from "oleoduc"
import { logger } from "../../common/logger.js"
import { EligibleTrainingsForAppointment, eligibleTrainingsForAppointmentHistoric, FormationCatalogue } from "../../common/model/index.js"

import dayjs from "../../common/dayjs.js"

/**
 * Check if a training is still available for appointments again it's presence in the training catalogue
 * @return {void}
 */
export const controlAvailableFormationWithCatalogue = async () => {
  logger.info("Cron #controlAvailableFormationWithCatalogue started.")

  const control = await FormationCatalogue.countDocuments()

  if (control === 0) {
    return
  }

  const stats = {
    AncientElligibleTrainingCount: 0,
    NewElligibleTrainingCount: 0,
  }

  stats.AncientElligibleTrainingCount = await EligibleTrainingsForAppointment.countDocuments()

  await oleoduc(
    EligibleTrainingsForAppointment.find({}).lean().cursor(),
    writeData(
      async (formation) => {
        const exist = await FormationCatalogue.findOne({ cle_ministere_educatif: formation.cle_ministere_educatif })

        if (!exist) {
          await eligibleTrainingsForAppointmentHistoric.create({ ...formation, email_rdv: undefined, historization_date: dayjs().format() })
          await EligibleTrainingsForAppointment.findOneAndRemove({ cle_ministere_educatif: formation.cle_ministere_educatif })
        }
      },
      { parallel: 500 }
    )
  )

  stats.NewElligibleTrainingCount = await EligibleTrainingsForAppointment.countDocuments()

  logger.info("Cron #controlAvailableFormationWithCatalogue done.")

  return stats
}
