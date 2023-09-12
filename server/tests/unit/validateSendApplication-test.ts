import chai from "chai"
const expect = chai.expect

import chaiAsPromised from "chai-as-promised"
chai.use(chaiAsPromised)

import __filename from "../../src/common/filename.js"
import { validateCompanyEmail, validatePermanentEmail, validateSendApplication } from "../../src/services/application.service.js"

import { decryptWithIV } from "../../src/common/utils/encryptString.js"

describe(__filename(import.meta.url), () => {
  it("validateSendApplication : Echoue si mauvais argument passé en param", async () => {
    expect(await validateSendApplication({})).to.equal("données de candidature invalides")
  })
  it("validateSendApplication : Echoue si un des champs ne passe pas la validation", async () => {
    expect(await validateSendApplication({ applicant_last_name: "too long applicant_last_name, more than 50 characters, will fail" })).to.equal("données de candidature invalides")
  })
  it("validateSendApplication : Echoue si un l'email est d'une boîte temporaire", async () => {
    expect(await validatePermanentEmail({ applicant_email: "test@10minutemail.com" })).to.equal("email temporaire non autorisé")
  })
  it("validateSendApplication : Succès si l'email n'est pas d'une boîte temporaire", async () => {
    expect(await validatePermanentEmail({ applicant_email: "test@gmail.com" })).to.equal("ok")
  })
  it("validateSendApplication : Passe si tous les champs sont valides", async () => {
    expect(
      await validateSendApplication({
        applicant_first_name: "jane",
        applicant_file_content: "0",
        applicant_last_name: "doe",
        applicant_file_name: "any.pdf",
        applicant_email: "jane.doe@example.com",
        applicant_phone: "0606060606",
      })
    ).to.equal("ok")
  })
  it("validateCompanyEmail : Passe si emails cryptés valides", async () => {
    const companyEmail = decryptWithIV("28b99996da3c4ae72df064bec394754a3791", "1ac16072b289a73dc1c940b06d728933")

    expect(
      await validateCompanyEmail({
        company_email: companyEmail,
        crypted_email: companyEmail,
      })
    ).to.equal("ok")
  })
  it("validateCompanyEmail : Passe si emails cryptés valides", async () => {
    const companyEmail = decryptWithIV("fake_crypted_email", "1ac16072b289a73dc1c940b06d728933")

    expect(
      await validateCompanyEmail({
        company_email: companyEmail,
        crypted_email: companyEmail,
      })
    ).to.equal("email société invalide")
  })
})
