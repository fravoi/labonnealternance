import { z } from "zod"

import { ZJob } from "../models/job.model"
import { ZUserRecruteur, ZUserStatusValidation } from "../models/usersRecruteur.model"

export const zUserRecruteurRoutes = {
  get: {
    "/api/user/opco": {
      queryString: z
        .object({
          userQuery: z.string() /* mongo query */,
          formulaireQuery: z.string() /* mongo query */,
        })
        .strict(),
      response: {
        "200": z.array(
          ZUserRecruteur.extend({
            offres: z.number(), // toujours 0, wtf ?
            jobs: z.number().optional(),
            origin: z.string().optional(),
            job_detail: z.array(ZJob).optional(),
          }).strict()
        ),
      },
    },
    "/api/user": {
      queryString: z
        .object({
          users: z.string() /* mongo query */,
        })
        .strict(),
      response: {
        "200": z.array(ZUserRecruteur),
      },
    },
  },
  post: {
    "/api/user": {
      body: ZUserRecruteur.extend({
        scope: z.string().optional(),
      }).strict(),
      response: {
        "200": ZUserRecruteur,
      },
    },
  },
  put: {
    "/api/user/:userId": {
      body: ZUserRecruteur.pick({
        last_name: true,
        first_name: true,
        phone: true,
        email: true,
        opco: true,
      })
        .partial()
        .strict(),
      response: {
        "200": ZUserRecruteur,
      },
    },
    "/api/user/:userId/history": {
      queryString: ZUserStatusValidation,
      response: {
        "200": ZUserRecruteur,
      },
    },
  },
  delete: {
    "/api/user": {
      queryString: z
        .object({
          userId: z.string(),
          recruiterId: z.string().optional(),
        })
        .strict(),
      response: {
        "200": null,
      },
    },
  },
}
