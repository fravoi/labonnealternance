import { Readable } from "stream"

import { oleoduc, writeData } from "oleoduc"
import { referrers } from "shared/constants/referers"

import { logger } from "../../common/logger"
import { Etablissement } from "../../common/model/index"
import { isEmailBlacklisted } from "../../services/application.service"
import { affelnetSelectedFields, getEmailFromCatalogueField, getFormationsFromCatalogueMe } from "../../services/catalogue.service"
import dayjs from "../../services/dayjs.service"
import * as eligibleTrainingsForAppointmentService from "../../services/eligibleTrainingsForAppointment.service"

/**
 * @description Gets Catalogue etablissments informations and insert in etablissement collection.
 * @returns {Promise<void>}
 */
export const syncAffelnetFormationsFromCatalogueME = async () => {
  logger.info("Cron #syncEtablissementsAndFormationsAffelnet started.")

  const catalogueMinistereEducatif = await getFormationsFromCatalogueMe({
    limit: 500,
    query: {
      affelnet_perimetre: true,
      cle_ministere_educatif: { $ne: null },
      affelnet_statut: { $in: ["publié", "en attente de publication"] },
    },
    select: affelnetSelectedFields,
  })

  await oleoduc(
    Readable.from(catalogueMinistereEducatif),
    writeData(
      async (formation) => {
        const [eligibleTrainingsForAppointment, etablissement] = await Promise.all([
          eligibleTrainingsForAppointmentService.findOne({
            cle_ministere_educatif: formation.cle_ministere_educatif,
          }),
          Etablissement.findOne({ formateur_siret: formation.etablissement_formateur_siret }),
        ])

        const referrersToActivate = eligibleTrainingsForAppointment?.referrers || []

        // Activate "Premium Affelnet" referrers
        if (etablissement?.premium_affelnet_activation_date && !referrersToActivate.includes(referrers.AFFELNET.name)) {
          referrersToActivate.push(referrers.AFFELNET.name)
        }

        if (eligibleTrainingsForAppointment) {
          let emailRdv = eligibleTrainingsForAppointment.lieu_formation_email
          let emailBlacklisted
          // Don't override "email" if is_lieu_formation_email_customized is true
          if (!eligibleTrainingsForAppointment?.is_lieu_formation_email_customized) {
            emailRdv = await eligibleTrainingsForAppointmentService.getEmailForRdv({
              email: formation.email,
              etablissement_formateur_courriel: formation.etablissement_formateur_courriel,
              etablissement_formateur_siret: formation.etablissement_formateur_siret,
            })
          }

          if (emailRdv) {
            emailBlacklisted = await isEmailBlacklisted(emailRdv)
          }

          await eligibleTrainingsForAppointmentService.updateMany(
            { cle_ministere_educatif: formation.cle_ministere_educatif },
            {
              training_id_catalogue: formation._id,
              lieu_formation_email: emailRdv,
              parcoursup_id: formation.parcoursup_id,
              cle_ministere_educatif: formation.cle_ministere_educatif,
              training_code_formation_diplome: formation.cfd,
              etablissement_formateur_zip_code: formation.etablissement_formateur_code_postal,
              training_intitule_long: formation.intitule_long,
              referrers: emailRdv && !emailBlacklisted ? referrersToActivate : [],
              is_catalogue_published: formation.published,
              rco_formation_id: formation.id_rco_formation,
              last_catalogue_sync_date: dayjs().format(),
              lieu_formation_street: formation.lieu_formation_adresse,
              lieu_formation_city: formation.localite,
              lieu_formation_zip_code: formation.code_postal,
              etablissement_formateur_raison_sociale: formation.etablissement_formateur_entreprise_raison_sociale,
              etablissement_formateur_street: formation.etablissement_formateur_adresse,
              departement_etablissement_formateur: formation.etablissement_formateur_nom_departement,
              etablissement_formateur_city: formation.etablissement_formateur_localite,
              etablissement_formateur_siret: formation.etablissement_formateur_siret,
              etablissement_gestionnaire_siret: formation.etablissement_gestionnaire_siret,
            }
          )
        } else {
          const emailRdv = await eligibleTrainingsForAppointmentService.getEmailForRdv({
            email: formation.email,
            etablissement_formateur_courriel: formation.etablissement_formateur_courriel,
            etablissement_formateur_siret: formation.etablissement_formateur_siret,
          })
          let emailBlacklisted

          if (emailRdv) {
            emailBlacklisted = await isEmailBlacklisted(emailRdv)
          }

          await eligibleTrainingsForAppointmentService.create({
            training_id_catalogue: formation._id,
            lieu_formation_email: emailRdv,
            parcoursup_id: formation.parcoursup_id,
            cle_ministere_educatif: formation.cle_ministere_educatif,
            training_code_formation_diplome: formation.cfd,
            training_intitule_long: formation.intitule_long,
            referrers: emailRdv && !emailBlacklisted ? referrersToActivate : [],
            is_catalogue_published: formation.published,
            rco_formation_id: formation.id_rco_formation,
            lieu_formation_street: formation.lieu_formation_adresse,
            lieu_formation_city: formation.localite,
            lieu_formation_zip_code: formation.code_postal,
            etablissement_formateur_raison_sociale: formation.etablissement_formateur_entreprise_raison_sociale,
            etablissement_formateur_street: formation.etablissement_formateur_adresse,
            etablissement_formateur_zip_code: formation.etablissement_formateur_code_postal,
            departement_etablissement_formateur: formation.etablissement_formateur_nom_departement,
            etablissement_formateur_city: formation.etablissement_formateur_localite,
            etablissement_formateur_siret: formation.etablissement_formateur_siret,
            etablissement_gestionnaire_siret: formation.etablissement_gestionnaire_siret,
          })
        }

        const emailDecisionnaire = getEmailFromCatalogueField(formation.etablissement_gestionnaire_courriel)?.toLowerCase() || etablissement?.gestionnaire_email

        // Update etablissement model (upsert)
        return Etablissement.updateMany(
          {
            formateur_siret: formation.etablissement_formateur_siret,
          },
          {
            affelnet_perimetre: true,
            gestionnaire_siret: formation.etablissement_gestionnaire_siret,
            gestionnaire_email: emailDecisionnaire,
            raison_sociale: formation.etablissement_formateur_entreprise_raison_sociale,
            formateur_siret: formation.etablissement_formateur_siret,
            formateur_address: formation.etablissement_formateur_adresse,
            formateur_zip_code: formation.etablissement_formateur_code_postal,
            formateur_city: formation.etablissement_formateur_localite,
            last_catalogue_sync_date: dayjs().toDate(),
          }
        )
      },
      { parallel: 500 }
    )
  )

  logger.info("Cron #syncEtablissementsAndFormationsAffelnet done.")
}
