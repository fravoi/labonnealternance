// @ts-nocheck
import { db } from "../mongodb.js"

export const components = async (options = {}) => {
  return {
    db: options.db || db,
  }
}

export type Components = Awaited<ReturnType<typeof components>>

export default components
