import { IOptout } from "shared"

import { model, Schema } from "../../../mongodb"
import { mongoosePagination, Pagination } from "../_shared/mongoose-paginate"

export const optoutSchema = new Schema<IOptout>(
  {
    etat: {
      type: String,
      description: "Etat administratif de l'organisme de formation",
    },
    uai: {
      type: [String],
      description: "UAI potentiel de l'organisme de formation",
    },
    rue: {
      type: String,
      description: "Rue de l'organisme de formation",
    },
    code_postal: {
      type: String,
      description: "Code postal de l'organisme de formation",
    },
    commune: {
      type: String,
      description: "Commune de l'organisme de formation",
    },
    siret: {
      type: String,
      description: "Numéro SIRET de l'organisme de formation",
    },
    contacts: {
      type: [Object],
      description: "liste des contacts",
    },
    qualiopi: {
      type: Boolean,
      description: "Certification QUALIOPI",
    },
    raison_sociale: {
      type: String,
      default: null,
      description: "Raison social de l'entreprise",
    },
    adresse: {
      type: String,
      default: null,
      description: "Adresse de l'entreprise",
    },
    geo_coordonnees: {
      type: String,
      default: null,
      description: "Latitude/Longitude (inversion lié à LBA) de l'adresse de l'entreprise",
    },
    mail: {
      type: [
        {
          email: {
            type: String,
          },
          messageId: {
            type: String,
          },
          date: {
            type: Date,
            default: () => new Date(),
          },
        },
      ],
      description: "Interaction avec les contacts",
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
)

optoutSchema.plugin(mongoosePagination)

export default model<IOptout, Pagination<IOptout>>("optout", optoutSchema)
