import { ObjectId } from "mongodb"

import { RECRUITER_STATUS } from "../../../../services/constant.service"
import { IGlobalAddress } from "../_shared/shared.types"
import { IJobs } from "../jobs/jobs.types"

interface IRecruiter {
  _id: ObjectId
  establishment_id: string
  establishment_raison_sociale: string
  establishment_enseigne: string
  establishment_siret: string
  establishment_size: string
  establishment_creation_date: string
  address_detail: IGlobalAddress
  address: string
  geo_coordinates: string
  is_delegated: boolean
  cfa_delegated_siret: string
  last_name: string
  first_name: string
  phone?: string
  email: string
  jobs: IJobs[]
  origin: string
  opco: string
  idcc?: string
  status: RECRUITER_STATUS
  naf_code: string
  naf_label: string
  createdAt: Date
  updatedAt: Date
}

export type { IRecruiter }
