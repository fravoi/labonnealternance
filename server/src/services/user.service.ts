import type { FilterQuery } from "mongoose"

import { Recruiter, User, UserRecruteur } from "../common/model/index"
import { IUser } from "../common/model/schema/user/user.types"
import * as sha512Utils from "../common/utils/sha512Utils"

/**
 * @description Hash password
 * @param {User} user
 * @param {string} password
 * @returns {Promise<IUser>}
 */
const rehashPassword = (user, password: string) => {
  user.password = sha512Utils.hash(password)

  return user.save()
}

/**
 * @description Authenticates user from its username and password.
 * @param {string} username
 * @param {string} password
 * @returns {Promise<null|User>}
 */
const authenticate = async (username: string, password: string): Promise<IUser | null> => {
  const user = await getUser(username)

  if (!user) {
    return null
  }

  const current = user.password
  if (sha512Utils.compare(password, current)) {
    if (sha512Utils.isTooWeak(current)) {
      await rehashPassword(user, password)
    }

    return user.toObject()
  }

  return null
}

/**
 * @description Returns user from its username.
 * @param {string} username
 * @returns {Promise<IUser>}
 */
const getUser = (username: string) => User.findOne({ username })

/**
 * @description Returns user from its email.
 * @param {string} email
 * @returns {Promise<IUser>}
 */
const getUserByMail = (email: string) => User.findOne({ email })

/**
 * @description Returns user from its identifier.
 * @param {string} userId
 * @returns {Promise<IUser>}
 */
const getUserById = (userId: string) => User.findById(userId)

/**
 * @description Updates item.
 * @param {String} id - ObjectId
 * @param {User} params
 * @returns {Promise<User>}
 */
const update = (id: string, params) => User.findOneAndUpdate({ _id: id }, params, { new: true })

/**
 * @description Creates an user.
 * @param {String} username
 * @param {String} password
 * @param {User} options
 * @returns {Promise<User>}
 */
const createUser = async (username, password, options: Partial<IUser & { hash: string }>) => {
  const hash = options.hash || sha512Utils.hash(password)
  const { firstname, lastname, phone, email, role, type } = options

  const user = new User({
    username,
    password: hash,
    firstname,
    lastname,
    phone,
    email,
    role,
    type,
  })

  return user.save()
}

/**
 * @description Returns items.
 * @param {FilterQuery<IUser>} conditions
 * @returns {Promise<User[]>}
 */
const find = (conditions: FilterQuery<IUser>) => User.find(conditions)

/**
 * @description Returns one item.
 * @param {FilterQuery<IUser>} conditions
 * @returns {Promise<User>}
 */
const findOne = (conditions: FilterQuery<IUser>) => User.findOne(conditions)

/**
 * @description Updates user's password.
 * @param {string} username
 * @param {string} newPassword
 * @returns {Promise<IUser>}
 */
const changePassword = async (username: string, newPassword: string) => {
  const user = await User.findOne({ username })
  if (!user) {
    throw new Error(`Unable to find user ${username}`)
  }

  user.password = sha512Utils.hash(newPassword)

  return user.save()
}

const getUserAndRecruitersDataForOpcoUser = async (opco, userState) => {
  const [users, recruiters] = await Promise.all([
    UserRecruteur.find({
      $expr: { $eq: [{ $arrayElemAt: ["$status.status", -1] }, userState] },
      opco: opco,
    }).lean(),
    Recruiter.find({ opco: opco }).lean(),
  ])

  const results = users.reduce((acc: any[], user) => {
    acc.push({ ...user })
    const form = recruiters.find((x) => x.establishment_id === user.establishment_id)

    if (form) {
      const found = acc.findIndex((x) => x.establishment_id === form.establishment_id)

      if (found !== -1) {
        acc[found].jobs_count = form.jobs.length ?? 0
        acc[found].origin = form.origin
        acc[found].jobs = form.jobs ?? []
      }
    }

    return acc
  }, [])
  return results
}

export { authenticate, changePassword, createUser, find, findOne, getUser, getUserAndRecruitersDataForOpcoUser, getUserById, getUserByMail, rehashPassword, update }
