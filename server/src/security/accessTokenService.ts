import Boom from "boom"
import jwt from "jsonwebtoken"
import { PathParam, QueryString } from "shared/helpers/generateUri"
import { IUserRecruteur } from "shared/models"
import { IRouteSchema, WithSecurityScheme } from "shared/routes/common.routes"
import { assertUnreachable } from "shared/utils"
import { Jsonify } from "type-fest"
import { AnyZodObject, z } from "zod"

import { sentryCaptureException } from "@/common/utils/sentryUtils"
import config from "@/config"

// cf https://www.sistrix.com/ask-sistrix/technical-seo/site-structure/url-length-how-long-can-a-url-be
const INTERNET_EXPLORER_V10_MAX_LENGTH = 2083
const OUTLOOK_URL_MAX_LENGTH = 8192
const NGINX_URL_MAX_LENGTH = 4096
const URL_MAX_LENGTH = Math.min(INTERNET_EXPLORER_V10_MAX_LENGTH, OUTLOOK_URL_MAX_LENGTH, NGINX_URL_MAX_LENGTH)
const TOKEN_MAX_LENGTH = URL_MAX_LENGTH - (config.publicUrl.length + 1) // +1 for slash character

export type SchemaWithSecurity = Pick<IRouteSchema, "method" | "path" | "params" | "querystring"> & WithSecurityScheme

type AllowAllType = { allowAll: true }
type AuthorizedValuesRecord<ZodObject> = ZodObject extends AnyZodObject
  ? {
      [Key in keyof Jsonify<z.input<ZodObject>>]: Jsonify<z.input<ZodObject>>[Key] | AllowAllType
    }
  : undefined

// TODO à retirer à partir du 01/02/2024
type OldIScope<Schema extends SchemaWithSecurity> = {
  schema: Schema
  options:
    | "all"
    | {
        params: AuthorizedValuesRecord<Schema["params"]>
        querystring: AuthorizedValuesRecord<Schema["querystring"]>
      }
}

type NewIScope<Schema extends SchemaWithSecurity> = {
  method: Schema["method"]
  path: Schema["path"]
  options:
    | "all"
    | {
        params: AuthorizedValuesRecord<Schema["params"]>
        querystring: AuthorizedValuesRecord<Schema["querystring"]>
      }
}

type IScope<Schema extends SchemaWithSecurity> = NewIScope<Schema> | OldIScope<Schema>

export const generateScope = <Schema extends SchemaWithSecurity>(scope: Omit<NewIScope<Schema>, "method" | "path"> & { schema: Schema }): NewIScope<Schema> => {
  const { schema, options } = scope
  return { options, path: schema.path, method: schema.method }
}

export type IAccessToken<Schema extends SchemaWithSecurity = SchemaWithSecurity> = {
  identity:
    | {
        type: "IUserRecruteur"
        _id: string
        email: string
      }
    | {
        type: "cfa"
        email: string
        siret: string
      }
    | { type: "lba-company"; siret: string; email: string }
  scopes: ReadonlyArray<IScope<Schema>>
}

export function generateAccessToken(
  user: IUserRecruteur | IAccessToken["identity"],
  scopes: ReadonlyArray<NewIScope<SchemaWithSecurity>>,
  options: { expiresIn?: string } = {}
): string {
  const identity: IAccessToken["identity"] = "_id" in user ? { type: "IUserRecruteur", _id: user._id.toString(), email: user.email.toLowerCase() } : user
  const data: IAccessToken<SchemaWithSecurity> = {
    identity,
    scopes,
  }

  const token = jwt.sign(data, config.auth.user.jwtSecret, {
    expiresIn: options.expiresIn ?? config.auth.user.expiresIn,
    issuer: config.publicUrl,
  })
  if (token.length > TOKEN_MAX_LENGTH) {
    sentryCaptureException(Boom.internal(`Token généré trop long : ${token.length}`))
  }
  return token
}

function getMethodAndPath<Schema extends SchemaWithSecurity>(scope: IScope<Schema>) {
  if ("schema" in scope) {
    const { schema } = scope
    const { method, path } = schema
    return { method, path }
  } else if ("method" in scope && "path" in scope) {
    const { method, path } = scope
    return { method, path }
  } else {
    assertUnreachable(scope)
  }
}

function isAllowAllValue(x: unknown): x is AllowAllType {
  return !!x && typeof x === "object" && "allowAll" in x && x.allowAll === true
}

function isAuthorizedParam(requiredValue: string, allowedValue: string | undefined | AllowAllType) {
  return requiredValue === allowedValue || isAllowAllValue(allowedValue)
}

export function getAccessTokenScope<Schema extends SchemaWithSecurity>(
  token: IAccessToken<Schema> | null,
  schema: Schema,
  params: PathParam | undefined,
  querystring: QueryString | undefined
): IScope<Schema> | null {
  return (
    token?.scopes.find((scope) => {
      const { method, path } = getMethodAndPath(scope)
      if (path !== schema.path || method !== schema.method) {
        return false
      }

      if (scope.options === "all") {
        return true
      }

      if (params) {
        const allowedParams = scope.options.params
        const isAuthorized = Object.entries(params).every(([key, requiredValue]) => {
          const allowedParam = allowedParams?.[key]
          return isAuthorizedParam(requiredValue, allowedParam)
        })
        if (!isAuthorized) {
          return false
        }
      }

      if (querystring) {
        const allowedQueryString = scope.options.querystring
        const isAuthorized = Object.entries(querystring).every(([key, value]) => {
          const requiredValues = Array.isArray(value) ? new Set(value) : new Set([value])
          const allowedValues = (allowedQueryString?.[key] ?? []) as string[] | string | AllowAllType
          if (isAllowAllValue(allowedValues)) {
            return true
          }

          if (Array.isArray(allowedValues)) {
            for (const allowedValue of allowedValues) {
              requiredValues.delete(allowedValue)
            }
          } else {
            requiredValues.delete(allowedValues)
          }

          return requiredValues.size === 0
        })
        if (!isAuthorized) {
          return false
        }
      }

      return true
    }) ?? null
  )
}

export function parseAccessToken<Schema extends SchemaWithSecurity>(
  accessToken: string,
  schema: Schema,
  params: PathParam | undefined,
  querystring: QueryString | undefined
): IAccessToken<Schema> {
  const data = jwt.verify(accessToken, config.auth.user.jwtSecret, {
    complete: true,
    issuer: config.publicUrl,
  })
  const token = data.payload as IAccessToken<Schema>
  const scopeOpt = getAccessTokenScope(token, schema, params, querystring)
  if (!scopeOpt) {
    throw Boom.forbidden("Aucun scope ne correspond")
  }
  return token
}
