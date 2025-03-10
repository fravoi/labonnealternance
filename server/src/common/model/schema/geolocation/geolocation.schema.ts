import { model, Schema } from "../../../mongodb"

import { IGeolocation } from "./geolocation.types"

export const geolocationSchema = new Schema<IGeolocation>(
  {
    address: {
      type: String,
      default: null,
      description: "L'adresse d'un établissement",
      index: true,
      unique: true,
    },
    city: {
      type: String,
      default: null,
      description: "Ville",
    },
    zip_code: {
      type: String,
      default: null,
      description: "Code postal",
    },
    geo_coordinates: {
      type: String,
      default: null,
      description: "Les coordonnées latitude et longitude",
    },
  },
  {
    versionKey: false,
  }
)

export default model<IGeolocation>("geolocation", geolocationSchema)
